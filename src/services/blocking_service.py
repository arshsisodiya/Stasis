import threading
import time
import psutil
from datetime import datetime, timedelta

from src.database.database import get_blocked_app_names
from src.core.desktop_notifications import desktop_notifier
from src.config.ignored_apps_manager import is_ignored
from src.config.settings_manager import SettingsManager
from src.config.category_manager import get_category
from src.utils.time_utils import format_duration

LIMIT_CHECK_INTERVAL = 15
PROCESS_CHECK_INTERVAL = 2


class BlockingService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(BlockingService, cls).__new__(cls)
                cls._instance.initialized = False
            return cls._instance

    def __init__(self):
        if self.initialized:
            return

        self.running = False
        self.blocked_apps = set()
        self._blocked_apps_lock = threading.Lock()

        self.limit_thread = None
        self.guard_thread = None
        self.last_goal_check_ts = 0.0
        self.goal_state = {}

        self.initialized = True

    def start(self):
        if self.running:
            return

        self.running = True

        # Load initial blocked apps into memory cache
        try:
            self.blocked_apps = set(get_blocked_app_names())
        except Exception:
            self.blocked_apps = set()

        self.limit_thread = threading.Thread(
            target=self._limit_monitor,
            daemon=True,
            name="LimitMonitor"
        )
        self.guard_thread = threading.Thread(
            target=self._process_guard,
            daemon=True,
            name="ProcessGuard"
        )

        self.limit_thread.start()
        self.guard_thread.start()

        print("Blocking Service started")

    def stop(self):
        self.running = False

    def force_reblock(self, app_name: str):
        with self._blocked_apps_lock:
            self.blocked_apps.add(app_name)

    def force_unblock(self, app_name: str):
        with self._blocked_apps_lock:
            self.blocked_apps.discard(app_name)

    # ─── LIMIT MONITOR ────────────────────────────────────────────────────────
    def _limit_monitor(self):
        """
        Evaluates app usage against limits every LIMIT_CHECK_INTERVAL seconds.

        Key design: all reads + writes for ONE cycle share a SINGLE connection
        and are committed in ONE transaction. Previously, each helper function
        (clear_expired_unblocks, get_all_limits, get_today_usage,
        add/remove_blocked_app) opened its own connection — up to 8 per cycle —
        which raced with Flask API writes and caused 'database is locked'.
        """
        from src.database.database import get_connection

        while self.running:
            try:
                now = datetime.now()
                now_iso = now.isoformat()
                today = now.date().isoformat()

                conn = get_connection()
                try:
                    cursor = conn.cursor()

                    # 1. Expire any temporary unblocks in one shot
                    cursor.execute("""
                        UPDATE app_limits
                        SET unblock_until = NULL
                        WHERE unblock_until IS NOT NULL
                          AND unblock_until <= ?
                    """, (now_iso,))

                    # 2. Fetch all limits (single read)
                    cursor.execute("""
                        SELECT app_name, daily_limit_seconds, is_enabled, unblock_until
                        FROM app_limits
                    """)
                    limits = cursor.fetchall()

                    new_blocked = set()

                    for app_name, daily_limit, is_enabled, unblock_until in limits:

                        # Paused limit → never blocked
                        if not is_enabled:
                            cursor.execute(
                                """
                                UPDATE app_limits
                                SET is_blocked = 0,
                                    blocked_at = NULL
                                WHERE app_name = ?
                                """,
                                (app_name,)
                            )
                            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ?", (app_name,))
                            continue

                        # Still within a temporary unblock window
                        if unblock_until:
                            try:
                                if now < datetime.fromisoformat(unblock_until):
                                    cursor.execute(
                                        """
                                        UPDATE app_limits
                                        SET is_blocked = 0,
                                            blocked_at = NULL
                                        WHERE app_name = ?
                                        """,
                                        (app_name,)
                                    )
                                    cursor.execute("DELETE FROM blocked_apps WHERE app_name = ?", (app_name,))
                                    continue
                            except Exception:
                                pass

                        # 3. Today's usage for this app (same connection, no extra open/close)
                        cursor.execute("""
                            SELECT COALESCE(SUM(active_seconds), 0)
                            FROM activity_logs
                            WHERE app_name = ? AND timestamp LIKE ?
                        """, (app_name, f"{today}%"))
                        usage = cursor.fetchone()[0] or 0

                        if usage >= daily_limit:
                            # Log limit hit event if newly blocked
                            was_blocked = app_name in self.blocked_apps
                            now_str = now.isoformat()
                            cursor.execute(
                                """
                                UPDATE app_limits
                                SET is_blocked = 1,
                                    blocked_at = ?
                                WHERE app_name = ?
                                """,
                                (now_str, app_name)
                            )
                            cursor.execute(
                                "INSERT OR REPLACE INTO blocked_apps (app_name, blocked_at) VALUES (?, ?)",
                                (app_name, now_str)
                            )
                            new_blocked.add(app_name)
                            if not was_blocked:
                                try:
                                    from src.database.database import log_limit_event
                                    log_limit_event(app_name, "hit", old_value=daily_limit, new_value=usage)
                                except Exception:
                                    pass
                                over_by = max(0, int(usage - daily_limit))
                                desktop_notifier.notify(
                                    title=f"🔴 Limit Exceeded: {app_name}",
                                    message=(
                                        f"Used {format_duration(usage)} (limit {format_duration(daily_limit)}). "
                                        f"You are {format_duration(over_by)} over."
                                    ),
                                    event_key=f"limit-hit:{today}:{app_name}",
                                    cooldown_seconds=60,
                                    event_type=desktop_notifier.EVENT_LIMIT,
                                    priority="critical",
                                    actions=[
                                        ("Snooze 15m", desktop_notifier.build_action_url("snooze-limit", minutes=15)),
                                        ("Snooze 1h", desktop_notifier.build_action_url("snooze-limit", minutes=60)),
                                        ("Extend 10m", desktop_notifier.build_action_url("extend-limit", app=app_name, minutes=10)),
                                        ("Keep blocked", desktop_notifier.build_action_url("keep-blocked", app=app_name)),
                                    ],
                                    launch_url=desktop_notifier.build_action_url("open-limits"),
                                )
                        else:
                            cursor.execute(
                                """
                                UPDATE app_limits
                                SET is_blocked = 0,
                                    blocked_at = NULL
                                WHERE app_name = ?
                                """,
                                (app_name,)
                            )
                            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ?", (app_name,))

                    # Single commit for the entire cycle
                    conn.commit()

                    # Evaluate goal thresholds at most once per minute (same DB connection).
                    now_ts = time.time()
                    if now_ts - self.last_goal_check_ts >= 60:
                        self._check_goal_notifications(cursor, today)
                        self._check_daily_digest(cursor, now, today)
                        self.last_goal_check_ts = now_ts

                    with self._blocked_apps_lock:
                        self.blocked_apps = new_blocked

                finally:
                    conn.close()

            except Exception as e:
                if "locked" in str(e).lower():
                    time.sleep(0.2)
                    continue
                print("LimitMonitor error:", e)
            time.sleep(LIMIT_CHECK_INTERVAL)

    def _check_goal_notifications(self, cursor, date: str):
        cursor.execute(
            """
            SELECT id, goal_type, COALESCE(label, ''), target_value, target_unit, direction
            FROM goals
            WHERE is_active = 1
            """
        )
        goals = cursor.fetchall()

        if not goals:
            return

        for goal_id, goal_type, label, target_value, target_unit, direction in goals:
            actual = self._compute_goal_actual(cursor, date, goal_type)
            threshold_reached = actual >= target_value

            state_key = (goal_id, date)
            previous_state = self.goal_state.get(state_key)
            self.goal_state[state_key] = threshold_reached

            # Notify on first check if already at/over threshold, or on later transitions.
            should_notify = False
            if previous_state is None and threshold_reached:
                should_notify = True
            elif previous_state is not None and previous_state != threshold_reached:
                should_notify = True
            
            if not should_notify:
                continue

            # Mapping technical goal type names to human-friendly labels
            friendly_names = {
                "daily_screen_time": "Screen Time",
                "daily_productive_time": "Productive Time",
                "daily_productivity_pct": "Productivity Score",
                "daily_focus_score": "Focus Score"
            }
            goal_name = label or friendly_names.get(goal_type, goal_type.replace("_", " ").title())
            target_str = self._format_target(target_value, target_unit)
            actual_str = self._format_target(actual, target_unit)

            if direction == "under" and threshold_reached:
                desktop_notifier.notify(
                    title=f"⚠️ {goal_name} Limit Reached",
                    message=f"You've reached your {goal_name} target of {target_str}. Currently at {actual_str}.",
                    event_key=f"goal-threshold:{goal_id}:{date}",
                    cooldown_seconds=600,
                    event_type=desktop_notifier.EVENT_GOAL,
                    actions=[
                        ("Open Goals", desktop_notifier.build_action_url("open-goals")),
                    ],
                    launch_url=desktop_notifier.build_action_url("open-goals"),
                )
            elif direction != "under" and threshold_reached:
                desktop_notifier.notify(
                    title=f"🎯 {goal_name} Achieved!",
                    message=f"Excellent! You reached your {goal_name} goal of {target_str}. Currently: {actual_str}.",
                    event_key=f"goal-met:{goal_id}:{date}",
                    cooldown_seconds=600,
                    event_type=desktop_notifier.EVENT_GOAL,
                    actions=[
                        ("Open Goals", desktop_notifier.build_action_url("open-goals")),
                    ],
                    launch_url=desktop_notifier.build_action_url("open-goals"),
                )

        # Keep only today's state to avoid unbounded growth.
        self.goal_state = {k: v for k, v in self.goal_state.items() if k[1] == date}

    @staticmethod
    def _compute_goal_actual(cursor, date: str, goal_type: str) -> float:
        if goal_type == "daily_screen_time":
            cursor.execute(
                """
                SELECT app_name, COALESCE(SUM(active_seconds), 0)
                FROM daily_stats
                WHERE date = ?
                GROUP BY app_name
                """,
                (date,),
            )
            return float(sum(active for app_name, active in cursor.fetchall() if not is_ignored(app_name)))

        if goal_type == "daily_productive_time":
            cursor.execute(
                """
                SELECT app_name, COALESCE(SUM(active_seconds), 0)
                FROM daily_stats
                WHERE date = ? AND main_category = 'productive'
                GROUP BY app_name
                """,
                (date,),
            )
            return float(sum(active for app_name, active in cursor.fetchall() if not is_ignored(app_name)))

        if goal_type == "daily_productivity_pct":
            cursor.execute(
                """
                SELECT app_name, main_category, COALESCE(SUM(active_seconds), 0)
                FROM daily_stats
                WHERE date = ?
                GROUP BY app_name, main_category
                """,
                (date,),
            )
            total = 0.0
            productive = 0.0
            for app_name, category, active in cursor.fetchall():
                if is_ignored(app_name):
                    continue
                total += float(active or 0)
                if category == "productive":
                    productive += float(active or 0)
            if total <= 0:
                return 0.0
            return round((productive / total) * 100, 1)

        if goal_type == "daily_focus_score":
            try:
                cursor.execute(
                    """
                    SELECT focus_score
                    FROM focus_sessions
                    WHERE date = ?
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (date,),
                )
                row = cursor.fetchone()
                return float(row[0]) if row and row[0] is not None else 0.0
            except Exception:
                return 0.0

        return 0.0

    @staticmethod
    def _format_target(value: float, unit: str) -> str:
        if unit == "seconds":
            return format_duration(value)
        if unit == "percent":
            return f"{round(value, 1)}%"
        return str(round(value, 1))

    def _check_daily_digest(self, cursor, now: datetime, date: str):
        if not SettingsManager.get_bool("notifications_enable_digest_events", True):
            return

        digest_time = (SettingsManager.get("notifications_daily_digest_time") or "21:00").strip()
        try:
            digest_h, digest_m = [int(x) for x in digest_time.split(":", 1)]
        except Exception:
            digest_h, digest_m = 21, 0

        if (now.hour, now.minute) < (digest_h, digest_m):
            return

        if (SettingsManager.get("notifications_digest_last_sent_date") or "") == date:
            return

        summary = self._build_daily_digest_summary(cursor, date)
        if not summary:
            return

        sent = desktop_notifier.notify(
            title="End-of-day summary",
            message=summary,
            event_key=f"daily-digest:{date}",
            cooldown_seconds=3600,
            event_type=desktop_notifier.EVENT_DIGEST,
            actions=[("Review day", desktop_notifier.build_action_url("open-review-day"))],
            launch_url=desktop_notifier.build_action_url("open-review-day"),
        )
        if sent:
            SettingsManager.set("notifications_digest_last_sent_date", date)

    def get_daily_digest_data(self, date: str = None) -> dict | None:
        """
        Returns structured data for the daily digest.
        """
        from src.database.database import get_connection
        if not date:
            date = datetime.now().date().isoformat()

        conn = get_connection()
        try:
            cursor = conn.cursor()
            
            # 1. Basic Stats & Categories
            cursor.execute(
                """
                SELECT app_name, main_category, COALESCE(SUM(active_seconds), 0)
                FROM daily_stats
                WHERE date = ?
                GROUP BY app_name, main_category
                """,
                (date,),
            )
            rows = cursor.fetchall()
            if not rows:
                return None

            total_active = 0.0
            productive = 0.0
            distraction = 0.0
            distract_by_app: dict[str, float] = {}
            all_apps: dict[str, float] = {}
            categories: dict[str, float] = {}

            for app_name, main_category, seconds in rows:
                if is_ignored(app_name):
                    continue
                secs = float(seconds or 0)
                total_active += secs
                all_apps[app_name] = all_apps.get(app_name, 0.0) + secs
                
                # Use category mapping for better donut split
                # Note: main_category here is likely 'productive', 'neutral', etc. from DB
                # We try to get a more specific sub-category if possible.
                _, sub_cat = get_category(app_name, None, None)
                cat_name = sub_cat if sub_cat else main_category
                categories[cat_name] = categories.get(cat_name, 0.0) + secs
                
                if main_category == "productive":
                    productive += secs
                if main_category == "unproductive":
                    distraction += secs
                    distract_by_app[app_name] = distract_by_app.get(app_name, 0.0) + secs

            if total_active <= 0:
                return None

            # 2. Daily goal
            cursor.execute(
                """
                SELECT target_value
                FROM goals
                WHERE is_active = 1
                  AND goal_type = 'daily_screen_time'
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
                """
            )
            goal_row = cursor.fetchone()
            goal_secs = float(goal_row[0]) if goal_row and goal_row[0] is not None else None

            # 3. Hourly Activity (Last 24h)
            # activity_logs does not have main_category, so we fetch and categorize in Python
            cursor.execute(
                """
                SELECT strftime('%H', timestamp) as hour, app_name, exe_path,
                       SUM(active_seconds) as prod,
                       SUM(idle_seconds) as idle
                FROM activity_logs
                WHERE timestamp LIKE ?
                GROUP BY hour, app_name
                ORDER BY hour ASC
                """,
                (f"{date}%",),
            )
            hourly_raw = cursor.fetchall()
            
            hour_map = {} # hour -> {prod: 0, dist: 0, idle: 0}
            for h_str, app_name, exe_path, active, idle in hourly_raw:
                h_int = int(h_str)
                h_display = f"{h_int % 12 or 12} {'AM' if h_int < 12 else 'PM'}"
                if h_display not in hour_map:
                    hour_map[h_display] = {"prod": 0.0, "dist": 0.0, "idle": 0.0}
                
                cat, _ = get_category(app_name, None, exe_path)
                if cat == "productive":
                    hour_map[h_display]["prod"] += active
                elif cat == "unproductive":
                    hour_map[h_display]["dist"] += active
                
                hour_map[h_display]["idle"] += idle

            hourly_stats = []
            peak_hour = "N/A"
            max_focus = -1
            
            # Sort by hour to keep order
            for h_display in sorted(hour_map.keys(), key=lambda x: int(x.split()[0]) if 'AM' in x and x.split()[0]!='12' else (int(x.split()[0])+12 if 'PM' in x and x.split()[0]!='12' else (0 if x=='12 AM' else 12))):
                stats = hour_map[h_display]
                p, d, i = stats["prod"], stats["dist"], stats["idle"]
                hourly_stats.append({
                    "h": h_display,
                    "prod": round(p/60, 1),
                    "dist": round(d/60, 1),
                    "idle": round(i/60, 1)
                })
                if p > max_focus:
                    max_focus = p
                    peak_hour = h_display

            # 4. 7-Day Streak
            streak_days = []
            for i in range(6, -1, -1):
                d_past = (datetime.fromisoformat(date) - timedelta(days=i)).date().isoformat()
                cursor.execute("SELECT SUM(active_seconds) FROM daily_stats WHERE date = ?", (d_past,))
                r = cursor.fetchone()
                val = float(r[0]) if r and r[0] else 0
                state = "empty"
                if val > 0:
                    cursor.execute("SELECT SUM(active_seconds) FROM daily_stats WHERE date = ? AND main_category='productive'", (d_past,))
                    rp = cursor.fetchone()
                    prod_val = float(rp[0]) if rp and rp[0] else 0
                    ratio = (prod_val / val) * 100 if val > 0 else 0
                    if ratio > 60: state = "good"
                    elif ratio > 30: state = "ok"
                    else: state = "bad"
                
                if i == 0: state += " today"
                streak_days.append({
                    "label": datetime.fromisoformat(d_past).strftime("%a")[0],
                    "state": state
                })

            # Top distraction
            top_distraction = None
            if distract_by_app:
                dist_app, dist_secs = max(distract_by_app.items(), key=lambda x: x[1])
                top_distraction = {"app_name": dist_app, "seconds": dist_secs}

            # Top 5 apps
            top_5 = sorted(all_apps.items(), key=lambda x: x[1], reverse=True)[:5]
            top_5_apps = [{"app_name": name, "seconds": secs} for name, secs in top_5]

            productive_ratio = round((productive / total_active) * 100, 1)
            best_streak = self._compute_best_productive_streak(cursor, date)

            return {
                "date": date,
                "total_active": total_active,
                "productive_time": productive,
                "distraction_time": distraction,
                "goal_seconds": goal_secs,
                "top_distraction": top_distraction,
                "top_apps": top_5_apps,
                "productive_ratio": productive_ratio,
                "best_streak": best_streak,
                "hourly_stats": hourly_stats,
                "categories": categories,
                "peak_hour": peak_hour,
                "max_focus_hour_secs": max_focus,
                "streak_days": streak_days
            }
        finally:
            conn.close()

    def _build_daily_digest_summary(self, cursor, date: str) -> str | None:
        # Note: cursor is passed but we don't strictly need it if we call get_daily_digest_data
        # but to keep it consistent with the existing loop pattern we'll just use the data.
        data = self.get_daily_digest_data(date)
        if not data:
            return None
 
        total_active = data["total_active"]
        goal_secs = data["goal_seconds"]
        
        screen_part = f"⏱ Screen: {format_duration(total_active)}"
        if goal_secs is not None:
            delta = total_active - goal_secs
            status_emoji = "🔴" if delta > 0 else "🟢"
            screen_part = (
                f"{status_emoji} Screen: {format_duration(total_active)} "
                f"({'+' if delta > 0 else ''}{format_duration(delta)} vs goal)"
            )
 
        top_dist_str = "None"
        if data["top_distraction"]:
            td = data["top_distraction"]
            top_dist_str = f"{td['app_name'].replace('.exe', '')} ({format_duration(td['seconds'])})"
 
        return (
            f"{screen_part}. \n"
            f"🚫 Top Distraction: {top_dist_str}. \n"
            f"🔥 Productivity: {data['productive_ratio']}%. \n"
            f"🏆 Best Streak: {format_duration(data['best_streak'])}."
        )

    @staticmethod
    def _compute_best_productive_streak(cursor, date: str) -> float:
        cursor.execute(
            """
            SELECT app_name, COALESCE(active_seconds, 0), exe_path
            FROM activity_logs
            WHERE timestamp LIKE ?
            ORDER BY timestamp ASC
            """,
            (f"{date}%",),
        )
        rows = cursor.fetchall()
        if not rows:
            return 0.0

        best = 0.0
        current = 0.0
        for app_name, active_seconds, exe_path in rows:
            if is_ignored(app_name):
                continue
            main_category, _ = get_category(app_name, None, exe_path)
            secs = float(active_seconds or 0)
            if secs <= 0:
                secs = 1.0
            if main_category == "productive":
                current += secs
                if current > best:
                    best = current
            else:
                current = 0.0
        return best

    # ─── PROCESS GUARD ────────────────────────────────────────────────────────
    def _process_guard(self):
        """
        Scans running processes every PROCESS_CHECK_INTERVAL seconds and kills
        any that match the in-memory blocked_apps set. No DB access here —
        reads from the set updated by _limit_monitor.

        Optimisation: takes a snapshot of the blocked set each cycle to avoid
        racing with _limit_monitor, and skips the full process_iter entirely
        when nothing is blocked.
        """
        while self.running:
            try:
                # Snapshot — avoids racing with _limit_monitor updates
                with self._blocked_apps_lock:
                    blocked_snapshot = self.blocked_apps.copy()

                if not blocked_snapshot:
                    time.sleep(PROCESS_CHECK_INTERVAL)
                    continue

                for proc in psutil.process_iter(['name']):
                    try:
                        if proc.info['name'] in blocked_snapshot:
                            proc.kill()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

            except Exception as e:
                print("ProcessGuard error:", e)

            time.sleep(PROCESS_CHECK_INTERVAL)
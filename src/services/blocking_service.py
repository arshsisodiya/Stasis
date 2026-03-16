import threading
import time
import psutil
from datetime import datetime

from src.database.database import get_blocked_app_names
from src.core.desktop_notifications import desktop_notifier
from src.config.ignored_apps_manager import is_ignored
from src.config.settings_manager import SettingsManager
from src.config.category_manager import get_category

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
                                over_mins = int(round(over_by / 60))
                                desktop_notifier.notify(
                                    title="App limit reached",
                                    message=(
                                        f"{app_name}: {int(usage // 60)} min used "
                                        f"(limit {int(daily_limit // 60)} min"
                                        f"{', +' + str(over_mins) + ' min' if over_mins > 0 else ''})."
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

            goal_name = label or goal_type.replace("_", " ").title()
            target_str = self._format_target(target_value, target_unit)

            if direction == "under" and threshold_reached:
                desktop_notifier.notify(
                    title="Screen-time goal threshold reached" if goal_type == "daily_screen_time" else "Goal threshold reached",
                    message=f"{goal_name}: {self._format_target(actual, target_unit)} used (target {target_str}).",
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
                    title="Goal achieved",
                    message=f"{goal_name}: reached {self._format_target(actual, target_unit)} (target {target_str}).",
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
            mins = int(round(value / 60))
            return f"{mins} min"
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

    def _build_daily_digest_summary(self, cursor, date: str) -> str | None:
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
        distract_by_app: dict[str, float] = {}

        for app_name, main_category, seconds in rows:
            if is_ignored(app_name):
                continue
            secs = float(seconds or 0)
            total_active += secs
            if main_category == "productive":
                productive += secs
            if main_category == "unproductive":
                distract_by_app[app_name] = distract_by_app.get(app_name, 0.0) + secs

        if total_active <= 0:
            return None

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
        screen_part = f"Screen {self._fmt_secs(total_active)}"
        if goal_row and goal_row[0] is not None:
            goal_secs = float(goal_row[0])
            delta = total_active - goal_secs
            if delta <= 0:
                screen_part = f"Screen {self._fmt_secs(total_active)} vs goal {self._fmt_secs(goal_secs)}"
            else:
                screen_part = (
                    f"Screen {self._fmt_secs(total_active)} vs goal {self._fmt_secs(goal_secs)} "
                    f"(+{self._fmt_secs(delta)})"
                )

        top_distracting = "None"
        if distract_by_app:
            top_app = max(distract_by_app.items(), key=lambda x: x[1])
            top_distracting = f"{top_app[0].replace('.exe', '')} ({self._fmt_secs(top_app[1])})"

        productive_ratio = round((productive / total_active) * 100, 1)
        best_streak = self._compute_best_productive_streak(cursor, date)

        return (
            f"{screen_part}. "
            f"Top distraction: {top_distracting}. "
            f"Productive ratio: {productive_ratio}%. "
            f"Best streak: {self._fmt_secs(best_streak)}."
        )

    @staticmethod
    def _fmt_secs(seconds: float) -> str:
        total = int(max(0, round(seconds)))
        h = total // 3600
        m = (total % 3600) // 60
        if h > 0:
            return f"{h}h {m}m"
        return f"{m}m"

    @staticmethod
    def _compute_best_productive_streak(cursor, date: str) -> float:
        cursor.execute(
            """
            SELECT app_name, COALESCE(active_seconds, 0)
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
        for app_name, active_seconds in rows:
            if is_ignored(app_name):
                continue
            main_category, _ = get_category(app_name, None)
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
import threading
import time
import psutil
from datetime import datetime

from src.database.database import get_blocked_apps

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

        self.initialized = True

    def start(self):
        if self.running:
            return

        self.running = True

        # Load initial blocked apps into memory cache
        try:
            self.blocked_apps = set(get_blocked_apps())
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
                                "DELETE FROM blocked_apps WHERE app_name = ?",
                                (app_name,)
                            )
                            continue

                        # Still within a temporary unblock window
                        if unblock_until:
                            try:
                                if now < datetime.fromisoformat(unblock_until):
                                    cursor.execute(
                                        "DELETE FROM blocked_apps WHERE app_name = ?",
                                        (app_name,)
                                    )
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
                            cursor.execute(
                                "INSERT OR REPLACE INTO blocked_apps (app_name) VALUES (?)",
                                (app_name,)
                            )
                            new_blocked.add(app_name)
                            if not was_blocked:
                                try:
                                    from src.database.database import log_limit_event
                                    log_limit_event(app_name, "hit", old_value=daily_limit, new_value=usage)
                                except Exception:
                                    pass
                        else:
                            cursor.execute(
                                "DELETE FROM blocked_apps WHERE app_name = ?",
                                (app_name,)
                            )

                    # Single commit for the entire cycle
                    conn.commit()
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
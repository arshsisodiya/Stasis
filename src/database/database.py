import sqlite3
import os
from src.config.storage import get_data_dir
from datetime import datetime, timedelta
DB_PATH = os.path.join(get_data_dir(), "stasis.db")

def get_connection():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        check_same_thread=False,
        isolation_level=None
    )
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    # ===============================
    # RAW ACTIVITY LOGS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        app_name TEXT,
        exe_path TEXT,
        pid INTEGER,
        window_title TEXT,
        url TEXT,
        active_seconds INTEGER DEFAULT 0,
        idle_seconds INTEGER DEFAULT 0,
        keystrokes INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0
    )
    """)

    # ===============================
    # FILE SYSTEM LOGS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS file_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT,
        file_path TEXT
    )
    """)

    # ===============================
    # DAILY AGGREGATED STATS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT NOT NULL,
        app_name TEXT NOT NULL,
        main_category TEXT NOT NULL DEFAULT 'other',
        sub_category TEXT,
        active_seconds INTEGER DEFAULT 0,
        idle_seconds INTEGER DEFAULT 0,
        sessions INTEGER DEFAULT 0,
        keystrokes INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        PRIMARY KEY (date, app_name, main_category)
    )
    """)
    # ===============================
    # GLOBAL SETTINGS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # ===============================
    # TELEGRAM SETTINGS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS telegram_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # ===============================
    # MIGRATION: app_settings -> settings & telegram_settings
    # ===============================
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")
        if cursor.fetchone():
            # Migrate Telegram settings
            telegram_keys = [
                'telegram_enabled', 'telegram_token', 'telegram_chat_id',
                'telegram_bot_username', 'telegram_recent_commands'
            ]
            for key in telegram_keys:
                cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        "INSERT OR IGNORE INTO telegram_settings (key, value) VALUES (?, ?)",
                        (key, row[0])
                    )

            # Migrate other settings to general settings table
            general_keys = [
                'file_logging_enabled', 'file_logging_essential_only',
                'show_yesterday_comparison', 'hardware_acceleration'
            ]
            for key in general_keys:
                cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                        (key, row[0])
                    )

            # Drop the old table
            cursor.execute("DROP TABLE app_settings")
    except Exception as e:
        print(f"Migration error: {e}")

    # ── Migration: old daily_stats schema...
    try:
        cursor.execute("PRAGMA table_info(daily_stats)")
        cols = [r[1] for r in cursor.fetchall()]
        # Check the current PK columns via the index list
        cursor.execute("PRAGMA index_list(daily_stats)")
        indexes = cursor.fetchall()
        pk_cols = []
        for idx in indexes:
            if idx[2] == 1:  # unique
                cursor.execute(f"PRAGMA index_info('{idx[1]}')") 
                pk_cols = [r[2] for r in cursor.fetchall()]
                break
        # If old PK was only (date, app_name) (2 cols) migrate to 3-col PK
        if set(pk_cols) == {"date", "app_name"}:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS daily_stats_new (
                    date TEXT NOT NULL,
                    app_name TEXT NOT NULL,
                    main_category TEXT NOT NULL DEFAULT 'other',
                    sub_category TEXT,
                    active_seconds INTEGER DEFAULT 0,
                    idle_seconds INTEGER DEFAULT 0,
                    sessions INTEGER DEFAULT 0,
                    keystrokes INTEGER DEFAULT 0,
                    clicks INTEGER DEFAULT 0,
                    PRIMARY KEY (date, app_name, main_category)
                )
            """)
            cursor.execute("""
                INSERT OR IGNORE INTO daily_stats_new
                    (date, app_name, main_category, sub_category,
                     active_seconds, idle_seconds, sessions, keystrokes, clicks)
                SELECT date, app_name,
                       COALESCE(main_category, 'other'),
                       sub_category, active_seconds, idle_seconds,
                       sessions, keystrokes, clicks
                FROM daily_stats
            """)
            cursor.execute("DROP TABLE daily_stats")
            cursor.execute("ALTER TABLE daily_stats_new RENAME TO daily_stats")
    except Exception as _mig_err:
        pass  # migration is best-effort; new installs are already correct

    # ===============================
    # APP USAGE LIMITS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT UNIQUE NOT NULL,
        daily_limit_seconds INTEGER NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        created_at TEXT,
        unblock_until TEXT
    )
    """)

    # Add unblock_until column if not exists (for backwards compatibility)
    try:
        cursor.execute("ALTER TABLE app_limits ADD COLUMN unblock_until TEXT")
    except sqlite3.OperationalError:
        pass

    # Add exe_path column to activity_logs if not exists
    try:
        cursor.execute("ALTER TABLE activity_logs ADD COLUMN exe_path TEXT")
    except sqlite3.OperationalError:
        pass

    # ===============================
    # BLOCKED APPS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS blocked_apps (
        app_name TEXT PRIMARY KEY,
        blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # ===============================
    # INDEXES (Performance)
    # ===============================

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_logs(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_app ON activity_logs(app_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_app_date ON activity_logs(app_name, timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_active ON daily_stats(active_seconds)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_limit_app ON app_limits(app_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocked_app ON blocked_apps(app_name)")

    # ===============================
    # GOALS & TARGETS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_type TEXT NOT NULL,
        label TEXT,
        target_value REAL NOT NULL,
        target_unit TEXT NOT NULL DEFAULT 'seconds',
        direction TEXT NOT NULL DEFAULT 'under',
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goal_logs (
        goal_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        actual_value REAL,
        target_value REAL,
        met INTEGER DEFAULT 0,
        PRIMARY KEY (goal_id, date)
    )
    """)

    # ===============================
    # LIMIT EVENTS (hits & edits)
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS limit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        old_value INTEGER,
        new_value INTEGER,
        timestamp TEXT NOT NULL,
        date TEXT NOT NULL
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_goal_logs_date ON goal_logs(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_limit_events_date ON limit_events(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_limit_events_app ON limit_events(app_name)")

    conn.commit()
    conn.close()


# ==========================================================
# ================= LIMIT FUNCTIONS ========================
# ==========================================================

def set_app_limit(app_name: str, limit_seconds: int):
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO app_limits
        (app_name, daily_limit_seconds, is_enabled, created_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(app_name)
        DO UPDATE SET daily_limit_seconds = excluded.daily_limit_seconds
    """, (app_name, limit_seconds, now))

    conn.commit()
    conn.close()


def get_all_limits():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
                   SELECT id, app_name, daily_limit_seconds, is_enabled, unblock_until
                   FROM app_limits
                   """)

    rows = cursor.fetchall()
    conn.close()
    return rows


def get_limit_for_app(app_name: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT daily_limit_seconds, is_enabled
        FROM app_limits
        WHERE app_name = ?
    """, (app_name,))

    result = cursor.fetchone()
    conn.close()
    return result


def toggle_limit(app_name: str, enabled: bool):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE app_limits
        SET is_enabled = ?
        WHERE app_name = ?
    """, (1 if enabled else 0, app_name))

    conn.commit()
    conn.close()


# ==========================================================
# ================= BLOCK FUNCTIONS ========================
# ==========================================================

def add_blocked_app(app_name: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO blocked_apps (app_name)
        VALUES (?)
    """, (app_name,))

    conn.commit()
    conn.close()


def remove_blocked_app(app_name: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM blocked_apps WHERE app_name = ?", (app_name,))
    conn.commit()
    conn.close()


def get_blocked_apps():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT app_name FROM blocked_apps")
    rows = cursor.fetchall()

    conn.close()
    return [r[0] for r in rows]

def delete_app_limit(app_name: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM app_limits WHERE app_name = ?", (app_name,))
    cursor.execute("DELETE FROM blocked_apps WHERE app_name = ?", (app_name,))

    conn.commit()
    conn.close()

# ==========================================================
# ================= USAGE HELPER ===========================
# ==========================================================

def get_today_usage(app_name: str):
    """
    Fetch total active seconds for app today (local system time)
    """
    conn = get_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()  # YYYY-MM-DD

    cursor.execute("""
        SELECT SUM(active_seconds)
        FROM activity_logs
        WHERE app_name = ?
        AND timestamp LIKE ?
    """, (app_name, f"{today}%"))

    result = cursor.fetchone()
    conn.close()

    return result[0] if result[0] else 0


def set_temporary_unblock(app_name: str, minutes: int):
    conn = get_connection()
    cursor = conn.cursor()

    unblock_until = datetime.now() + timedelta(minutes=minutes)

    cursor.execute("""
        UPDATE app_limits
        SET unblock_until = ?
        WHERE app_name = ?
    """, (unblock_until.isoformat(), app_name))

    cursor.execute(
        "DELETE FROM blocked_apps WHERE app_name = ?",
        (app_name,)
    )

    conn.commit()
    conn.close()

def clear_expired_unblocks():
    """
    Remove expired overrides using local system time
    """
    conn = get_connection()
    cursor = conn.cursor()

    now_iso = datetime.now().isoformat()

    cursor.execute("""
        UPDATE app_limits
        SET unblock_until = NULL
        WHERE unblock_until IS NOT NULL
        AND unblock_until <= ?
    """, (now_iso,))
    conn.commit()
    conn.close()

def clear_all_tracked_events():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Clear only historical tracking data
        cursor.execute("DELETE FROM activity_logs")
        cursor.execute("DELETE FROM daily_stats")
        cursor.execute("DELETE FROM file_logs")

        conn.commit()
        return True

    except Exception as e:
        conn.rollback()
        raise e

    finally:
        conn.close()

def factory_reset():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Begin explicit transaction
        cursor.execute("BEGIN")

        # Clear all tracked data
        cursor.execute("DELETE FROM activity_logs")
        cursor.execute("DELETE FROM daily_stats")
        cursor.execute("DELETE FROM file_logs")

        # Clear configuration tables
        cursor.execute("DELETE FROM settings")
        cursor.execute("DELETE FROM telegram_settings")
        cursor.execute("DELETE FROM app_limits")
        cursor.execute("DELETE FROM blocked_apps")

        # Reset auto-increment counters
        cursor.execute("DELETE FROM sqlite_sequence")

        conn.commit()
        return True

    except Exception as e:
        conn.rollback()
        raise e

    finally:
        conn.close()
def set_auto_delete_days(days: int | None):
    """
    Store data retention setting.
    None = keep forever
    """

    conn = get_connection()
    cursor = conn.cursor()

    value = "forever" if days is None else str(days)

    cursor.execute("""
        INSERT INTO settings (key, value)
        VALUES ('auto_delete_days', ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
    """, (value,))

    conn.commit()
    conn.close()

def get_auto_delete_days():
    """
    Returns retention days or None if forever
    """

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT value
        FROM settings
        WHERE key = 'auto_delete_days'
    """)

    row = cursor.fetchone()

    conn.close()

    if not row:
        return None

    value = row[0]

    if value == "forever":
        return None

    return int(value)

def delete_activity_older_than(days: int):
    """
    Delete activity records older than N days across all log tables.
    """

    conn = get_connection()
    cursor = conn.cursor()

    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    cursor.execute("""
        DELETE FROM activity_logs
        WHERE timestamp < ?
    """, (cutoff,))

    cursor.execute("""
        DELETE FROM daily_stats
        WHERE date < ?
    """, (cutoff_date,))

    cursor.execute("""
        DELETE FROM file_logs
        WHERE timestamp < ?
    """, (cutoff,))

    conn.commit()
    conn.close()

def run_retention_cleanup():
    """
    Execute retention cleanup based on current setting
    """

    days = get_auto_delete_days()

    if days is None:
        return

    delete_activity_older_than(days)


# ==========================================================
# ================= GOALS FUNCTIONS ========================
# ==========================================================

def create_goal(goal_type: str, target_value: float, target_unit: str = "seconds",
                direction: str = "under", label: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO goals (goal_type, label, target_value, target_unit, direction, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    """, (goal_type, label, target_value, target_unit, direction, now, now))
    goal_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return goal_id


def get_all_goals():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, goal_type, label, target_value, target_unit, direction, is_active, created_at, updated_at FROM goals")
    rows = cursor.fetchall()
    conn.close()
    return rows


def update_goal(goal_id: int, target_value: float = None, label: str = None,
                is_active: int = None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    if target_value is not None:
        cursor.execute("UPDATE goals SET target_value = ?, updated_at = ? WHERE id = ?",
                       (target_value, now, goal_id))
    if label is not None:
        cursor.execute("UPDATE goals SET label = ?, updated_at = ? WHERE id = ?",
                       (label, now, goal_id))
    if is_active is not None:
        cursor.execute("UPDATE goals SET is_active = ?, updated_at = ? WHERE id = ?",
                       (is_active, now, goal_id))
    conn.commit()
    conn.close()


def delete_goal(goal_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    cursor.execute("DELETE FROM goal_logs WHERE goal_id = ?", (goal_id,))
    conn.commit()
    conn.close()


def log_goal_progress(goal_id: int, date: str, actual_value: float, target_value: float, met: bool):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO goal_logs (goal_id, date, actual_value, target_value, met)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(goal_id, date)
        DO UPDATE SET actual_value = excluded.actual_value, target_value = excluded.target_value, met = excluded.met
    """, (goal_id, date, actual_value, target_value, 1 if met else 0))
    conn.commit()
    conn.close()


def get_goal_logs(goal_id: int, days: int = 7):
    conn = get_connection()
    cursor = conn.cursor()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT goal_id, date, actual_value, target_value, met
        FROM goal_logs WHERE goal_id = ? AND date >= ?
        ORDER BY date
    """, (goal_id, cutoff))
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_all_goal_logs_range(start_date: str, end_date: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT gl.goal_id, gl.date, gl.actual_value, gl.target_value, gl.met,
               g.goal_type, g.label, g.target_unit, g.direction
        FROM goal_logs gl
        JOIN goals g ON g.id = gl.goal_id
        WHERE gl.date >= ? AND gl.date <= ?
        ORDER BY gl.date
    """, (start_date, end_date))
    rows = cursor.fetchall()
    conn.close()
    return rows


# ==========================================================
# ================= LIMIT EVENTS ===========================
# ==========================================================

def log_limit_event(app_name: str, event_type: str, old_value: int = None, new_value: int = None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now()
    cursor.execute("""
        INSERT INTO limit_events (app_name, event_type, old_value, new_value, timestamp, date)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (app_name, event_type, old_value, new_value, now.isoformat(), now.strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()


def get_limit_events_range(start_date: str, end_date: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT app_name, event_type, old_value, new_value, timestamp, date
        FROM limit_events
        WHERE date >= ? AND date <= ?
        ORDER BY timestamp
    """, (start_date, end_date))
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_limit_events_summary(start_date: str, end_date: str):
    """Returns per-app summary of limit hits and edits in a date range."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT app_name, event_type, COUNT(*) as cnt
        FROM limit_events
        WHERE date >= ? AND date <= ?
        GROUP BY app_name, event_type
    """, (start_date, end_date))
    rows = cursor.fetchall()
    conn.close()
    summary = {}
    for app_name, event_type, cnt in rows:
        if app_name not in summary:
            summary[app_name] = {"hits": 0, "edits": 0}
        if event_type == "hit":
            summary[app_name]["hits"] = cnt
        elif event_type == "edit":
            summary[app_name]["edits"] = cnt
    return summary

def set_setting(key: str, value: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
    """, (key, value))

    conn.commit()
    conn.close()
    # Refresh settings cache
    try:
        from src.core.settings_cache import settings_cache
        settings_cache.refresh()
    except Exception:
        pass

def get_setting(key: str, default=None):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT value FROM settings WHERE key = ?
    """, (key,))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return default

    return row[0]
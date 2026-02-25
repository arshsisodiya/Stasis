import sqlite3
import os
from src.config.storage import get_data_dir
from datetime import datetime, timedelta
DB_PATH = os.path.join(get_data_dir(), "startup_notifier.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    # Add unblock_until column if not exists
    try:
        cursor.execute("ALTER TABLE app_limits ADD COLUMN unblock_until TEXT")
    except sqlite3.OperationalError:
        pass

    # ===============================
    # RAW ACTIVITY LOGS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        app_name TEXT,
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
        main_category TEXT,
        sub_category TEXT,
        active_seconds INTEGER DEFAULT 0,
        idle_seconds INTEGER DEFAULT 0,
        sessions INTEGER DEFAULT 0,
        keystrokes INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        PRIMARY KEY (date, app_name)
    )
    """)

    # ===============================
    # APP USAGE LIMITS
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT UNIQUE NOT NULL,
        daily_limit_seconds INTEGER NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        created_at TEXT
    )
    """)

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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_active ON daily_stats(active_seconds)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_limit_app ON app_limits(app_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocked_app ON blocked_apps(app_name)")

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
        cursor.execute("DELETE FROM app_settings")
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
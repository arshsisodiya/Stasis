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
    # AUTHENTICATION
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

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
        user_id TEXT,
        PRIMARY KEY (date, app_name, main_category, user_id)
    )
    """)
    # ===============================
    # TABLE SCHEMA RECREATION / MIGRATION FOR MULTI-ACCOUNT SCOPING
    # ===============================
    def check_old_constraint(table, marker):
        try:
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,))
            row = cursor.fetchone()
            return marker in row[0] if row and row[0] else False
        except Exception:
            return False

    # Migrate settings
    if check_old_constraint("settings", "PRIMARY KEY"):
        try:
            cursor.execute("ALTER TABLE settings RENAME TO settings_old")
            cursor.execute("""
                CREATE TABLE settings (
                    key TEXT,
                    value TEXT,
                    user_id TEXT
                )
            """)
            cursor.execute("INSERT INTO settings (key, value, user_id) SELECT key, value, user_id FROM settings_old")
            cursor.execute("DROP TABLE settings_old")
        except Exception as e:
            print(f"Migration settings error: {e}")

    # Migrate telegram_settings
    if check_old_constraint("telegram_settings", "PRIMARY KEY"):
        try:
            cursor.execute("ALTER TABLE telegram_settings RENAME TO telegram_settings_old")
            cursor.execute("""
                CREATE TABLE telegram_settings (
                    key TEXT,
                    value TEXT,
                    user_id TEXT
                )
            """)
            cursor.execute("INSERT INTO telegram_settings (key, value, user_id) SELECT key, value, user_id FROM telegram_settings_old")
            cursor.execute("DROP TABLE telegram_settings_old")
        except Exception as e:
            print(f"Migration telegram_settings error: {e}")

    # Migrate app_limits
    if check_old_constraint("app_limits", "UNIQUE"):
        try:
            cursor.execute("ALTER TABLE app_limits RENAME TO app_limits_old")
            cursor.execute("""
                CREATE TABLE app_limits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_name TEXT NOT NULL,
                    daily_limit_seconds INTEGER NOT NULL,
                    is_enabled INTEGER DEFAULT 1,
                    is_blocked INTEGER DEFAULT 0,
                    blocked_at TEXT,
                    created_at TEXT,
                    unblock_until TEXT,
                    user_id TEXT
                )
            """)
            # Verify columns before select to handle legacy DB cases safely
            cursor.execute("PRAGMA table_info(app_limits_old)")
            old_cols = [c[1] for c in cursor.fetchall()]
            
            select_cols = ["id", "app_name", "daily_limit_seconds", "is_enabled", "is_blocked", "blocked_at", "created_at"]
            if "unblock_until" in old_cols:
                select_cols.append("unblock_until")
            else:
                select_cols.append("NULL as unblock_until")
            if "user_id" in old_cols:
                select_cols.append("user_id")
            else:
                select_cols.append("NULL as user_id")
                
            cursor.execute(f"""
                INSERT INTO app_limits (id, app_name, daily_limit_seconds, is_enabled, is_blocked, blocked_at, created_at, unblock_until, user_id)
                SELECT id, app_name, daily_limit_seconds, is_enabled, is_blocked, blocked_at, created_at, {select_cols[-2]}, {select_cols[-1]} FROM app_limits_old
            """)
            cursor.execute("DROP TABLE app_limits_old")
        except Exception as e:
            print(f"Migration app_limits error: {e}")

    # Migrate blocked_apps
    if check_old_constraint("blocked_apps", "PRIMARY KEY"):
        try:
            cursor.execute("ALTER TABLE blocked_apps RENAME TO blocked_apps_old")
            cursor.execute("""
                CREATE TABLE blocked_apps (
                    app_name TEXT,
                    blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    user_id TEXT
                )
            """)
            cursor.execute("INSERT INTO blocked_apps (app_name, blocked_at, user_id) SELECT app_name, blocked_at, user_id FROM blocked_apps_old")
            cursor.execute("DROP TABLE blocked_apps_old")
        except Exception as e:
            print(f"Migration blocked_apps error: {e}")

    # ===============================
    # GLOBAL SETTINGS (NEW SCHEMA)
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT,
        value TEXT,
        user_id TEXT
    )
    """)

    # ===============================
    # TELEGRAM SETTINGS (NEW SCHEMA)
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS telegram_settings (
        key TEXT,
        value TEXT,
        user_id TEXT
    )
    """)

    # ===============================
    # MIGRATION: app_settings -> settings & telegram_settings
    # ===============================
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")
        if cursor.fetchone():
            telegram_keys = [
                'telegram_enabled', 'telegram_token', 'telegram_chat_id',
                'telegram_bot_username', 'telegram_recent_commands'
            ]
            for key in telegram_keys:
                cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        "INSERT INTO telegram_settings (key, value, user_id) VALUES (?, ?, NULL)",
                        (key, row[0])
                    )

            general_keys = [
                'file_logging_enabled', 'file_logging_essential_only',
                'show_yesterday_comparison', 'hardware_acceleration'
            ]
            for key in general_keys:
                cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        "INSERT INTO settings (key, value, user_id) VALUES (?, ?, NULL)",
                        (key, row[0])
                    )

            cursor.execute("DROP TABLE app_settings")
    except Exception as e:
        print(f"Migration error: {e}")

    # ── Migration: old daily_stats schema...
    try:
        cursor.execute("PRAGMA table_info(daily_stats)")
        cols = [r[1] for r in cursor.fetchall()]
        cursor.execute("PRAGMA index_list(daily_stats)")
        indexes = cursor.fetchall()
        pk_cols = []
        for idx in indexes:
            if idx[2] == 1:  # unique
                cursor.execute(f"PRAGMA index_info('{idx[1]}')") 
                pk_cols = [r[2] for r in cursor.fetchall()]
                break
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
        pass

    # ===============================
    # APP USAGE LIMITS (NEW SCHEMA)
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        daily_limit_seconds INTEGER NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        is_blocked INTEGER DEFAULT 0,
        blocked_at TEXT,
        created_at TEXT,
        unblock_until TEXT,
        user_id TEXT
    )
    """)

    # ===============================
    # BLOCKED APPS (NEW SCHEMA)
    # ===============================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS blocked_apps (
        app_name TEXT,
        blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT
    )
    """)

    # Backfill legacy blocked_apps state into app_limits.is_blocked once per startup.
    try:
        cursor.execute("""
            UPDATE app_limits
            SET is_blocked = 1,
                blocked_at = COALESCE(blocked_at, (
                    SELECT blocked_at
                    FROM blocked_apps b
                    WHERE b.app_name = app_limits.app_name AND (b.user_id = app_limits.user_id OR (b.user_id IS NULL AND app_limits.user_id IS NULL))
                ))
            WHERE EXISTS (
                SELECT 1 FROM blocked_apps b
                WHERE b.app_name = app_limits.app_name AND (b.user_id = app_limits.user_id OR (b.user_id IS NULL AND app_limits.user_id IS NULL))
            )
        """)
    except Exception:
        pass

    # ===============================
    # INDEXES (Performance & Uniqueness)
    # ===============================

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_logs(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_app ON activity_logs(app_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_app_date ON activity_logs(app_name, timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_active ON daily_stats(active_seconds)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_limit_app ON app_limits(app_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_limit_blocked ON app_limits(is_blocked)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocked_app ON blocked_apps(app_name)")

    # Partial indexes for multi-account uniqueness
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_app_limits_user ON app_limits(app_name, user_id) WHERE user_id IS NOT NULL")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_app_limits_guest ON app_limits(app_name) WHERE user_id IS NULL")

    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_apps_user ON blocked_apps(app_name, user_id) WHERE user_id IS NOT NULL")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_apps_guest ON blocked_apps(app_name) WHERE user_id IS NULL")

    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user ON settings(key, user_id) WHERE user_id IS NOT NULL")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_guest ON settings(key) WHERE user_id IS NULL")

    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_settings_user ON telegram_settings(key, user_id) WHERE user_id IS NOT NULL")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_settings_guest ON telegram_settings(key) WHERE user_id IS NULL")

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

    # ===============================
    # SYSTEM LIFECYCLE (Unified Tracking)
    # =================================
    # Merged functionality: Tracks both system uptime and tracking events.
    cursor.execute("DROP TABLE IF EXISTS app_sessions")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_lifecycle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        boot_time TEXT NOT NULL,
        shutdown_time TEXT,
        hostname TEXT,
        os_name TEXT,
        os_version TEXT,
        total_ram_gb REAL,
        cpu_cores INTEGER,
        ip_address TEXT,
        app_start_time TEXT,
        total_screentime_seconds INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active'
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_system_boot ON system_lifecycle(boot_time)")

    # Migration: Add missing columns if table already existed
    try:
        cursor.execute("ALTER TABLE system_lifecycle ADD COLUMN app_start_time TEXT")
    except Exception: pass
    try:
        cursor.execute("ALTER TABLE system_lifecycle ADD COLUMN total_screentime_seconds INTEGER DEFAULT 0")
    except Exception: pass

    # ===============================
    # MULTI-ACCOUNT MIGRATION
    # ===============================
    tables_to_migrate = [
        "activity_logs", "file_logs", "daily_stats", "settings",
        "telegram_settings", "app_limits", "blocked_apps",
        "goals", "goal_logs", "limit_events", "system_lifecycle"
    ]
    for table in tables_to_migrate:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN user_id TEXT")
        except sqlite3.OperationalError:
            pass # Column already exists

    # Fix daily_stats primary key migration
    try:
        cursor.execute("PRAGMA table_info(daily_stats)")
        cols = cursor.fetchall()
        pk_cols = [c[1] for c in cols if c[5] > 0]
        if 'user_id' not in pk_cols:
            cursor.execute('ALTER TABLE daily_stats RENAME TO daily_stats_old')
            cursor.execute('''
                CREATE TABLE daily_stats (
                    date TEXT,
                    app_name TEXT,
                    main_category TEXT,
                    sub_category TEXT,
                    active_seconds INTEGER DEFAULT 0,
                    idle_seconds INTEGER DEFAULT 0,
                    sessions INTEGER DEFAULT 0,
                    keystrokes INTEGER DEFAULT 0,
                    clicks INTEGER DEFAULT 0,
                    user_id TEXT,
                    PRIMARY KEY (date, app_name, main_category, user_id)
                )
            ''')
            cursor.execute('INSERT INTO daily_stats (date, app_name, main_category, sub_category, active_seconds, idle_seconds, sessions, keystrokes, clicks, user_id) SELECT date, app_name, main_category, sub_category, active_seconds, idle_seconds, sessions, keystrokes, clicks, user_id FROM daily_stats_old')
            cursor.execute('DROP TABLE daily_stats_old')
    except Exception as e:
        print(f"Error migrating daily_stats PK: {e}")

    conn.commit()
    conn.close()


# ==========================================================
# ================= LIMIT FUNCTIONS ========================
# ==========================================================

def set_app_limit(app_name: str, limit_seconds: int, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now().isoformat()

    try:
        cursor.execute("BEGIN")
        # Python-level transaction-safe upsert: delete existing matching limit first
        if user_id is not None:
            cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id = ?", (app_name, user_id))
            cursor.execute("""
                INSERT INTO app_limits
                (app_name, daily_limit_seconds, is_enabled, created_at, user_id)
                VALUES (?, ?, 1, ?, ?)
            """, (app_name, limit_seconds, now, user_id))
        else:
            cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id IS NULL", (app_name,))
            cursor.execute("""
                INSERT INTO app_limits
                (app_name, daily_limit_seconds, is_enabled, created_at, user_id)
                VALUES (?, ?, 1, ?, NULL)
            """, (app_name, limit_seconds, now))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_all_limits(user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    if user_id is not None:
        cursor.execute("""
                       SELECT id, app_name, daily_limit_seconds, is_enabled, unblock_until, is_blocked, blocked_at
                       FROM app_limits
                       WHERE user_id = ? OR user_id IS NULL
                       """, (user_id,))
    else:
        cursor.execute("""
                       SELECT id, app_name, daily_limit_seconds, is_enabled, unblock_until, is_blocked, blocked_at
                       FROM app_limits
                       WHERE user_id IS NULL
                       """)

    rows = cursor.fetchall()
    conn.close()
    return rows


def get_limit_for_app(app_name: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    if user_id is not None:
        cursor.execute("""
            SELECT daily_limit_seconds, is_enabled
            FROM app_limits
            WHERE app_name = ? AND (user_id = ? OR user_id IS NULL)
        """, (app_name, user_id))
    else:
        cursor.execute("""
            SELECT daily_limit_seconds, is_enabled
            FROM app_limits
            WHERE app_name = ? AND user_id IS NULL
        """, (app_name,))

    result = cursor.fetchone()
    conn.close()
    return result


def toggle_limit(app_name: str, enabled: bool, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("BEGIN")
        if enabled:
            if user_id is not None:
                cursor.execute("""
                    UPDATE app_limits
                    SET is_enabled = 1
                    WHERE app_name = ? AND user_id = ?
                """, (app_name, user_id))
            else:
                cursor.execute("""
                    UPDATE app_limits
                    SET is_enabled = 1
                    WHERE app_name = ? AND user_id IS NULL
                """, (app_name,))
        else:
            if user_id is not None:
                cursor.execute("""
                    UPDATE app_limits
                    SET is_enabled = 0,
                        is_blocked = 0,
                        blocked_at = NULL,
                        unblock_until = NULL
                    WHERE app_name = ? AND user_id = ?
                """, (app_name, user_id))
                cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, user_id))
            else:
                cursor.execute("""
                    UPDATE app_limits
                    SET is_enabled = 0,
                        is_blocked = 0,
                        blocked_at = NULL,
                        unblock_until = NULL
                    WHERE app_name = ? AND user_id IS NULL
                """, (app_name,))
                cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


# ==========================================================
# ================= BLOCK FUNCTIONS ========================
# ==========================================================

def add_blocked_app(app_name: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now().isoformat()

    try:
        cursor.execute("BEGIN")
        if user_id is not None:
            cursor.execute("""
                UPDATE app_limits
                SET is_blocked = 1,
                    blocked_at = ?
                WHERE app_name = ? AND user_id = ?
            """, (now, app_name, user_id))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, user_id))
            cursor.execute("""
                INSERT INTO blocked_apps (app_name, blocked_at, user_id)
                VALUES (?, ?, ?)
            """, (app_name, now, user_id))
        else:
            cursor.execute("""
                UPDATE app_limits
                SET is_blocked = 1,
                    blocked_at = ?
                WHERE app_name = ? AND user_id IS NULL
            """, (now, app_name))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
            cursor.execute("""
                INSERT INTO blocked_apps (app_name, blocked_at, user_id)
                VALUES (?, ?, NULL)
            """, (app_name, now))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def remove_blocked_app(app_name: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("BEGIN")
        if user_id is not None:
            cursor.execute("""
                UPDATE app_limits
                SET is_blocked = 0,
                    blocked_at = NULL
                WHERE app_name = ? AND user_id = ?
            """, (app_name, user_id))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, user_id))
        else:
            cursor.execute("""
                UPDATE app_limits
                SET is_blocked = 0,
                    blocked_at = NULL
                WHERE app_name = ? AND user_id IS NULL
            """, (app_name,))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_blocked_apps(user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    if user_id is not None:
        cursor.execute("""
            SELECT app_name, blocked_at
            FROM app_limits
            WHERE is_blocked = 1 AND is_enabled = 1 AND (user_id = ? OR user_id IS NULL)
            ORDER BY COALESCE(blocked_at, created_at) DESC, app_name ASC
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT app_name, blocked_at
            FROM app_limits
            WHERE is_blocked = 1 AND is_enabled = 1 AND user_id IS NULL
            ORDER BY COALESCE(blocked_at, created_at) DESC, app_name ASC
        """)
    rows = cursor.fetchall()

    conn.close()
    return [{"app_name": r[0], "blocked_at": r[1]} for r in rows]


def get_blocked_app_names(user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    if user_id is not None:
        cursor.execute("""
            SELECT app_name
            FROM app_limits
            WHERE is_blocked = 1 AND is_enabled = 1 AND (user_id = ? OR user_id IS NULL)
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT app_name
            FROM app_limits
            WHERE is_blocked = 1 AND is_enabled = 1 AND user_id IS NULL
        """)
    rows = cursor.fetchall()

    conn.close()
    return [r[0] for r in rows]

def delete_app_limit(app_name: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("BEGIN")
        if user_id is not None:
            cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id = ?", (app_name, user_id))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, user_id))
        else:
            cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id IS NULL", (app_name,))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

# ==========================================================
# ================= USAGE HELPER ===========================
# ==========================================================

def get_today_usage(app_name: str, user_id: str = None):
    """
    Fetch total active seconds for app today (local system time)
    """
    conn = get_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()  # YYYY-MM-DD

    if user_id is not None:
        cursor.execute("""
            SELECT SUM(active_seconds)
            FROM activity_logs
            WHERE app_name = ?
            AND timestamp LIKE ?
            AND (user_id = ? OR user_id IS NULL)
        """, (app_name, f"{today}%", user_id))
    else:
        cursor.execute("""
            SELECT SUM(active_seconds)
            FROM activity_logs
            WHERE app_name = ?
            AND timestamp LIKE ?
            AND user_id IS NULL
        """, (app_name, f"{today}%"))

    result = cursor.fetchone()
    conn.close()

    return result[0] if result[0] else 0


def set_temporary_unblock(app_name: str, minutes: int, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    unblock_until = datetime.now() + timedelta(minutes=minutes)

    try:
        cursor.execute("BEGIN")
        if user_id is not None:
            cursor.execute("""
                UPDATE app_limits
                SET unblock_until = ?,
                    is_blocked = 0,
                    blocked_at = NULL
                WHERE app_name = ? AND user_id = ?
            """, (unblock_until.isoformat(), app_name, user_id))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, user_id))
        else:
            cursor.execute("""
                UPDATE app_limits
                SET unblock_until = ?,
                    is_blocked = 0,
                    blocked_at = NULL
                WHERE app_name = ? AND user_id IS NULL
            """, (unblock_until.isoformat(), app_name))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def force_reblock_app(app_name: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()

    now_iso = datetime.now().isoformat()

    try:
        cursor.execute("BEGIN")
        if user_id is not None:
            cursor.execute("""
                UPDATE app_limits
                SET unblock_until = NULL,
                    is_blocked = 1,
                    blocked_at = ?
                WHERE app_name = ? AND user_id = ?
            """, (now_iso, app_name, user_id))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, user_id))
            cursor.execute("""
                INSERT INTO blocked_apps (app_name, blocked_at, user_id)
                VALUES (?, ?, ?)
            """, (app_name, now_iso, user_id))
        else:
            cursor.execute("""
                UPDATE app_limits
                SET unblock_until = NULL,
                    is_blocked = 1,
                    blocked_at = ?
                WHERE app_name = ? AND user_id IS NULL
            """, (now_iso, app_name))
            cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
            cursor.execute("""
                INSERT INTO blocked_apps (app_name, blocked_at, user_id)
                VALUES (?, ?, NULL)
            """, (app_name, now_iso))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
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

def delete_expired_telemetry(user_id=None, detailed_days_override=None, stats_days_override=None):
    """
    Delete activity records older than N days for detailed logs and M days for daily stats,
    filtering strictly by user_id if provided.
    """
    from src.config.settings_manager import SettingsManager

    # Resolve active user_id if not passed
    if user_id is None:
        try:
            from src.api.auth_routes import _app_controller
            if _app_controller and _app_controller.auth_manager:
                user_id = _app_controller.auth_manager.active_user_id
        except Exception:
            pass

    # Read detailed logs retention days (auto_delete_days)
    detailed_days = None
    if detailed_days_override is not None:
        detailed_days = detailed_days_override
    else:
        detailed_val = SettingsManager.get("auto_delete_days", user_id=user_id)
        if detailed_val and detailed_val != "forever":
            try:
                detailed_days = int(detailed_val)
            except ValueError:
                pass

    # Read stats retention days (auto_delete_stats_days)
    stats_days = None
    if stats_days_override is not None:
        stats_days = stats_days_override
    else:
        stats_val = SettingsManager.get("auto_delete_stats_days", user_id=user_id)
        if stats_val and stats_val != "forever":
            try:
                stats_days = int(stats_val)
            except ValueError:
                pass

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # 1. Purge raw activity logs and file logs if detailed_days is set
        if detailed_days is not None and detailed_days > 0:
            cutoff = (datetime.now() - timedelta(days=detailed_days)).isoformat()
            
            if user_id is not None:
                cursor.execute("""
                    DELETE FROM activity_logs
                    WHERE timestamp < ? AND user_id = ?
                """, (cutoff, user_id))
                cursor.execute("""
                    DELETE FROM file_logs
                    WHERE timestamp < ? AND user_id = ?
                """, (cutoff, user_id))
            else:
                cursor.execute("""
                    DELETE FROM activity_logs
                    WHERE timestamp < ? AND user_id IS NULL
                """, (cutoff,))
                cursor.execute("""
                    DELETE FROM file_logs
                    WHERE timestamp < ? AND user_id IS NULL
                """, (cutoff,))

        # 2. Purge daily stats, limit events, and goal logs if stats_days is set
        if stats_days is not None and stats_days > 0:
            cutoff_date = (datetime.now() - timedelta(days=stats_days)).strftime("%Y-%m-%d")
            cutoff_iso = (datetime.now() - timedelta(days=stats_days)).isoformat()
            
            if user_id is not None:
                cursor.execute("""
                    DELETE FROM daily_stats
                    WHERE date < ? AND user_id = ?
                """, (cutoff_date, user_id))
                cursor.execute("""
                    DELETE FROM limit_events
                    WHERE timestamp < ? AND user_id = ?
                """, (cutoff_iso, user_id))
                cursor.execute("""
                    DELETE FROM goal_logs
                    WHERE date < ? AND user_id = ?
                """, (cutoff_date, user_id))
            else:
                cursor.execute("""
                    DELETE FROM daily_stats
                    WHERE date < ? AND user_id IS NULL
                """, (cutoff_date,))
                cursor.execute("""
                    DELETE FROM limit_events
                    WHERE timestamp < ? AND user_id IS NULL
                """, (cutoff_iso,))
                cursor.execute("""
                    DELETE FROM goal_logs
                    WHERE date < ? AND user_id IS NULL
                """, (cutoff_date,))

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def backup_database():
    """
    Safely perform a non-blocking online backup of the active SQLite database
    to a backup file (stasis.db.bak) in the same data directory.
    Updates the database_last_backed_up setting.
    """
    from src.config.settings_manager import SettingsManager

    db_path = DB_PATH
    backup_path = f"{db_path}.bak"

    if not os.path.exists(db_path):
        return {"success": False, "error": "Active database file does not exist"}

    try:
        # Perform safe, non-blocking online SQLite backup
        src_conn = sqlite3.connect(
            db_path,
            timeout=30,
            check_same_thread=False
        )
        dst_conn = sqlite3.connect(
            backup_path,
            timeout=30,
            check_same_thread=False
        )

        with dst_conn:
            src_conn.backup(dst_conn)

        dst_conn.close()
        src_conn.close()

        # Update last backed up setting
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            SettingsManager.set("database_last_backed_up", now_str)
        except Exception:
            pass

        # Calculate backup size
        backup_size_mb = 0.0
        if os.path.exists(backup_path):
            backup_size_mb = round(os.path.getsize(backup_path) / (1024 * 1024), 2)

        return {
            "success": True,
            "backup_path": backup_path,
            "backup_size_mb": backup_size_mb,
            "last_backed_up": now_str
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

def optimize_database():
    """
    Run VACUUM and ANALYZE on SQLite database to release unused space and optimize queries.
    Saves last optimized timestamp and returns reclaimed size.
    """
    from src.config.settings_manager import SettingsManager

    db_path = DB_PATH
    size_before = 0.0
    if os.path.exists(db_path):
        size_before = os.path.getsize(db_path)

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # SQLite VACUUM defragments the database file
        cursor.execute("VACUUM")
        # ANALYZE optimizes query planner indices
        cursor.execute("ANALYZE")
    finally:
        conn.close()

    size_after = 0.0
    if os.path.exists(db_path):
        size_after = os.path.getsize(db_path)

    reclaimed_bytes = max(0, size_before - size_after)
    reclaimed_mb = round(reclaimed_bytes / (1024 * 1024), 2)
    new_size_mb = round(size_after / (1024 * 1024), 2)

    # Save the last optimized timestamp
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        SettingsManager.set("database_last_optimized", now_str)
    except Exception:
        pass

    return {
        "reclaimed_mb": reclaimed_mb,
        "new_size_mb": new_size_mb,
        "last_optimized": now_str
    }

def get_database_file_info():
    """
    Return current database file size in MB and last optimized timestamp.
    """
    from src.config.settings_manager import SettingsManager

    db_path = DB_PATH
    size_mb = 0.0
    if os.path.exists(db_path):
        size_bytes = os.path.getsize(db_path)
        size_mb = round(size_bytes / (1024 * 1024), 2)

    last_optimized = SettingsManager.get("database_last_optimized") or ""

    return {
        "size_mb": size_mb,
        "last_optimized": last_optimized
    }

def delete_activity_older_than(days: int):
    """
    Delete activity records older than N days across all log tables (compatibility fallback).
    """
    delete_expired_telemetry(detailed_days_override=days, stats_days_override=days)

def run_retention_cleanup():
    """
    Execute retention cleanup based on current settings
    """
    delete_expired_telemetry()


# ==========================================================
# ================= GOALS FUNCTIONS ========================
# ==========================================================

def create_goal(goal_type: str, target_value: float, target_unit: str = "seconds",
                direction: str = "under", label: str = None, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO goals (goal_type, label, target_value, target_unit, direction, is_active, created_at, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    """, (goal_type, label, target_value, target_unit, direction, now, now, user_id))
    goal_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return goal_id


def get_all_goals(user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT id, goal_type, label, target_value, target_unit, direction, is_active, created_at, updated_at 
            FROM goals
            WHERE user_id = ? OR user_id IS NULL
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT id, goal_type, label, target_value, target_unit, direction, is_active, created_at, updated_at 
            FROM goals
            WHERE user_id IS NULL
        """)
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


def log_goal_progress(goal_id: int, date: str, actual_value: float, target_value: float, met: bool, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO goal_logs (goal_id, date, actual_value, target_value, met, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(goal_id, date)
        DO UPDATE SET actual_value = excluded.actual_value, target_value = excluded.target_value, met = excluded.met,
                      user_id = COALESCE(excluded.user_id, goal_logs.user_id)
    """, (goal_id, date, actual_value, target_value, 1 if met else 0, user_id))
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


def get_all_goal_logs_range(start_date: str, end_date: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT gl.goal_id, gl.date, gl.actual_value, gl.target_value, gl.met,
                   g.goal_type, g.label, g.target_unit, g.direction
            FROM goal_logs gl
            JOIN goals g ON g.id = gl.goal_id
            WHERE gl.date >= ? AND gl.date <= ? AND (g.user_id = ? OR g.user_id IS NULL)
            ORDER BY gl.date
        """, (start_date, end_date, user_id))
    else:
        cursor.execute("""
            SELECT gl.goal_id, gl.date, gl.actual_value, gl.target_value, gl.met,
                   g.goal_type, g.label, g.target_unit, g.direction
            FROM goal_logs gl
            JOIN goals g ON g.id = gl.goal_id
            WHERE gl.date >= ? AND gl.date <= ? AND g.user_id IS NULL
            ORDER BY gl.date
        """, (start_date, end_date))
    rows = cursor.fetchall()
    conn.close()
    return rows


# ==========================================================
# ================= LIMIT EVENTS ===========================
# ==========================================================

def log_limit_event(app_name: str, event_type: str, old_value: int = None, new_value: int = None, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now()
    cursor.execute("""
        INSERT INTO limit_events (app_name, event_type, old_value, new_value, timestamp, date, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (app_name, event_type, old_value, new_value, now.isoformat(), now.strftime("%Y-%m-%d"), user_id))
    conn.commit()
    conn.close()


def get_limit_events_range(start_date: str, end_date: str, user_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT app_name, event_type, old_value, new_value, timestamp, date
            FROM limit_events
            WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
            ORDER BY timestamp
        """, (start_date, end_date, user_id))
    else:
        cursor.execute("""
            SELECT app_name, event_type, old_value, new_value, timestamp, date
            FROM limit_events
            WHERE date >= ? AND date <= ? AND user_id IS NULL
            ORDER BY timestamp
        """, (start_date, end_date))
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_limit_events_summary(start_date: str, end_date: str, user_id: str = None):
    """Returns per-app summary of limit hits and edits in a date range."""
    conn = get_connection()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT app_name, event_type, COUNT(*) as cnt
            FROM limit_events
            WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
            GROUP BY app_name, event_type
        """, (start_date, end_date, user_id))
    else:
        cursor.execute("""
            SELECT app_name, event_type, COUNT(*) as cnt
            FROM limit_events
            WHERE date >= ? AND date <= ? AND user_id IS NULL
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


# ==========================================================
# ================= SYSTEM LIFECYCLE =======================
# ==========================================================

def log_system_boot():
    """
    Captures system metadata and records/updates a boot event.
    """
    try:
        import psutil
        import socket
        import platform

        # Round to nearest second to avoid microsecond precision jitter between calls
        boot_time_raw = int(psutil.boot_time())
        boot_time_iso = datetime.fromtimestamp(boot_time_raw).isoformat()

        conn = get_connection()
        cursor = conn.cursor()

        # Gather current system metadata
        hostname = socket.gethostname()
        os_name = platform.system()
        os_version = platform.version()
        cpu_cores = psutil.cpu_count()
        memory = psutil.virtual_memory()
        total_ram_gb = round(memory.total / (1024 ** 3), 2)
        ip_address = socket.gethostbyname(hostname)

        # Check if this boot is already logged
        cursor.execute("SELECT id FROM system_lifecycle WHERE boot_time = ?", (boot_time_iso,))
        row = cursor.fetchone()

        if row:
            # Update metadata in case some things changed, and update app_start_time to NOW
            cursor.execute("""
                UPDATE system_lifecycle 
                SET hostname = ?, os_name = ?, os_version = ?, cpu_cores = ?, total_ram_gb = ?, ip_address = ?, 
                    app_start_time = ?, status = 'active'
                WHERE id = ?
            """, (hostname, os_name, os_version, cpu_cores, total_ram_gb, ip_address, datetime.now().isoformat(), row[0]))
        else:
            # Create new row for this boot
            now_iso = datetime.now().isoformat()
            cursor.execute("""
                INSERT INTO system_lifecycle 
                (boot_time, hostname, os_name, os_version, cpu_cores, total_ram_gb, ip_address, app_start_time, total_screentime_seconds, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')
            """, (boot_time_iso, hostname, os_name, os_version, cpu_cores, total_ram_gb, ip_address, now_iso))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging system boot: {e}")


def log_system_shutdown(is_actual_shutdown: bool = False):
    """
    Records the system shutdown time and returns TOTAL cumulative screentime duration.
    """
    try:
        import psutil
        # Round to nearest second to match the boot-time entry
        boot_time_raw = int(psutil.boot_time())
        boot_time_iso = datetime.fromtimestamp(boot_time_raw).isoformat()
        
        now = datetime.now()
        now_iso = now.isoformat()
        
        conn = get_connection()
        cursor = conn.cursor()

        # 1. Fetch current screentime state
        cursor.execute("SELECT app_start_time, total_screentime_seconds FROM system_lifecycle WHERE boot_time = ?", (boot_time_iso,))
        row = cursor.fetchone()
        
        new_total_screentime = 0
        if row and row[0]:
            app_start_dt = datetime.fromisoformat(row[0])
            cumulative_prev = row[1] or 0
            session_duration = int((now - app_start_dt).total_seconds())
            new_total_screentime = cumulative_prev + session_duration
        else:
            # Fallback if app_start_time is missing (should not happen)
            boot_dt = datetime.fromtimestamp(boot_time_raw)
            new_total_screentime = int((now - boot_dt).total_seconds())

        # 2. Update DB with new cumulative total
        if is_actual_shutdown:
            cursor.execute("""
                UPDATE system_lifecycle
                SET shutdown_time = ?,
                    total_screentime_seconds = ?,
                    status = 'completed'
                WHERE boot_time = ?
            """, (now_iso, new_total_screentime, boot_time_iso))
        else:
            # Just update the last seen time and cumulative duration
            cursor.execute("""
                UPDATE system_lifecycle
                SET shutdown_time = ?,
                    total_screentime_seconds = ?
                WHERE boot_time = ?
            """, (now_iso, new_total_screentime, boot_time_iso))

        conn.commit()
        conn.close()
        return new_total_screentime
    except Exception as e:
        print(f"Error logging system shutdown: {e}")
        return None
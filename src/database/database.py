import sqlite3
import os
from src.config.storage import get_data_dir

DB_PATH = os.path.join(get_data_dir(), "startup_notifier.db")


def get_connection():
    os.makedirs(get_data_dir(), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Raw window activity logs
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

    # File system logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS file_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT,
        file_path TEXT
    )
    """)

    # Daily aggregated stats
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

    # Improve hourly queries (timestamp LIKE 'YYYY-MM-DD%')
    cursor.execute("""
                   CREATE INDEX IF NOT EXISTS idx_activity_timestamp_prefix
                       ON activity_logs(timestamp)
                   """)

    # Improve top app sorting
    cursor.execute("""
                   CREATE INDEX IF NOT EXISTS idx_daily_active
                       ON daily_stats(active_seconds)
                   """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_logs(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_app ON activity_logs(app_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_timestamp_prefix ON activity_logs(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_active ON daily_stats(active_seconds)")

    conn.commit()
    conn.close()

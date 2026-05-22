import sys
import os
import time
from datetime import datetime, timedelta

# Adjust path to import src modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.database.database import (
    get_connection,
    delete_expired_telemetry,
    optimize_database,
    get_database_file_info,
    init_db
)
from src.config.settings_manager import SettingsManager

def setup_test_data(user_id):
    """
    Inserts raw activity logs, file logs, daily stats, limit events, and goal logs.
    Some logs are 40 days old (expired for raw detailed logs with 30-day limit, but active for stats),
    some are 10 days old (active for both), and some are 400 days old (expired for both with 365-day stats limit).
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    # Clean up any existing data first to prevent clutter
    cursor.execute("DELETE FROM activity_logs")
    cursor.execute("DELETE FROM file_logs")
    cursor.execute("DELETE FROM daily_stats")
    cursor.execute("DELETE FROM limit_events")
    cursor.execute("DELETE FROM goal_logs")
    
    now = datetime.now()
    t_400_days_ago = (now - timedelta(days=400)).isoformat()
    t_40_days_ago = (now - timedelta(days=40)).isoformat()
    t_10_days_ago = (now - timedelta(days=10)).isoformat()
    
    d_400_days_ago = (now - timedelta(days=400)).strftime("%Y-%m-%d")
    d_40_days_ago = (now - timedelta(days=40)).strftime("%Y-%m-%d")
    d_10_days_ago = (now - timedelta(days=10)).strftime("%Y-%m-%d")
    
    # Insert activity logs (detailed)
    cursor.execute("INSERT INTO activity_logs (timestamp, app_name, active_seconds, user_id) VALUES (?, ?, ?, ?)", (t_400_days_ago, "OldApp", 100, user_id))
    cursor.execute("INSERT INTO activity_logs (timestamp, app_name, active_seconds, user_id) VALUES (?, ?, ?, ?)", (t_40_days_ago, "MediumApp", 200, user_id))
    cursor.execute("INSERT INTO activity_logs (timestamp, app_name, active_seconds, user_id) VALUES (?, ?, ?, ?)", (t_10_days_ago, "RecentApp", 300, user_id))
    
    # Insert file logs (detailed)
    cursor.execute("INSERT INTO file_logs (timestamp, file_path, user_id) VALUES (?, ?, ?)", (t_400_days_ago, "C:/old.txt", user_id))
    cursor.execute("INSERT INTO file_logs (timestamp, file_path, user_id) VALUES (?, ?, ?)", (t_40_days_ago, "C:/medium.txt", user_id))
    cursor.execute("INSERT INTO file_logs (timestamp, file_path, user_id) VALUES (?, ?, ?)", (t_10_days_ago, "C:/recent.txt", user_id))
    
    # Insert daily stats (aggregated)
    cursor.execute("INSERT INTO daily_stats (date, app_name, main_category, active_seconds, user_id) VALUES (?, ?, ?, ?, ?)", (d_400_days_ago, "WorkApp", "Work", 5000, user_id))
    cursor.execute("INSERT INTO daily_stats (date, app_name, main_category, active_seconds, user_id) VALUES (?, ?, ?, ?, ?)", (d_40_days_ago, "WorkApp", "Work", 6000, user_id))
    cursor.execute("INSERT INTO daily_stats (date, app_name, main_category, active_seconds, user_id) VALUES (?, ?, ?, ?, ?)", (d_10_days_ago, "WorkApp", "Work", 7000, user_id))
    
    # Insert limit events (aggregated)
    cursor.execute("INSERT INTO limit_events (timestamp, date, app_name, event_type, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", (t_400_days_ago, d_400_days_ago, "Game", "hit", 1200, 1200, user_id))
    cursor.execute("INSERT INTO limit_events (timestamp, date, app_name, event_type, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", (t_40_days_ago, d_40_days_ago, "Game", "hit", 1200, 1200, user_id))
    cursor.execute("INSERT INTO limit_events (timestamp, date, app_name, event_type, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", (t_10_days_ago, d_10_days_ago, "Game", "hit", 1200, 1200, user_id))

    # Insert goal logs (aggregated)
    cursor.execute("INSERT INTO goal_logs (goal_id, date, actual_value, target_value, met, user_id) VALUES (?, ?, ?, ?, ?, ?)", (1, d_400_days_ago, 5.0, 10.0, 0, user_id))
    cursor.execute("INSERT INTO goal_logs (goal_id, date, actual_value, target_value, met, user_id) VALUES (?, ?, ?, ?, ?, ?)", (1, d_40_days_ago, 6.0, 10.0, 0, user_id))
    cursor.execute("INSERT INTO goal_logs (goal_id, date, actual_value, target_value, met, user_id) VALUES (?, ?, ?, ?, ?, ?)", (1, d_10_days_ago, 7.0, 10.0, 0, user_id))
    
    conn.commit()
    conn.close()

def verify_counts():
    conn = get_connection()
    cursor = conn.cursor()
    
    counts = {}
    for table in ["activity_logs", "file_logs", "daily_stats", "limit_events", "goal_logs"]:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        counts[table] = cursor.fetchone()[0]
        
    conn.close()
    return counts

def run_tests():
    print("=== [1] Initializing Database & Setting Defaults ===")
    init_db()
    SettingsManager.initialize_defaults()
    
    # Set explicit retention limits for testing
    user_id = "test_user_999"
    SettingsManager.set("auto_delete_days", "30", user_id=user_id) # Detailed raw logs: 30 days
    SettingsManager.set("auto_delete_stats_days", "365", user_id=user_id) # Aggregated stats: 1 year (365 days)
    
    print("=== [2] Seeding Database with Multi-Tenant Retention Data ===")
    setup_test_data(user_id)
    
    initial = verify_counts()
    print(f"Initial row counts: {initial}")
    assert initial["activity_logs"] == 3, "Activity logs setup failed"
    assert initial["file_logs"] == 3, "File logs setup failed"
    assert initial["daily_stats"] == 3, "Daily stats setup failed"
    assert initial["limit_events"] == 3, "Limit events setup failed"
    assert initial["goal_logs"] == 3, "Goal logs setup failed"
    
    print("=== [3] Running delete_expired_telemetry() for user_id context ===")
    # Under a 30-day raw logs retention:
    # - 400 days old raw activity log -> DELETED
    # - 40 days old raw activity log -> DELETED
    # - 10 days old raw activity log -> KEPT
    
    # Under a 365-day aggregated stats retention:
    # - 400 days old stats log -> DELETED
    # - 40 days old stats log -> KEPT
    # - 10 days old stats log -> KEPT
    delete_expired_telemetry(user_id=user_id)
    
    after_purge = verify_counts()
    print(f"Row counts after purge: {after_purge}")
    
    # Detailed logs should only have 1 recent row
    assert after_purge["activity_logs"] == 1, "Detailed activity logs purging failed"
    assert after_purge["file_logs"] == 1, "Detailed file logs purging failed"
    
    # Aggregated stats should have 2 rows (40 days and 10 days)
    assert after_purge["daily_stats"] == 2, "Aggregated daily stats purging failed"
    assert after_purge["limit_events"] == 2, "Aggregated limit events purging failed"
    
    print("[SUCCESS] Telemetry Decoupled Purging Boundaries validated successfully!")

    print("=== [4] Testing Database Optimization & Disk Space Recovery ===")
    db_info_before = get_database_file_info()
    print(f"File Info before tune: Size = {db_info_before['size_mb']} MB, Last Optimized = '{db_info_before['last_optimized']}'")
    
    result = optimize_database()
    print(f"Optimization result: {result}")
    
    db_info_after = get_database_file_info()
    print(f"File Info after tune: Size = {db_info_after['size_mb']} MB, Last Optimized = '{db_info_after['last_optimized']}'")
    
    assert db_info_after["last_optimized"] != "", "Last optimized timestamp was not set"
    print("[SUCCESS] SQLite Performance Tuning (VACUUM + ANALYZE) executed successfully!")

if __name__ == "__main__":
    try:
        run_tests()
        print("\n[SUCCESS] ALL AUTOMATED RETENTION & TUNING TESTS PASSED SUCCESSFULLY!")
    except AssertionError as ae:
        print(f"\n[FAIL] TEST FAILURE: {ae}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

import datetime
from src.database.database import get_connection
import os
import csv
from src.config.storage import get_data_dir


def get_wellbeing_file_path():
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    return os.path.join(get_data_dir(), f"daily_wellbeing_{date_str}.csv")


def calculate_daily_wellbeing():
    today = datetime.datetime.now().strftime("%Y-%m-%d")

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT app_name, main_category, sub_category,
                   active_seconds, idle_seconds,
                   sessions, keystrokes, clicks
            FROM daily_stats
            WHERE date = ?
        """, (today,))

        rows = cursor.fetchall()
        conn.close()

        if not rows:
            return None

        total_active = 0
        total_idle = 0
        total_sessions = 0
        total_keys = 0
        total_clicks = 0
        most_used_app = None
        max_usage = 0
        main_category_totals = {}

        for row in rows:
            app, main, sub, active, idle, sessions, keys, clicks = row

            total_active += active
            total_idle += idle
            total_sessions += sessions
            total_keys += keys
            total_clicks += clicks

            if active > max_usage:
                max_usage = active
                most_used_app = app

            main_category_totals[main] = main_category_totals.get(main, 0) + active

        productive_time = main_category_totals.get("productive", 0)
        productivity_percent = round((productive_time / total_active) * 100, 2) if total_active else 0

        wellbeing_data = [
            ["Total Screen Time", total_active],
            ["Total Idle Time", total_idle],
            ["Most Used App", most_used_app],
            ["Total Sessions", total_sessions],
            ["Total Keystrokes", total_keys],
            ["Total Clicks", total_clicks],
            ["Productivity Percentage", f"{productivity_percent}%"]
        ]

        wellbeing_path = get_wellbeing_file_path()
        os.makedirs(os.path.dirname(wellbeing_path), exist_ok=True)

        with open(wellbeing_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Metric", "Value"])
            writer.writerows(wellbeing_data)

        return wellbeing_path

    except Exception:
        return None

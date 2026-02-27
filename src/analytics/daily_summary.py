import datetime
from src.config.category_manager import get_category


def update_daily_stats(cursor, app_name, url, active_seconds, idle_seconds, keys, clicks):
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    main_cat, sub_cat = get_category(app_name, url)

    try:
        cursor.execute("""
            INSERT INTO daily_stats
            (date, app_name, main_category, sub_category,
             active_seconds, idle_seconds, sessions, keystrokes, clicks)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(date, app_name, main_category)
            DO UPDATE SET
                sub_category   = excluded.sub_category,
                active_seconds = active_seconds + excluded.active_seconds,
                idle_seconds   = idle_seconds   + excluded.idle_seconds,
                sessions       = sessions       + 1,
                keystrokes     = keystrokes     + excluded.keystrokes,
                clicks         = clicks         + excluded.clicks
        """, (
            today,
            app_name,
            main_cat,
            sub_cat,
            int(active_seconds),
            int(idle_seconds),
            int(keys),
            int(clicks)
        ))
    except Exception as e:
        import traceback
        import os
        from src.config.storage import get_logs_dir
        err_path = os.path.join(get_logs_dir(), "daily_stats_fatal.log")
        with open(err_path, "a") as f:
            f.write(f"\\n[{datetime.datetime.now()}] Error updating daily_stats:\\n")
            traceback.print_exc(file=f)

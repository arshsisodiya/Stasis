import datetime
from src.database.database import get_connection
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
            ON CONFLICT(date, app_name)
            DO UPDATE SET
                active_seconds = active_seconds + excluded.active_seconds,
                idle_seconds = idle_seconds + excluded.idle_seconds,
                sessions = sessions + 1,
                keystrokes = keystrokes + excluded.keystrokes,
                clicks = clicks + excluded.clicks
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
    except Exception:
        pass

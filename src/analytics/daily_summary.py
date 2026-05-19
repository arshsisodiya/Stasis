import datetime
from src.config.category_manager import get_category


def update_daily_stats(cursor, app_name, url, active_seconds, idle_seconds, keys, clicks, exe_path=None, user_id=None):
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    main_cat, sub_cat = get_category(app_name, url, exe_path)

    try:
        # SQLite's ON CONFLICT requires an exact match to an existing constraint.
        # The PK is (date, app_name, main_category, user_id).
        # However, NULL user_id breaks standard conflict detection since NULL != NULL
        # in unique constraint matching. We work around this by using a two-step
        # upsert: try to UPDATE first; if no rows touched, INSERT.
        
        updated = cursor.execute("""
            UPDATE daily_stats
            SET
                sub_category   = ?,
                active_seconds = active_seconds + ?,
                idle_seconds   = idle_seconds   + ?,
                sessions       = sessions       + 1,
                keystrokes     = keystrokes     + ?,
                clicks         = clicks         + ?
            WHERE date = ?
              AND app_name = ?
              AND main_category = ?
              AND (
                    (user_id IS NULL AND ? IS NULL)
                 OR (user_id = ? AND ? IS NOT NULL)
              )
        """, (
            sub_cat,
            int(active_seconds),
            int(idle_seconds),
            int(keys),
            int(clicks),
            today,
            app_name,
            main_cat,
            user_id, user_id, user_id,  # three bindings for the IS NULL / = ? / IS NOT NULL check
        )).rowcount

        if updated == 0:
            # No existing row — insert fresh
            cursor.execute("""
                INSERT INTO daily_stats
                (date, app_name, main_category, sub_category,
                 active_seconds, idle_seconds, sessions, keystrokes, clicks, user_id)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            """, (
                today,
                app_name,
                main_cat,
                sub_cat,
                int(active_seconds),
                int(idle_seconds),
                int(keys),
                int(clicks),
                user_id
            ))
    except Exception as e:
        import traceback
        import os
        from src.config.storage import get_logs_dir
        err_path = os.path.join(get_logs_dir(), "daily_stats_fatal.log")
        with open(err_path, "a") as f:
            f.write(f"\n[{datetime.datetime.now()}] Error updating daily_stats:\n")
            traceback.print_exc(file=f)

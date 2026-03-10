from flask import jsonify

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored
from src.core.activity_logger import get_current_session_duration


@wellbeing_bp.route("/api/dashboard")
def dashboard():

    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute("""
            SELECT
                app_name,
                SUM(active_seconds),
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
        """, (selected_date,))

        rows = cursor.fetchall()

        total_active = 0
        total_idle = 0
        total_keys = 0
        total_clicks = 0
        total_sessions = 0

        top_app = "N/A"
        max_active = -1

        for app, act, idl, key, clk, sess in rows:

            if is_ignored(app):
                continue

            total_active += safe(act)
            total_idle += safe(idl)
            total_keys += safe(key)
            total_clicks += safe(clk)
            total_sessions += safe(sess)

            if safe(act) > max_active:
                max_active = safe(act)
                top_app = app

        cursor.execute("""
            SELECT
                app_name,
                main_category,
                sub_category,
                SUM(active_seconds),
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks)
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
            ORDER BY SUM(active_seconds) DESC
        """, (selected_date,))

        apps_rows = cursor.fetchall()

        app_map = {}

        for r in apps_rows:

            name = r[0]

            if is_ignored(name):
                continue

            if name not in app_map:

                app_map[name] = {
                    "app": name,
                    "main": r[1],
                    "sub": r[2],
                    "active": 0,
                    "idle": 0,
                    "keys": 0,
                    "clicks": 0
                }

            app_map[name]["active"] += safe(r[3])
            app_map[name]["idle"] += safe(r[4])
            app_map[name]["keys"] += safe(r[5])
            app_map[name]["clicks"] += safe(r[6])

        apps = sorted(
            app_map.values(),
            key=lambda a: a["active"],
            reverse=True
        )

        cursor.execute("""
            SELECT
                strftime('%H', timestamp),
                app_name,
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1,2
        """, (selected_date + "%",))

        rows = cursor.fetchall()

        hourly_map = {}

        for hour, app, act in rows:

            if is_ignored(app):
                continue

            hourly_map[hour] = hourly_map.get(hour, 0) + act

        hourly = [
            safe(hourly_map.get(f"{h:02d}")) // 60
            for h in range(24)
        ]

        return jsonify({
            "date": selected_date,
            "summary": {
                "totalScreenTime": total_active,
                "totalIdleTime": total_idle,
                "totalKeystrokes": total_keys,
                "totalClicks": total_clicks,
                "totalSessions": total_sessions,
                "mostUsedApp": top_app,
                "sessionDuration": int(get_current_session_duration())
            },
            "apps": apps,
            "hourly": hourly
        })

    finally:
        conn.close()

@wellbeing_bp.route("/api/wellbeing")
def wellbeing():

    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    BASELINE_KPM = 35

    try:

        cursor.execute("""
            SELECT main_category, SUM(active_seconds), app_name
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
        """, (selected_date,))

        category_rows = cursor.fetchall()

        category_data = {}

        for main_cat, active_secs, app_name in category_rows:

            if is_ignored(app_name):
                continue

            category_data[main_cat] = (
                category_data.get(main_cat, 0) + active_secs
            )

        productive = safe(category_data.get("productive", 0))

        neutral = (
            safe(category_data.get("neutral", 0)) +
            safe(category_data.get("other", 0))
        )

        unproductive = safe(category_data.get("unproductive", 0))

        total_active = productive + neutral + unproductive

        cursor.execute("""
            SELECT
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks),
                SUM(sessions),
                app_name
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
        """, (selected_date,))

        rows = cursor.fetchall()

        total_idle = 0
        total_keys = 0
        total_clicks = 0
        total_sessions = 0

        for idle, keys, clicks, sessions, app_name in rows:

            if is_ignored(app_name):
                continue

            total_idle += safe(idle)
            total_keys += safe(keys)
            total_clicks += safe(clicks)
            total_sessions += safe(sessions)

        cursor.execute("""
            SELECT app_name, SUM(active_seconds)
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
            ORDER BY SUM(active_seconds) DESC
        """, (selected_date,))

        top_app = "N/A"

        for app_name, total in cursor.fetchall():

            if not is_ignored(app_name):

                top_app = app_name
                break

        if total_active == 0:

            productivity_percent = 0.0

        else:

            minutes_active = total_active / 60

            kpm = total_keys / minutes_active if minutes_active > 0 else 0

            engagement_factor = min(1.0, kpm / BASELINE_KPM)

            effective_productive = productive * engagement_factor

            weighted_time = (
                effective_productive * 1.0 +
                neutral * 0.4 +
                unproductive * 0.0
            )

            productivity_percent = round(
                (weighted_time / total_active) * 100,
                1
            )

        return jsonify({
            "totalScreenTime": total_active,
            "totalIdleTime": total_idle,
            "totalKeystrokes": total_keys,
            "totalClicks": total_clicks,
            "totalSessions": total_sessions,
            "productivityPercent": productivity_percent,
            "mostUsedApp": top_app
        })

    finally:
        conn.close()
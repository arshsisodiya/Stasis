from flask import jsonify

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored


# =====================================
# Daily App Stats
# =====================================

@wellbeing_bp.route("/api/daily-stats")
def daily_stats():

    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute("""
            SELECT
                app_name,
                main_category,
                sub_category,
                SUM(active_seconds) AS active,
                SUM(idle_seconds) AS idle,
                SUM(keystrokes) AS keys,
                SUM(clicks) AS clicks
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
            ORDER BY active DESC
        """, (selected_date,))

        rows = cursor.fetchall()

        result = []

        for row in rows:

            app_name = row[0]

            if is_ignored(app_name):
                continue

            result.append({
                "app": app_name,
                "main": row[1],
                "sub": row[2],
                "active": safe(row[3]),
                "idle": safe(row[4]),
                "keys": safe(row[5]),
                "clicks": safe(row[6]),
            })

        return jsonify(result)

    finally:
        conn.close()
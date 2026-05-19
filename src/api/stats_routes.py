from flask import jsonify

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored


def _get_active_user_id():
    try:
        from src.api.auth_routes import _app_controller
        if _app_controller and _app_controller.auth_manager:
            return _app_controller.auth_manager.active_user_id
    except Exception:
        pass
    return None


def _user_filter_sql(user_id, col="user_id"):
    """
    When logged in: show this user's rows AND any NULL-user orphaned rows.
    When not logged in: show only NULL-user rows.
    """
    if user_id is not None:
        return f"({col} = ? OR {col} IS NULL)", (user_id,)
    else:
        return f"{col} IS NULL", ()


# =====================================
# Daily App Stats
# =====================================

@wellbeing_bp.route("/api/daily-stats")
def daily_stats():

    selected_date = get_selected_date()
    user_id = _get_active_user_id()
    uid_sql, uid_params = _user_filter_sql(user_id)

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(f"""
            SELECT
                app_name,
                main_category,
                sub_category,
                SUM(active_seconds) AS active,
                SUM(idle_seconds) AS idle,
                SUM(keystrokes) AS keys,
                SUM(clicks) AS clicks
            FROM daily_stats
            WHERE date = ? AND {uid_sql}
            GROUP BY app_name, main_category
            ORDER BY active DESC
        """, (selected_date, *uid_params))

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
from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp, get_selected_date
from src.database.database import (
    create_goal, get_all_goals, update_goal, delete_goal,
    log_goal_progress, get_goal_logs, get_connection
)
from src.config.ignored_apps_manager import is_ignored
from datetime import datetime


def _compute_goal_actual(goal_type, date, conn):
    """Compute the actual value for a goal type on a given date."""
    cursor = conn.cursor()

    if goal_type == "daily_screen_time":
        cursor.execute("""
            SELECT app_name, SUM(active_seconds)
            FROM daily_stats WHERE date = ? GROUP BY app_name
        """, (date,))
        return sum(r[1] for r in cursor.fetchall() if not is_ignored(r[0]))

    elif goal_type == "daily_productive_time":
        cursor.execute("""
            SELECT app_name, main_category, SUM(active_seconds)
            FROM daily_stats WHERE date = ? GROUP BY app_name, main_category
        """, (date,))
        return sum(r[2] for r in cursor.fetchall()
                   if not is_ignored(r[0]) and r[1] == "productive")

    elif goal_type == "daily_productivity_pct":
        cursor.execute("""
            SELECT app_name, main_category, SUM(active_seconds)
            FROM daily_stats WHERE date = ? GROUP BY app_name, main_category
        """, (date,))
        total = 0
        productive = 0
        for app_name, main_cat, active in cursor.fetchall():
            if is_ignored(app_name):
                continue
            total += active
            if main_cat == "productive":
                productive += active
        return round((productive / total * 100), 1) if total > 0 else 0.0

    elif goal_type == "daily_focus_score":
        # Use focus route logic
        try:
            from flask import current_app
            client = current_app.test_client()
            resp = client.get(f"/api/focus?date={date}")
            data = resp.get_json()
            return data.get("score", 0) if data else 0
        except Exception:
            return 0

    return 0


@wellbeing_bp.route("/api/goals", methods=["GET"])
def api_get_goals():
    goals = get_all_goals()
    return jsonify([
        {
            "id": r[0], "goal_type": r[1], "label": r[2],
            "target_value": r[3], "target_unit": r[4], "direction": r[5],
            "is_active": bool(r[6]), "created_at": r[7], "updated_at": r[8]
        }
        for r in goals
    ])


@wellbeing_bp.route("/api/goals", methods=["POST"])
def api_create_goal():
    data = request.json
    goal_id = create_goal(
        goal_type=data["goal_type"],
        target_value=float(data["target_value"]),
        target_unit=data.get("target_unit", "seconds"),
        direction=data.get("direction", "under"),
        label=data.get("label")
    )
    return jsonify({"status": "created", "id": goal_id})


@wellbeing_bp.route("/api/goals/<int:goal_id>", methods=["PUT"])
def api_update_goal(goal_id):
    data = request.json
    update_goal(
        goal_id,
        target_value=data.get("target_value"),
        label=data.get("label"),
        is_active=data.get("is_active")
    )
    return jsonify({"status": "updated"})


@wellbeing_bp.route("/api/goals/<int:goal_id>", methods=["DELETE"])
def api_delete_goal(goal_id):
    delete_goal(goal_id)
    return jsonify({"status": "deleted"})


@wellbeing_bp.route("/api/goals/progress")
def api_goals_progress():
    """Returns today's (or selected date's) progress for all active goals."""
    date = get_selected_date()
    goals = get_all_goals()
    conn = get_connection()

    try:
        result = []
        for r in goals:
            goal_id, goal_type, label, target_value, target_unit, direction, is_active = r[0], r[1], r[2], r[3], r[4], r[5], r[6]
            if not is_active:
                continue
            actual = _compute_goal_actual(goal_type, date, conn)
            if direction == "under":
                met = actual <= target_value
            else:
                met = actual >= target_value
            # Log progress snapshot
            log_goal_progress(goal_id, date, actual, target_value, met)
            pct = 0
            if target_value > 0:
                if direction == "under":
                    pct = round(max(0, (1 - actual / target_value)) * 100, 1)
                else:
                    pct = round(min(100, actual / target_value * 100), 1)
            result.append({
                "id": goal_id, "goal_type": goal_type, "label": label,
                "target_value": target_value, "target_unit": target_unit,
                "direction": direction, "actual_value": actual,
                "met": met, "progress_pct": pct
            })
        return jsonify(result)
    finally:
        conn.close()


@wellbeing_bp.route("/api/goals/history")
def api_goals_history():
    """Returns goal logs for last N days."""
    days = request.args.get("days", 7, type=int)
    goals = get_all_goals()
    result = {}
    for r in goals:
        goal_id = r[0]
        logs = get_goal_logs(goal_id, days)
        result[goal_id] = [
            {"date": l[1], "actual": l[2], "target": l[3], "met": bool(l[4])}
            for l in logs
        ]
    return jsonify(result)

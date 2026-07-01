from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp, get_active_user_id
from src.database.database import (
    set_app_limit,
    get_all_limits,
    toggle_limit,
    get_blocked_apps,
    delete_app_limit,
    set_temporary_unblock,
    get_limit_for_app,
    log_limit_event,
    force_reblock_app
)


@wellbeing_bp.route("/limits/set", methods=["POST"])
def api_set_limit():
    data = request.json
    app_name = data["app_name"]
    new_limit = int(data["limit_seconds"])
    user_id = get_active_user_id()

    # Check if this is an edit (existing limit)
    existing = get_limit_for_app(app_name, user_id=user_id)
    if existing:
        old_limit = existing[0]
        if old_limit != new_limit:
            log_limit_event(app_name, "edit", old_value=old_limit, new_value=new_limit, user_id=user_id)

    set_app_limit(app_name, new_limit, user_id=user_id)

    from src.services.blocking_service import BlockingService
    BlockingService().start()

    return jsonify({"status": "success"})


@wellbeing_bp.route("/limits/all", methods=["GET"])
def api_get_limits():
    user_id = get_active_user_id()
    limits = get_all_limits(user_id=user_id)
    
    from src.database.database import get_connection
    from datetime import datetime
    today = datetime.now().date().isoformat()
    conn = get_connection()
    cursor = conn.cursor()
    
    result = []
    for row in limits:
        limit_id, app_name, daily_limit_seconds, is_enabled, unblock_until, is_blocked, blocked_at = row
        is_url = "." in app_name and not app_name.endswith(".exe")
        
        if is_url:
            if user_id is not None:
                cursor.execute("""
                    SELECT COALESCE(SUM(active_seconds), 0)
                    FROM activity_logs
                    WHERE url LIKE ? AND timestamp LIKE ? AND (user_id = ? OR user_id IS NULL)
                """, (f"%{app_name}%", f"{today}%", user_id))
            else:
                cursor.execute("""
                    SELECT COALESCE(SUM(active_seconds), 0)
                    FROM activity_logs
                    WHERE url LIKE ? AND timestamp LIKE ? AND user_id IS NULL
                """, (f"%{app_name}%", f"{today}%"))
        else:
            if user_id is not None:
                cursor.execute("""
                    SELECT COALESCE(SUM(active_seconds), 0)
                    FROM activity_logs
                    WHERE app_name = ? AND timestamp LIKE ? AND (user_id = ? OR user_id IS NULL)
                """, (app_name, f"{today}%", user_id))
            else:
                cursor.execute("""
                    SELECT COALESCE(SUM(active_seconds), 0)
                    FROM activity_logs
                    WHERE app_name = ? AND timestamp LIKE ? AND user_id IS NULL
                """, (app_name, f"{today}%"))
                
        usage = cursor.fetchone()[0] or 0
        
        result.append({
            "id": limit_id,
            "app_name": app_name,
            "daily_limit_seconds": daily_limit_seconds,
            "is_enabled": bool(is_enabled),
            "unblock_until": unblock_until,
            "is_blocked": bool(is_blocked),
            "blocked_at": blocked_at,
            "current_usage": usage
        })
        
    conn.close()
    return jsonify(result)




@wellbeing_bp.route("/limits/toggle", methods=["POST"])
def api_toggle_limit():
    data = request.json
    user_id = get_active_user_id()
    toggle_limit(data["app_name"], bool(data["enabled"]), user_id=user_id)

    return jsonify({"status": "updated"})


@wellbeing_bp.route("/limits/unblock", methods=["POST"])
def api_unblock():
    data = request.json
    user_id = get_active_user_id()

    set_temporary_unblock(
        data["app_name"],
        int(data["minutes"]),
        user_id=user_id
    )

    from src.services.blocking_service import BlockingService
    BlockingService().force_unblock(data["app_name"])

    return jsonify({"status": "temporarily_unblocked"})


@wellbeing_bp.route("/limits/reblock", methods=["POST"])
def api_reblock_now():
    data = request.json
    app_name = data["app_name"]
    user_id = get_active_user_id()

    force_reblock_app(app_name, user_id=user_id)

    from src.services.blocking_service import BlockingService
    BlockingService().force_reblock(app_name)

    return jsonify({"status": "reblocked"})


@wellbeing_bp.route("/limits/delete", methods=["POST"])
def api_delete_limit():
    user_id = get_active_user_id()
    delete_app_limit(request.json["app_name"], user_id=user_id)

    return jsonify({"status": "limit_deleted"})


@wellbeing_bp.route("/limits/blocked", methods=["GET"])
def api_blocked_apps():
    user_id = get_active_user_id()
    return jsonify(get_blocked_apps(user_id=user_id))
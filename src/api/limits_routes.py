from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp
from src.database.database import (
    set_app_limit,
    get_all_limits,
    toggle_limit,
    get_blocked_apps,
    delete_app_limit,
    set_temporary_unblock
)


@wellbeing_bp.route("/limits/set", methods=["POST"])
def api_set_limit():
    data = request.json

    set_app_limit(
        data["app_name"],
        int(data["limit_seconds"])
    )

    from src.services.blocking_service import BlockingService
    BlockingService().start()

    return jsonify({"status": "success"})


@wellbeing_bp.route("/limits/all", methods=["GET"])
def api_get_limits():
    limits = get_all_limits()

    return jsonify([
        {
            "id": row[0],
            "app_name": row[1],
            "daily_limit_seconds": row[2],
            "is_enabled": bool(row[3])
        }
        for row in limits
    ])


@wellbeing_bp.route("/limits/toggle", methods=["POST"])
def api_toggle_limit():
    data = request.json
    toggle_limit(data["app_name"], bool(data["enabled"]))

    return jsonify({"status": "updated"})


@wellbeing_bp.route("/limits/unblock", methods=["POST"])
def api_unblock():
    data = request.json

    set_temporary_unblock(
        data["app_name"],
        int(data["minutes"])
    )

    return jsonify({"status": "temporarily_unblocked"})


@wellbeing_bp.route("/limits/delete", methods=["POST"])
def api_delete_limit():
    delete_app_limit(request.json["app_name"])

    return jsonify({"status": "limit_deleted"})


@wellbeing_bp.route("/limits/blocked", methods=["GET"])
def api_blocked_apps():
    return jsonify(get_blocked_apps())
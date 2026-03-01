from flask import Blueprint, jsonify
from src.services.update_manager import UpdateManager

update_bp = Blueprint("update", __name__, url_prefix="/api/update")
manager = UpdateManager()

@update_bp.route("/status", methods=["GET"])
def update_status():
    return jsonify(manager.get_state())

@update_bp.route("/check", methods=["POST"])
def check_update():
    manager.check_for_update_async()
    return jsonify({"success": True})

@update_bp.route("/install", methods=["POST"])
def install_update():
    manager.download_and_install_async()
    return jsonify({"success": True})

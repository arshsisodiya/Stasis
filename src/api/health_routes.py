from flask import jsonify
from src.api.wellbeing_routes import wellbeing_bp


@wellbeing_bp.route("/api/health")
def health():
    return jsonify({"status": "running"})
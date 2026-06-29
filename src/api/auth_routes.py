from flask import Blueprint, request, jsonify

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

_app_controller = None

def set_app_controller_auth(controller):
    global _app_controller
    _app_controller = controller

@auth_bp.route('/me', methods=['GET'])
def me():
    """Always auto-login the local system user and return a valid token"""
    result = _app_controller.auth_manager.auto_login_local_user()
    if result["success"]:
        return jsonify({"success": True, "user": result["user"], "token": result["token"]})
    return jsonify({"success": False, "error": result.get("error", "Failed to auto-login")}), 500

@auth_bp.route('/update-profile', methods=['POST'])
def update_profile():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = _app_controller.auth_manager.validate_token(token)
        if user:
            data = request.json
            new_username = data.get('username')
            
            if not new_username:
                return jsonify({"success": False, "error": "Username required"}), 400
                
            result = _app_controller.auth_manager.update_username(user["id"], new_username)
            if result["success"]:
                return jsonify({"success": True})
            else:
                return jsonify({"success": False, "error": result["error"]}), 400
                
    return jsonify({"success": False, "error": "Unauthorized"}), 401

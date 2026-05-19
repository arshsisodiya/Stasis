from flask import Blueprint, request, jsonify

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

_app_controller = None

def set_app_controller_auth(controller):
    global _app_controller
    _app_controller = controller

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"success": False, "error": "Username and password required"}), 400
        
    result = _app_controller.auth_manager.register_user(username, password)
    if result["success"]:
        # Log them in automatically
        login_result = _app_controller.auth_manager.login(username, password)
        return jsonify(login_result)
    else:
        return jsonify(result), 400

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    result = _app_controller.auth_manager.login(username, password)
    if result["success"]:
        return jsonify(result)
    else:
        return jsonify(result), 401

@auth_bp.route('/logout', methods=['POST'])
def logout():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        _app_controller.auth_manager.logout(token)
    return jsonify({"success": True})

@auth_bp.route('/me', methods=['GET'])
def me():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = _app_controller.auth_manager.set_active_user_by_token(token)
        if user:
            return jsonify({"success": True, "user": user})
    return jsonify({"success": False, "error": "Unauthorized"}), 401

@auth_bp.route('/change-password', methods=['POST'])
def change_password():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = _app_controller.auth_manager.validate_token(token)
        if user:
            data = request.json
            current_password = data.get('currentPassword')
            new_password = data.get('newPassword')
            
            if not current_password or not new_password:
                return jsonify({"success": False, "error": "Current and new password required"}), 400
                
            result = _app_controller.auth_manager.change_password(user["id"], current_password, new_password)
            if result["success"]:
                return jsonify({"success": True})
            else:
                return jsonify({"success": False, "error": result["error"]}), 400
    
    return jsonify({"success": False, "error": "Unauthorized"}), 401

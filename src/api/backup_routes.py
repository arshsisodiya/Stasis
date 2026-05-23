import io
import json
from flask import jsonify, request, send_file
from src.api.wellbeing_routes import wellbeing_bp, get_active_user_id
from src.core.backup_service import BackupService

@wellbeing_bp.route("/api/backup/export", methods=["POST"])
def api_export_backup():
    """Export and encrypt active user data as a binary backup file"""
    data = request.json
    if not data or "password" not in data or not data["password"]:
        return jsonify({"status": "error", "message": "Password is required to encrypt the backup."}), 400

    password = data["password"]
    user_id = get_active_user_id()

    try:
        service = BackupService()
        # 1. Export active user scoped data
        export_payload = service.export_data(user_id)
        
        # 2. Serialize to JSON string
        json_str = json.dumps(export_payload, ensure_ascii=False)
        
        # 3. Encrypt data string
        encrypted_bytes = service.encrypt_data(json_str, password)
        
        # 4. Return as a binary file download
        import os
        response = send_file(
            io.BytesIO(encrypted_bytes),
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name="stasis_backup.stasisbak"
        )
        
        # Resolve Downloads folder path
        downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
        response.headers["X-Download-Directory"] = downloads_dir
        response.headers["Access-Control-Expose-Headers"] = "X-Download-Directory"
        
        return response
    except Exception as e:
        return jsonify({"status": "error", "message": f"Export failed: {str(e)}"}), 500


@wellbeing_bp.route("/api/backup/import", methods=["POST"])
def api_import_backup():
    """Upload, decrypt and restore binary backup file under active user context"""
    password = request.form.get("password")
    if not password:
        return jsonify({"status": "error", "message": "Decryption password is required."}), 400

    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No backup file uploaded."}), 400

    backup_file = request.files["file"]
    if not backup_file or backup_file.filename == "":
        return jsonify({"status": "error", "message": "Selected file is invalid."}), 400

    user_id = get_active_user_id()

    try:
        # Read uploaded binary file contents
        file_bytes = backup_file.read()

        service = BackupService()
        # 1. Decrypt and deserialize back to dictionary
        decrypted_json_str = service.decrypt_data(file_bytes, password)
        backup_data = json.loads(decrypted_json_str)

        # 2. Overwrite and restore database records under current user_id context
        service.import_data(user_id, backup_data)

        # 3. Force refresh blocking service rules
        try:
            from src.services.blocking_service import BlockingService
            BlockingService().start()
        except Exception:
            pass

        return jsonify({"status": "success", "message": "Telemetry and settings restored successfully."})
    except ValueError as val_err:
        return jsonify({"status": "error", "message": str(val_err)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Restore failed: {str(e)}"}), 500

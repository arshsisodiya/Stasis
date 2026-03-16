import os
import io
import base64
import hashlib
from flask import jsonify, send_file, current_app
from src.api.wellbeing_routes import wellbeing_bp
from src.database.database import get_connection
from src.config.storage import get_icons_dir
from src.utils.icon_extractor import extract_icon_as_base64, get_exe_path_by_name
from src.utils.app_discovery import get_installed_apps
from src.config.ignored_apps_manager import load_ignored_apps


# =====================================
# Init Bundle — single request for all mount-time metadata
# =====================================

@wellbeing_bp.route("/api/init-bundle")
def init_bundle():
    """
    Returns everything the frontend needs on first mount in a single
    round-trip: settings, ignored apps, available dates, heatmap,
    spark series, and update status.
    """
    client = current_app.test_client()
    keys = {
        "settings":       "/api/settings",
        "ignoredApps":    "/api/ignored-apps",
        "availableDates": "/api/available-dates",
        "heatmap":        "/api/heatmap",
        "sparkSeries":    "/api/spark-series?days=7",
    }
    result = {}
    for key, path in keys.items():
        try:
            resp = client.get(path)
            result[key] = resp.get_json()
        except Exception:
            result[key] = None

    # Update status comes from a different blueprint
    try:
        resp = client.get("/api/update/status")
        result["updateStatus"] = resp.get_json()
    except Exception:
        result["updateStatus"] = None

    return jsonify(result)


@wellbeing_bp.route("/api/ignored-apps")
def ignored_apps():
    try:
        return jsonify(load_ignored_apps())
    except Exception as e:
        print(f"Error loading ignored apps: {e}")
    return jsonify([])


@wellbeing_bp.route("/api/app-icon/<app_name>")
def app_icon(app_name):
    import hashlib

    safe_name = hashlib.md5(app_name.lower().encode()).hexdigest()
    cache_path = os.path.join(get_icons_dir(), f"{safe_name}.png")

    if os.path.exists(cache_path):
        return send_file(cache_path, mimetype='image/png', max_age=86400)

    conn = get_connection()
    cursor = conn.cursor()

    try:
        exe_path = get_exe_path_by_name(cursor, app_name)
        if not exe_path:
            return "No icon", 404

        icon_b64 = extract_icon_as_base64(exe_path)
        if not icon_b64:
            return "Failed to extract", 404

        icon_data = base64.b64decode(icon_b64)

        with open(cache_path, 'wb') as f:
            f.write(icon_data)

        return send_file(
            io.BytesIO(icon_data),
            mimetype='image/png',
            max_age=86400
        )

    except Exception as e:
        print(f"Error serving icon for {app_name}: {e}")
        return str(e), 500

    finally:
        conn.close()


@wellbeing_bp.route("/api/system/apps", methods=["GET"])
def api_system_apps():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        apps = get_installed_apps(cursor)

        return jsonify({
            "total": len(apps),
            "apps": apps
        })

    finally:
        conn.close()
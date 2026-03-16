import sys
import os
import time
import threading
import subprocess

from flask import jsonify, request

from src.api.wellbeing_routes import wellbeing_bp
from src.database.database import (
    clear_all_tracked_events,
    factory_reset,
    set_auto_delete_days,
    get_auto_delete_days,
    delete_activity_older_than,
    set_setting
)


# =====================================
# Clear All Data
# =====================================

@wellbeing_bp.route("/api/clear-data", methods=["DELETE"])
def clear_data():

    confirm = request.headers.get("X-Confirm-Clear")

    if confirm != "true":
        return jsonify({
            "success": False,
            "error": "Confirmation header missing."
        }), 400

    try:

        clear_all_tracked_events()

        return jsonify({
            "success": True,
            "message": "All tracked data permanently deleted."
        }), 200

    except Exception as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# =====================================
# Factory Reset
# =====================================

@wellbeing_bp.route("/api/factory-reset", methods=["DELETE"])
def reset_everything():

    confirm = request.headers.get("X-Confirm-Reset")

    if confirm != "RESET_ALL":
        return jsonify({
            "success": False,
            "error": "Reset confirmation missing."
        }), 400

    try:

        # 1️⃣ wipe database
        factory_reset()

        # 2️⃣ restart application after response is sent
        def delayed_restart():

            time.sleep(1)

            subprocess.Popen(
                [sys.executable, "-m", "src.main"],
                cwd=os.getcwd()
            )

            os._exit(0)

        threading.Thread(target=delayed_restart, daemon=True).start()

        return jsonify({
            "success": True,
            "message": "Factory reset completed. Restarting..."
        }), 200

    except Exception as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# =====================================
# Data Retention
# =====================================

@wellbeing_bp.route("/api/settings/data-retention", methods=["POST"])
def set_data_retention():

    try:

        data = request.json
        days = data.get("days")

        if days == "forever":

            set_auto_delete_days(None)

        else:

            days = int(days)

            set_auto_delete_days(days)

        return jsonify({
            "status": "success",
            "retention_days": days
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# =====================================
# Manual Cleanup
# =====================================

@wellbeing_bp.route("/api/settings/data-retention/cleanup", methods=["POST"])
def cleanup_retention_now():

    try:

        days = get_auto_delete_days()

        if days is None:

            return jsonify({
                "status": "skipped",
                "message": "Retention is set to forever"
            })

        delete_activity_older_than(days)

        return jsonify({
            "status": "success",
            "deleted_older_than_days": days
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# =====================================
# Browser Tracking Toggle
# =====================================

@wellbeing_bp.route("/api/settings/browser-tracking", methods=["POST"])
def toggle_browser_tracking():

    try:

        data = request.json
        enabled = bool(data.get("enabled"))

        set_setting(
            "browser_tracking",
            "true" if enabled else "false"
        )

        return jsonify({
            "status": "success",
            "browser_tracking": enabled
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# =====================================
# Idle Detection Toggle
# =====================================

@wellbeing_bp.route("/api/settings/idle-detection", methods=["POST"])
def toggle_idle_detection():

    try:

        data = request.json
        enabled = bool(data.get("enabled"))

        set_setting(
            "idle_detection",
            "true" if enabled else "false"
        )

        return jsonify({
            "status": "success",
            "idle_detection": enabled
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
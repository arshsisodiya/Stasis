import sys
import os
import io
import csv
import glob
import time
import threading
import subprocess

from flask import jsonify, request, make_response

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
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NO_WINDOW
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


# =====================================
# Clear Encrypted Input Dynamics Logs
# =====================================

@wellbeing_bp.route("/api/input-dynamics/clear", methods=["DELETE"])
def clear_input_dynamics():
    """
    Permanently delete all keyboard_*.csv.enc and mouse_*.csv.enc files
    from the input_dynamics/ subfolder.

    The encryption key (input_dynamics.key) is intentionally preserved —
    only the log files are deleted, leaving the feature ready to start fresh.
    """
    import glob

    local_app_data = os.getenv("LOCALAPPDATA", "")
    data_dir = os.path.join(local_app_data, "Stasis", "data", "input_dynamics")

    deleted = 0
    errors  = []

    try:
        for pattern in ["keyboard_*.csv.enc", "mouse_*.csv.enc"]:
            for path in glob.glob(os.path.join(data_dir, pattern)):
                try:
                    os.remove(path)
                    deleted += 1
                except Exception as exc:
                    errors.append(str(exc))

        # Close the currently-open writer file handles so the next event
        # creates a fresh file rather than trying to re-open a deleted path.
        try:
            from src.core.keystroke_dynamics import keystroke_dynamics_writer
            if keystroke_dynamics_writer._current_handle:
                keystroke_dynamics_writer._current_handle.close()
                keystroke_dynamics_writer._current_handle = None
                keystroke_dynamics_writer._current_date   = None
        except Exception:
            pass

        try:
            from src.core.mouse_dynamics import mouse_dynamics_writer
            if mouse_dynamics_writer._current_handle:
                mouse_dynamics_writer._current_handle.close()
                mouse_dynamics_writer._current_handle = None
                mouse_dynamics_writer._current_date   = None
        except Exception:
            pass

        if errors:
            return jsonify({
                "success": False,
                "error": f"Deleted {deleted} file(s) but encountered errors: {'; '.join(errors)}"
            }), 207

        return jsonify({
            "success": True,
            "message": f"Deleted {deleted} encrypted log file(s) from input_dynamics/."
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# =====================================
# List Input Dynamics Log Files
# =====================================

@wellbeing_bp.route("/api/input-dynamics/files", methods=["GET"])
def list_input_dynamics_files():
    """
    Return a list of all .csv.enc files in the input_dynamics/ folder,
    with metadata: type (keyboard|mouse), date string, and file size in KB.

    Response:
    {
        "files": [
            { "type": "keyboard", "date": "2026-07-17", "size_kb": 12.4, "filename": "keyboard_2026-07-17.csv.enc" },
            ...
        ]
    }
    """
    local_app_data = os.getenv("LOCALAPPDATA", "")
    data_dir = os.path.join(local_app_data, "Stasis", "data", "input_dynamics")

    files = []

    try:
        for ftype in ["keyboard", "mouse"]:
            pattern = os.path.join(data_dir, f"{ftype}_*.csv.enc")
            for path in sorted(glob.glob(pattern), reverse=True):
                basename = os.path.basename(path)
                try:
                    # Extract date from: keyboard_2026-07-17.csv.enc
                    date_part = basename[len(ftype) + 1: len(ftype) + 11]
                    size_bytes = os.path.getsize(path)
                    files.append({
                        "type": ftype,
                        "date": date_part,
                        "filename": basename,
                        "size_kb": round(size_bytes / 1024, 1),
                    })
                except Exception:
                    pass   # skip unparseable filenames

        return jsonify({"files": files}), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# =====================================
# Read (Decrypt) a Log File → JSON
# =====================================

@wellbeing_bp.route("/api/input-dynamics/read", methods=["GET"])
def read_input_dynamics():
    """
    Decrypt and return events from a specific log file as JSON.

    Query params:
        type  — "keyboard" or "mouse"
        date  — "YYYY-MM-DD"

    Response:
    {
        "type": "keyboard",
        "date": "2026-07-17",
        "count": 1234,
        "columns": ["unix_ts", "datetime_str", ...],
        "events": [ {...}, ... ]
    }
    """
    log_type = request.args.get("type", "").strip()
    date_str = request.args.get("date", "").strip()

    if log_type not in ("keyboard", "mouse"):
        return jsonify({"success": False, "error": "type must be 'keyboard' or 'mouse'"}), 400
    if not date_str:
        return jsonify({"success": False, "error": "date is required (YYYY-MM-DD)"}), 400

    try:
        if log_type == "keyboard":
            from src.core.keystroke_dynamics import KeystrokeDynamicsWriter
            events = KeystrokeDynamicsWriter.read_events(date_str)
            columns = ["unix_ts", "datetime_str", "event_type", "key_name", "active_app"]
        else:
            from src.core.mouse_dynamics import MouseDynamicsWriter
            events = MouseDynamicsWriter.read_events(date_str)
            columns = ["unix_ts", "datetime_str", "event_type", "button", "x", "y", "active_app"]

        return jsonify({
            "type": log_type,
            "date": date_str,
            "count": len(events),
            "columns": columns,
            "events": events,
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# =====================================
# Export (Decrypt) a Log File → CSV Download
# =====================================

@wellbeing_bp.route("/api/input-dynamics/export", methods=["GET"])
def export_input_dynamics():
    """
    Decrypt a specific log file and return it as a downloadable plaintext CSV.

    Query params:
        type  — "keyboard" or "mouse"
        date  — "YYYY-MM-DD"

    Returns a CSV file attachment.
    """
    log_type = request.args.get("type", "").strip()
    date_str = request.args.get("date", "").strip()

    if log_type not in ("keyboard", "mouse"):
        return jsonify({"success": False, "error": "type must be 'keyboard' or 'mouse'"}), 400
    if not date_str:
        return jsonify({"success": False, "error": "date is required (YYYY-MM-DD)"}), 400

    try:
        if log_type == "keyboard":
            from src.core.keystroke_dynamics import KeystrokeDynamicsWriter
            events  = KeystrokeDynamicsWriter.read_events(date_str)
            columns = ["unix_ts", "datetime_str", "event_type", "key_name", "active_app"]
        else:
            from src.core.mouse_dynamics import MouseDynamicsWriter
            events  = MouseDynamicsWriter.read_events(date_str)
            columns = ["unix_ts", "datetime_str", "event_type", "button", "x", "y", "active_app"]

        # Build in-memory CSV
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(events)
        csv_bytes = buf.getvalue().encode("utf-8")

        filename = f"stasis_{log_type}_{date_str}.csv"

        response = make_response(csv_bytes)
        response.headers["Content-Type"] = "text/csv; charset=utf-8"
        response.headers["Content-Disposition"] = f"attachment; filename=\"{filename}\""
        response.headers["X-Row-Count"] = str(len(events))
        return response

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

import os
import logging
from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp
from src.config.settings_manager import SettingsManager
from src.config.storage import get_base_dir


@wellbeing_bp.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify({
        "file_logging_enabled": SettingsManager.get_bool("file_logging_enabled", False),
        "file_logging_essential_only": SettingsManager.get_bool("file_logging_essential_only", False),
        "show_yesterday_comparison": SettingsManager.get_bool("show_yesterday_comparison", True),
        "hardware_acceleration": SettingsManager.get_bool("hardware_acceleration", True),
        "idle_detection": SettingsManager.get_bool("idle_detection", True),
        "browser_tracking": SettingsManager.get_bool("browser_tracking", True),
        "weekly_report_telegram": SettingsManager.get_bool("weekly_report_telegram", False)
    })


@wellbeing_bp.route("/api/settings/update", methods=["POST"])
def update_settings():
    data = request.json
    _file_monitor_changed = False

    if "file_logging_enabled" in data:
        val = "true" if data["file_logging_enabled"] else "false"
        SettingsManager.set("file_logging_enabled", val)
        _file_monitor_changed = True

    if "file_logging_essential_only" in data:
        val = "true" if data["file_logging_essential_only"] else "false"
        SettingsManager.set("file_logging_essential_only", val)
        _file_monitor_changed = True

    if _file_monitor_changed:
        try:
            from src.core.file_monitor import file_monitor_controller
            file_monitor_controller.notify_setting_changed()
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Could not notify file monitor: %s", exc
            )

    if "show_yesterday_comparison" in data:
        val = "true" if data["show_yesterday_comparison"] else "false"
        SettingsManager.set("show_yesterday_comparison", val)

    if "hardware_acceleration" in data:
        val = "true" if data["hardware_acceleration"] else "false"
        SettingsManager.set("hardware_acceleration", val)

        flag_file = os.path.join(
            get_base_dir(),
            "hardware_acceleration_disabled.txt"
        )

        if data["hardware_acceleration"]:
            if os.path.exists(flag_file):
                os.remove(flag_file)
        else:
            with open(flag_file, "w") as f:
                f.write("disabled")

    if "weekly_report_telegram" in data:
        val = "true" if data["weekly_report_telegram"] else "false"
        SettingsManager.set("weekly_report_telegram", val)

    return jsonify({"status": "updated"})
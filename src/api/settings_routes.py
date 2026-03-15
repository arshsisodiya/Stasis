import os
import logging
from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp
from src.config.settings_manager import SettingsManager
from src.config.storage import get_base_dir
from src.core.desktop_notifications import desktop_notifier


def _send_test_notification(title: str, message: str, source: str, actions=None):
    details = desktop_notifier.notify_test_with_details(title=title, message=message, source=source, actions=actions)
    if details["ok"]:
        return jsonify({"status": "sent", "method": details["method"]})
    return jsonify({
        "status": "failed",
        "method": details["method"],
        "message": "Could not send Windows notification",
        "reason": details["reason"],
    }), 500


@wellbeing_bp.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify({
        "notifications": SettingsManager.get_bool("notifications", False),
        "notifications_enable_goal_events": SettingsManager.get_bool("notifications_enable_goal_events", True),
        "notifications_enable_limit_events": SettingsManager.get_bool("notifications_enable_limit_events", True),
        "notifications_enable_test_events": SettingsManager.get_bool("notifications_enable_test_events", True),
        "notifications_quiet_hours_enabled": SettingsManager.get_bool("notifications_quiet_hours_enabled", False),
        "notifications_quiet_start": SettingsManager.get("notifications_quiet_start") or "22:00",
        "notifications_quiet_end": SettingsManager.get("notifications_quiet_end") or "07:00",
        "notifications_limit_snooze_until": SettingsManager.get("notifications_limit_snooze_until") or "",
        "file_logging_enabled": SettingsManager.get_bool("file_logging_enabled", False),
        "file_logging_essential_only": SettingsManager.get_bool("file_logging_essential_only", False),
        "show_yesterday_comparison": SettingsManager.get_bool("show_yesterday_comparison", True),
        "show_goals_in_overview": SettingsManager.get_bool("show_goals_in_overview", True),
        "hardware_acceleration": SettingsManager.get_bool("hardware_acceleration", True),
        "idle_detection": SettingsManager.get_bool("idle_detection", True),
        "browser_tracking": SettingsManager.get_bool("browser_tracking", True),
        "weekly_report_telegram": SettingsManager.get_bool("weekly_report_telegram", False),
        "weekly_report_verbosity": SettingsManager.get("weekly_report_verbosity") or "standard"
    })


@wellbeing_bp.route("/api/settings/update", methods=["POST"])
def update_settings():
    data = request.json
    _file_monitor_changed = False

    if "notifications" in data:
        val = "true" if data["notifications"] else "false"
        SettingsManager.set("notifications", val)

    if "notifications_enable_goal_events" in data:
        SettingsManager.set("notifications_enable_goal_events", "true" if data["notifications_enable_goal_events"] else "false")

    if "notifications_enable_limit_events" in data:
        SettingsManager.set("notifications_enable_limit_events", "true" if data["notifications_enable_limit_events"] else "false")

    if "notifications_enable_test_events" in data:
        SettingsManager.set("notifications_enable_test_events", "true" if data["notifications_enable_test_events"] else "false")

    if "notifications_quiet_hours_enabled" in data:
        SettingsManager.set("notifications_quiet_hours_enabled", "true" if data["notifications_quiet_hours_enabled"] else "false")

    if "notifications_quiet_start" in data:
        SettingsManager.set("notifications_quiet_start", str(data["notifications_quiet_start"]).strip())

    if "notifications_quiet_end" in data:
        SettingsManager.set("notifications_quiet_end", str(data["notifications_quiet_end"]).strip())

    if "notifications_limit_snooze_until" in data:
        SettingsManager.set("notifications_limit_snooze_until", str(data["notifications_limit_snooze_until"]).strip())

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

    if "show_goals_in_overview" in data:
        val = "true" if data["show_goals_in_overview"] else "false"
        SettingsManager.set("show_goals_in_overview", val)

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

    if "weekly_report_verbosity" in data:
        val = str(data["weekly_report_verbosity"]).strip().lower()
        if val not in ("compact", "standard", "detailed"):
            val = "standard"
        SettingsManager.set("weekly_report_verbosity", val)

    return jsonify({"status": "updated"})


@wellbeing_bp.route("/api/settings/notifications/test", methods=["POST"])
def test_notification():
    return _send_test_notification(
        title="Stasis notification test",
        message="If you can see this in Windows Notification Center, everything is set.",
        source="test-general",
    )


@wellbeing_bp.route("/api/settings/notifications/test-goal", methods=["POST"])
def test_goal_threshold_notification():
    return _send_test_notification(
        title="Screen-time goal threshold reached",
        message="Test alert: your daily screen-time goal threshold was reached.",
        source="test-goal",
        actions=[("Open Goals", desktop_notifier.build_action_url("open-goals"))],
    )


@wellbeing_bp.route("/api/settings/notifications/test-limit", methods=["POST"])
def test_app_limit_notification():
    return _send_test_notification(
        title="App limit reached",
        message="Test alert: Firefox reached its daily app time limit.",
        source="test-limit",
        actions=[
            ("Open Limits", desktop_notifier.build_action_url("open-limits")),
            ("Mute 1h", desktop_notifier.build_action_url("snooze-limit", minutes=60)),
        ],
    )


@wellbeing_bp.route("/api/settings/notifications/history", methods=["GET"])
def get_notifications_history():
    limit = request.args.get("limit", 20, type=int)
    return jsonify({"items": desktop_notifier.get_history(limit=limit)})


@wellbeing_bp.route("/api/settings/notifications/action/<action>", methods=["GET"])
def notification_action(action):
    app_url = "http://127.0.0.1:5173"
    if action == "open-limits":
        target = f"{app_url}?section=limits"
        body = f"<meta http-equiv='refresh' content='0;url={target}'><p>Opening Limits...</p>"
        return body, 200, {"Content-Type": "text/html; charset=utf-8"}

    if action == "open-goals":
        target = f"{app_url}?section=goals"
        body = f"<meta http-equiv='refresh' content='0;url={target}'><p>Opening Goals...</p>"
        return body, 200, {"Content-Type": "text/html; charset=utf-8"}

    if action == "snooze-limit":
        minutes = request.args.get("minutes", 60, type=int)
        desktop_notifier.snooze_limit_notifications(minutes=minutes)
        return "<p>Limit notifications snoozed.</p>", 200, {"Content-Type": "text/html; charset=utf-8"}

    return "<p>Unknown action.</p>", 404, {"Content-Type": "text/html; charset=utf-8"}
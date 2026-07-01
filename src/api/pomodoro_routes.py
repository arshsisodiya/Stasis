"""
Pomodoro / Focus Mode API routes
---------------------------------
POST /api/pomodoro/start   { "minutes": 25 }
POST /api/pomodoro/stop
GET  /api/pomodoro/status
"""

import logging
from datetime import datetime
from flask import Blueprint, jsonify, request

from src.core.focus_manager import focus_manager
from src.config.settings_manager import SettingsManager
from src.database.database import get_connection

logger = logging.getLogger(__name__)

pomodoro_bp = Blueprint("pomodoro", __name__)

_app_controller_ref = None


def set_app_controller_pomodoro(controller):
    global _app_controller_ref
    _app_controller_ref = controller


def _uid():
    try:
        return _app_controller_ref.auth_manager.active_user_id
    except Exception:
        return None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log_session(start_time: datetime, end_time: datetime, minutes: int, completed: bool, user_id):
    """Persist a completed/aborted Pomodoro session to the DB."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Ensure table exists (idempotent)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pomodoro_sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT,
                start_time  TEXT NOT NULL,
                end_time    TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0
            )
        """)
        cursor.execute("""
            INSERT INTO pomodoro_sessions (user_id, start_time, end_time, duration_minutes, is_completed)
            VALUES (?, ?, ?, ?, ?)
        """, (
            user_id,
            start_time.isoformat(timespec="seconds"),
            end_time.isoformat(timespec="seconds"),
            minutes,
            1 if completed else 0,
        ))
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.warning("Failed to log pomodoro session: %s", exc)


# ── Routes ────────────────────────────────────────────────────────────────────

@pomodoro_bp.route("/api/pomodoro/start", methods=["POST"])
def pomodoro_start():
    data = request.get_json(silent=True) or {}
    raw_mins = data.get("minutes")
    try:
        minutes = int(raw_mins) if raw_mins is not None else 25
    except (ValueError, TypeError):
        return jsonify({"error": "minutes must be an integer"}), 422
        
    if not (1 <= minutes <= 480):
        return jsonify({"error": "minutes must be between 1 and 480"}), 422

    # If one is already running, stop it first (and log it as aborted)
    status = focus_manager.get_status()
    if status["active"]:
        from datetime import datetime as _dt, timedelta as _td
        old_mins = status["duration_minutes"]
        elapsed = status.get("elapsed_seconds", 0)
        abort_end = _dt.now()
        abort_start = abort_end - _td(seconds=elapsed)
        try:
            _log_session(
                start_time=abort_start,
                end_time=abort_end,
                minutes=old_mins,
                completed=False,
                user_id=_uid(),
            )
        except Exception:
            pass

    focus_manager.start_session(minutes)
    logger.info("[Pomodoro] Session started: %d min by user %s", minutes, _uid())

    return jsonify({
        "success": True,
        "message": f"Focus Mode started for {minutes} minutes",
        **focus_manager.get_status(),
    })


@pomodoro_bp.route("/api/pomodoro/stop", methods=["POST"])
def pomodoro_stop():
    status_before = focus_manager.get_status()
    was_active = focus_manager.stop_session()

    if was_active and status_before.get("active"):
        from datetime import datetime as _dt, timedelta as _td
        elapsed = status_before.get("elapsed_seconds", 0)
        stop_end = _dt.now()
        stop_start = stop_end - _td(seconds=elapsed)
        _log_session(
            start_time=stop_start,
            end_time=stop_end,
            minutes=status_before.get("duration_minutes", 0),
            completed=False,
            user_id=_uid(),
        )

    return jsonify({
        "success": True,
        "message": "Focus Mode stopped" if was_active else "No active session",
    })


@pomodoro_bp.route("/api/pomodoro/status", methods=["GET"])
def pomodoro_status():
    return jsonify(focus_manager.get_status())


@pomodoro_bp.route("/api/pomodoro/settings", methods=["GET"])
def pomodoro_get_settings():
    uid = _uid()
    return jsonify({
        "strict_mode": SettingsManager.get_bool("pomodoro_strict_mode", False, user_id=uid),
    })


@pomodoro_bp.route("/api/pomodoro/settings", methods=["POST"])
def pomodoro_update_settings():
    data = request.get_json(silent=True) or {}
    uid = _uid()
    if "strict_mode" in data:
        val = "true" if data["strict_mode"] else "false"
        SettingsManager.set("pomodoro_strict_mode", val, user_id=uid)
    return jsonify({"success": True})

"""
Telegram API Routes
-------------------
Bug fixes vs previous version:

  ENABLE BUG (main fix):
  • /enable was blocking re-enable after disable because is_telegram_running()
    could return True while the process was in a half-alive state after disable,
    OR because app_controller.enable_telegram() was being called with a token
    the frontend no longer has (it only saw the masked version).

    Fix: /enable now handles TWO modes:
      A) First-time setup — request body contains { token, chat_id }
      B) Re-enable        — request body is empty {} or omits both fields
         → decrypts stored credentials and restarts without re-validating.

  OTHER FIXES:
  • Added logging so 500s show actual tracebacks in server output.
  • _has_credentials() now checks for non-None AND non-empty values.
  • _get_stored_credentials() centralises decrypt logic.
  • reset() now continues wiping even if disable() raises.
  • restart() guards on _has_credentials() not just telegram_enabled flag.
  • All routes use request.get_json(silent=True) to handle bad Content-Type.
  • Consistent {"success": True, "message": "..."} shape on every 2xx.
"""

import logging
from flask import Blueprint, jsonify, request
import requests

from src.core.app_controller import AppController
from src.config.settings_manager import SettingsManager
from src.config.crypto import decrypt, encrypt

logger = logging.getLogger(__name__)

telegram_bp = Blueprint("telegram", __name__)

app_controller = None


def set_app_controller(controller):
    global app_controller
    app_controller = controller


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _get_bot_info(token: str) -> dict | None:
    """Calls Telegram getMe. Returns result dict on success, None on failure."""
    try:
        r = requests.get(
            f"https://api.telegram.org/bot{token}/getMe",
            timeout=10,
        )
        if r.status_code == 200:
            return r.json().get("result") or {}
        return None
    except requests.RequestException:
        return None


def _mask(value: str, keep: int = 6) -> str | None:
    """Returns a safely masked version of a sensitive string."""
    if not value:
        return None
    return value[:keep] + "..." if len(value) > keep else "*" * len(value)


def _has_credentials() -> bool:
    """True only if both encrypted token and chat_id are non-empty in DB."""
    token = SettingsManager.get("telegram_token")
    chat_id = SettingsManager.get("telegram_chat_id")
    return bool(token and token.strip() and chat_id and chat_id.strip())


def _get_stored_credentials() -> tuple[str | None, str | None]:
    """Decrypt and return (token, chat_id). Returns (None, None) if missing."""
    token_enc = SettingsManager.get("telegram_token")
    chat_enc = SettingsManager.get("telegram_chat_id")
    return (
        decrypt(token_enc) if token_enc else None,
        decrypt(chat_enc) if chat_enc else None,
    )


def _state_string(enabled: bool, running: bool, has_creds: bool) -> str:
    if enabled and running:     return "running"
    if enabled and not running: return "degraded"
    if not enabled and has_creds: return "paused"
    return "disabled"


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@telegram_bp.route("/api/telegram/status", methods=["GET"])
def telegram_status():
    """Lightweight status poll — safe to call frequently."""
    enabled = SettingsManager.get_bool("telegram_enabled")
    running = app_controller.is_telegram_running()
    has_creds = _has_credentials()

    return jsonify({
        "enabled": enabled,
        "running": running,
        "state": _state_string(enabled, running, has_creds),
    })


@telegram_bp.route("/api/telegram/config", methods=["GET"])
def telegram_config():
    """Returns masked credentials. Raw values are never returned."""
    enabled = SettingsManager.get_bool("telegram_enabled")
    has_creds = _has_credentials()

    token_masked = chat_masked = None
    if has_creds:
        token, chat_id = _get_stored_credentials()
        token_masked = _mask(token, keep=6)
        chat_masked = _mask(chat_id, keep=4)

    return jsonify({
        "enabled": enabled,
        "has_credentials": has_creds,
        "token": token_masked,
        "chat_id": chat_masked,
        "bot_username": SettingsManager.get("telegram_bot_username"),
    })


@telegram_bp.route("/api/telegram/full-status", methods=["GET"])
def telegram_full_status():
    """Combined status + config. Use on settings page load."""
    enabled = SettingsManager.get_bool("telegram_enabled")
    running = app_controller.is_telegram_running()
    has_creds = _has_credentials()

    token_masked = chat_masked = None
    if has_creds:
        token, chat_id = _get_stored_credentials()
        token_masked = _mask(token, keep=6)
        chat_masked = _mask(chat_id, keep=4)

    return jsonify({
        "enabled": enabled,
        "running": running,
        "has_credentials": has_creds,
        "state": _state_string(enabled, running, has_creds),
        "token": token_masked,
        "chat_id": chat_masked,
        "bot_username": SettingsManager.get("telegram_bot_username"),
    })


@telegram_bp.route("/api/telegram/validate", methods=["POST"])
def validate_telegram():
    """
    Validates a bot token against Telegram API. Does NOT store anything.
    Returns bot username on success so UI can display it.
    """
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()

    if not token:
        return jsonify({"error": "token is required"}), 422

    bot_info = _get_bot_info(token)
    if bot_info is not None:
        return jsonify({
            "valid": True,
            "username": bot_info.get("username"),
            "name": bot_info.get("first_name"),
        })

    return jsonify({
        "valid": False,
        "error": "Invalid token or Telegram API unreachable",
    }), 400


@telegram_bp.route("/api/telegram/enable", methods=["POST"])
def enable_telegram():
    """
    Enable (or re-enable) Telegram integration.

    MODE A — First-time setup: body = { "token": "...", "chat_id": "..." }
      → Validates token, encrypts & stores credentials, starts bot.

    MODE B — Re-enable after disable: body = {} (no token/chat_id)
      → Decrypts stored credentials, restarts bot without re-validation.
      (Credentials were already validated during first setup.)
    """
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    chat_id = (data.get("chat_id") or "").strip()

    # ── MODE B: Re-enable with stored credentials ──────────────────────────
    if not token and not chat_id:
        if not _has_credentials():
            return jsonify({
                "error": "No credentials stored — provide token and chat_id to set up first",
            }), 422

        if app_controller.is_telegram_running():
            # Already running — treat as success, nothing to do
            return jsonify({
                "success": True,
                "message": "Telegram is already running",
            })

        try:
            stored_token, stored_chat_id = _get_stored_credentials()
            app_controller.enable_telegram(stored_token, stored_chat_id)
            SettingsManager.set("telegram_enabled", "true")
            return jsonify({
                "success": True,
                "message": "Telegram re-enabled with saved credentials",
            })
        except Exception:
            logger.exception("Failed to re-enable Telegram with stored credentials")
            return jsonify({
                "error": "Failed to start bot — check server logs for the traceback",
            }), 500

    # ── MODE A: First-time setup with explicit credentials ─────────────────
    errors = {}
    if not token:   errors["token"] = "Required"
    if not chat_id: errors["chat_id"] = "Required"
    if errors:
        return jsonify({"error": "Missing credentials", "fields": errors}), 422

    # Block if bot is already running (changing credentials mid-run)
    if app_controller.is_telegram_running():
        return jsonify({
            "error": "Bot is already running — disable it first before changing credentials",
        }), 409

    # Validate token with Telegram
    bot_info = _get_bot_info(token)
    if bot_info is None:
        return jsonify({
            "error": "Invalid bot token — verify it via @BotFather (format: 123456:ABCdef...)",
        }), 422

    try:
        app_controller.enable_telegram(token, chat_id)
        SettingsManager.set("telegram_bot_username", f"@{bot_info.get('username', '')}")

        return jsonify({
            "success": True,
            "message": "Telegram integration enabled",
            "bot_username": f"@{bot_info.get('username', '')}",
        })
    except Exception:
        logger.exception("Failed to enable Telegram with new credentials")
        return jsonify({
            "error": "Failed to start bot — check server logs for the traceback",
        }), 500


@telegram_bp.route("/api/telegram/disable", methods=["POST"])
def disable_telegram():
    """
    Stops the bot and marks it disabled.
    Credentials stay in DB so re-enable works without reconfiguring.
    """
    try:
        app_controller.disable_telegram()
        return jsonify({
            "success": True,
            "message": "Telegram disabled — credentials preserved",
        })
    except Exception:
        logger.exception("Failed to disable Telegram")
        return jsonify({"error": "Failed to disable — check server logs"}), 500


@telegram_bp.route("/api/telegram/restart", methods=["POST"])
def restart_telegram():
    """
    Restarts the bot process.
    Guards on credentials existing, not just the enabled flag.
    """
    if not _has_credentials():
        return jsonify({
            "error": "No credentials stored — configure Telegram first",
        }), 400

    if not SettingsManager.get_bool("telegram_enabled"):
        return jsonify({
            "error": "Telegram is disabled — enable it before restarting",
        }), 400

    try:
        success = app_controller.restart_telegram()
        if not success:
            return jsonify({"error": "Restart failed — check server logs"}), 500

        return jsonify({
            "success": True,
            "message": "Telegram service restarted",
        })
    except Exception:
        logger.exception("Failed to restart Telegram")
        return jsonify({"error": "Restart error — check server logs"}), 500


@telegram_bp.route("/api/telegram/reset", methods=["POST"])
def reset_telegram():
    """
    Stops the bot and permanently wipes all credentials from DB.
    Continues credential wipe even if disable() raises.
    """
    try:
        app_controller.disable_telegram()
    except Exception:
        logger.warning(
            "disable_telegram() raised during reset — continuing with credential wipe"
        )

    try:
        SettingsManager.delete("telegram_token")
        SettingsManager.delete("telegram_chat_id")
        SettingsManager.delete("telegram_bot_username")
        SettingsManager.set("telegram_enabled", "false")

        return jsonify({
            "success": True,
            "message": "Telegram credentials removed and service stopped",
        })
    except Exception:
        logger.exception("Failed to wipe Telegram credentials during reset")
        return jsonify({"error": "Failed to remove credentials — check server logs"}), 500

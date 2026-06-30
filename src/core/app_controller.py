# src/core/app_controller.py

from src.config.settings_manager import SettingsManager, TelegramSettingsManager
from src.config.crypto import decrypt, encrypt
from src.core.auth_manager import AuthManager
from src.utils.logger import setup_logger

logger = setup_logger()

class AppController:

    def __init__(self):
        self.telegram_service = None
        self.auth_manager = AuthManager()
        self.auth_manager.on_active_user_changed = self._on_active_user_changed

    def _on_active_user_changed(self, new_user_id):
        logger.info(f"[AppController] Active user changed to: {new_user_id}")
        enabled = TelegramSettingsManager.get_bool("telegram_enabled", user_id=new_user_id)
        logger.info(f"[AppController] telegram_enabled for user {new_user_id}: {enabled}")
        if enabled:
            self._start_telegram_from_settings(user_id=new_user_id)
        else:
            if self.telegram_service:
                logger.info("[AppController] Telegram was running but new user has it disabled — stopping.")
                self.telegram_service.stop()
                self.telegram_service = None

    # -------------------------
    # STARTUP INITIALIZATION
    # -------------------------

    def initialize(self):
        """Called after DB is ready and user session is restored."""
        logger.info("[AppController] Initializing app services...")

        SettingsManager.initialize_defaults()
        TelegramSettingsManager.initialize_defaults()

        # Use the already-restored active_user_id so we read the correct row.
        uid = self.auth_manager.active_user_id
        logger.info(f"[AppController] initialize() — active_user_id={uid}")

        enabled = TelegramSettingsManager.get_bool("telegram_enabled", user_id=uid)
        logger.info(f"[AppController] telegram_enabled (user={uid}): {enabled}")

        if enabled:
            self._start_telegram_from_settings(user_id=uid)
        else:
            logger.info("[AppController] Telegram is disabled or not configured — skipping auto-start.")

    # -------------------------
    # INTERNAL START
    # -------------------------

    def _start_telegram_from_settings(self, user_id=None):
        """Reads encrypted credentials for the given user and starts the bot."""
        uid = user_id or self.auth_manager.active_user_id
        logger.info(f"[AppController] _start_telegram_from_settings() — user_id={uid}")

        token_enc = TelegramSettingsManager.get("telegram_token", user_id=uid)
        chat_enc  = TelegramSettingsManager.get("telegram_chat_id", user_id=uid)

        logger.info(
            f"[AppController] Credentials present? token={'YES' if token_enc else 'NO'}, "
            f"chat_id={'YES' if chat_enc else 'NO'}"
        )

        if not token_enc or not chat_enc:
            logger.warning(
                "[AppController] Cannot start Telegram — missing encrypted credentials in DB "
                f"for user_id={uid}. This usually means the credentials were saved under a "
                "different user_id or the DB was reset."
            )
            return

        try:
            token   = decrypt(token_enc)
            chat_id = decrypt(chat_enc)
        except Exception:
            logger.exception("[AppController] Failed to decrypt Telegram credentials.")
            return

        logger.info(f"[AppController] Credentials decrypted OK. Starting service...")
        self._start_service(token, chat_id)

    def _start_service(self, token: str, chat_id: str):
        # Prevent duplicate instance
        if self.telegram_service:
            logger.info("[AppController] Stopping existing TelegramService before restart.")
            self.telegram_service.stop()

        from src.utils.dependency_manager import ensure_package
        ensure_package("psutil")

        from src.core.telegram.service import TelegramService
        self.telegram_service = TelegramService(token, chat_id)
        self.telegram_service.start()
        logger.info("[AppController] TelegramService started successfully.")

    # -------------------------
    # PUBLIC TELEGRAM CONTROL
    # -------------------------

    def enable_telegram(self, token: str, chat_id: str):
        uid = self.auth_manager.active_user_id
        logger.info(f"[AppController] enable_telegram() called for user_id={uid}")

        encrypted_token = encrypt(token)
        encrypted_chat  = encrypt(chat_id)

        TelegramSettingsManager.set("telegram_token",   encrypted_token, user_id=uid)
        TelegramSettingsManager.set("telegram_chat_id", encrypted_chat,  user_id=uid)
        TelegramSettingsManager.set("telegram_enabled", "true",           user_id=uid)

        self._start_service(token, chat_id)

    def disable_telegram(self):
        uid = self.auth_manager.active_user_id
        logger.info(f"[AppController] disable_telegram() called for user_id={uid}")
        TelegramSettingsManager.set("telegram_enabled", "false", user_id=uid)

        if self.telegram_service:
            self.telegram_service.stop()
            self.telegram_service = None

    def restart_telegram(self):
        uid = self.auth_manager.active_user_id
        logger.info(f"[AppController] restart_telegram() called for user_id={uid}")

        if not TelegramSettingsManager.get_bool("telegram_enabled", user_id=uid):
            logger.warning("[AppController] restart_telegram() — telegram is disabled, aborting.")
            return False

        token_enc = TelegramSettingsManager.get("telegram_token",   user_id=uid)
        chat_enc  = TelegramSettingsManager.get("telegram_chat_id", user_id=uid)

        if not token_enc or not chat_enc:
            logger.warning("[AppController] restart_telegram() — no credentials found.")
            return False

        token   = decrypt(token_enc)
        chat_id = decrypt(chat_enc)

        if self.telegram_service:
            self.telegram_service.restart(token, chat_id)
        else:
            # If service was somehow None, just start it
            self._start_service(token, chat_id)

        return True

    def is_telegram_running(self) -> bool:
        if not self.telegram_service:
            return False
        return self.telegram_service.is_running()
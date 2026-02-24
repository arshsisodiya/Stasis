# src/core/app_controller.py

from src.config.settings_manager import SettingsManager
from src.config.crypto import decrypt, encrypt
from src.core.telegram.service import TelegramService

class AppController:

    def __init__(self):
        self.telegram_service = None

    # -------------------------
    # STARTUP INITIALIZATION
    # -------------------------

    def initialize(self):
        SettingsManager.initialize_defaults()

        if SettingsManager.get_bool("telegram_enabled"):
            self._start_telegram_from_settings()

    # -------------------------
    # INTERNAL START
    # -------------------------

    def _start_telegram_from_settings(self):
        token_enc = SettingsManager.get("telegram_token")
        chat_enc = SettingsManager.get("telegram_chat_id")


        if not token_enc or not chat_enc:
            return

        token = decrypt(token_enc)
        chat_id = decrypt(chat_enc)

        self._start_service(token, chat_id)

    def _start_service(self, token: str, chat_id: str):
        # Prevent duplicate instance
        if self.telegram_service:
            self.telegram_service.stop()

        self.telegram_service = TelegramService(token, chat_id)
        self.telegram_service.start()

    # -------------------------
    # PUBLIC TELEGRAM CONTROL
    # -------------------------

    def enable_telegram(self, token: str, chat_id: str):
        encrypted_token = encrypt(token)
        encrypted_chat = encrypt(chat_id)

        SettingsManager.set("telegram_token", encrypted_token)
        SettingsManager.set("telegram_chat_id", encrypted_chat)
        SettingsManager.set("telegram_enabled", "true")

        self._start_service(token, chat_id)

    def disable_telegram(self):
        SettingsManager.set("telegram_enabled", "false")

        if self.telegram_service:
            self.telegram_service.stop()
            self.telegram_service = None

    def restart_telegram(self):
        if not SettingsManager.get_bool("telegram_enabled"):
            return False

        token_enc = SettingsManager.get("telegram_token")
        chat_enc = SettingsManager.get("telegram_chat_id")

        if not token_enc or not chat_enc:
            return False

        token = decrypt(token_enc)
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
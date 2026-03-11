from src.database.database import get_connection


class BaseSettingsManager:
    """Base class for key-value settings management in different tables."""
    TABLE_NAME = "settings"

    @classmethod
    def get(cls, key: str):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            f"SELECT value FROM {cls.TABLE_NAME} WHERE key = ?",
            (key,)
        )

        row = cursor.fetchone()
        conn.close()

        if row:
            return row[0]

        return None

    @classmethod
    def set(cls, key: str, value):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            f"INSERT OR REPLACE INTO {cls.TABLE_NAME} (key, value) VALUES (?, ?)",
            (key, value)
        )

        conn.commit()
        conn.close()

    @classmethod
    def delete(cls, key: str):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            f"DELETE FROM {cls.TABLE_NAME} WHERE key = ?",
            (key,)
        )

        conn.commit()
        conn.close()

    @classmethod
    def get_bool(cls, key: str, default: bool = False) -> bool:
        value = cls.get(key)

        if value is None:
            return default

        if isinstance(value, bool):
            return value

        value_str = str(value).strip().lower()

        return value_str in ("true", "1", "yes")


class SettingsManager(BaseSettingsManager):
    """Handles general application settings."""
    TABLE_NAME = "settings"

    @staticmethod
    def initialize_defaults():
        conn = get_connection()
        cursor = conn.cursor()

        # Ensure settings table exists (redundant since init_db does it, but safer)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        defaults = {
            "file_logging_enabled": "false",
            "file_logging_essential_only": "false",
            "show_yesterday_comparison": "true",
            "hardware_acceleration": "true",
            "idle_detection": "1",
            "browser_tracking": "1"
        }

        for key, value in defaults.items():
            cursor.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value)
            )

        conn.commit()
        conn.close()


class TelegramSettingsManager(BaseSettingsManager):
    """Handles Telegram-specific settings."""
    TABLE_NAME = "telegram_settings"

    @staticmethod
    def initialize_defaults():
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telegram_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        defaults = {
            "telegram_enabled": "false",
            "telegram_token": None,
            "telegram_chat_id": None,
            "telegram_webcam_allowed": "true",
            "telegram_screenshot_allowed": "true",
            "telegram_system_control_allowed": "true"
        }

        for key, value in defaults.items():
            cursor.execute(
                "INSERT OR IGNORE INTO telegram_settings (key, value) VALUES (?, ?)",
                (key, str(value).lower() if isinstance(value, bool) else value)
            )

        conn.commit()
        conn.close()
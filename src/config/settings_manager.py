from src.database.database import get_connection


class SettingsManager:

    # ---------------------
    # INITIALIZATION
    # ---------------------

    @staticmethod
    def initialize_defaults():
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        defaults = {
            "telegram_enabled": "false",
            "telegram_token": None,
            "telegram_chat_id": None,
            "file_logging_enabled": "true",
            "file_logging_essential_only": "true"
        }

        for key, value in defaults.items():
            cursor.execute(
                "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
                (key, value)
            )

        conn.commit()
        conn.close()

    # ---------------------
    # GET
    # ---------------------

    @staticmethod
    def get(key: str):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT value FROM app_settings WHERE key = ?",
            (key,)
        )

        row = cursor.fetchone()
        conn.close()

        if row:
            return row[0]

        return None

    # ---------------------
    # SET
    # ---------------------

    @staticmethod
    def set(key: str, value):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
            (key, value)
        )

        conn.commit()
        conn.close()

    # ---------------------
    # DELETE
    # ---------------------

    @staticmethod
    def delete(key: str):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "DELETE FROM app_settings WHERE key = ?",
            (key,)
        )

        conn.commit()
        conn.close()

    # ---------------------
    # BOOLEAN HELPER
    # ---------------------

    @staticmethod
    def get_bool(key: str, default: bool = False) -> bool:
        value = SettingsManager.get(key)

        if value is None:
            return default

        if isinstance(value, bool):
            return value

        value_str = str(value).strip().lower()

        return value_str in ("true", "1", "yes")
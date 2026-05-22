import threading
from src.database.database import get_connection


class BaseSettingsManager:
    """Base class for key-value settings management in different tables."""
    TABLE_NAME = "settings"
    _cache: dict = {}
    _cache_lock = threading.Lock()

    @classmethod
    def get(cls, key: str, user_id: str = None):
        # Dynamically resolve user_id if not passed
        if user_id is None:
            try:
                from src.api.auth_routes import _app_controller
                if _app_controller and _app_controller.auth_manager:
                    user_id = _app_controller.auth_manager.active_user_id
            except Exception:
                pass

        cache_user_id = user_id if user_id is not None else "guest"
        cache_key = f"{cls.TABLE_NAME}:{cache_user_id}:{key}"
        with cls._cache_lock:
            if cache_key in cls._cache:
                return cls._cache[cache_key]

        conn = get_connection()
        cursor = conn.cursor()

        if user_id is not None:
            # Query user-specific setting, prioritizing it over guest (NULL) setting
            cursor.execute(
                f"SELECT value, user_id FROM {cls.TABLE_NAME} WHERE key = ? AND (user_id = ? OR user_id IS NULL)",
                (key, user_id)
            )
            rows = cursor.fetchall()
            # Sort rows: user_id IS NOT NULL comes last, so it overrides guest setting
            rows_sorted = sorted(rows, key=lambda r: 1 if r[1] is not None else 0)
            value = rows_sorted[-1][0] if rows_sorted else None
        else:
            cursor.execute(
                f"SELECT value FROM {cls.TABLE_NAME} WHERE key = ? AND user_id IS NULL",
                (key,)
            )
            row = cursor.fetchone()
            value = row[0] if row else None

        conn.close()

        with cls._cache_lock:
            cls._cache[cache_key] = value
        return value

    @classmethod
    def set(cls, key: str, value, user_id: str = None):
        if user_id is None:
            try:
                from src.api.auth_routes import _app_controller
                if _app_controller and _app_controller.auth_manager:
                    user_id = _app_controller.auth_manager.active_user_id
            except Exception:
                pass

        conn = get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("BEGIN")
            # Python-level transaction-safe upsert: delete existing matching setting first
            if user_id is not None:
                cursor.execute(f"DELETE FROM {cls.TABLE_NAME} WHERE key = ? AND user_id = ?", (key, user_id))
                cursor.execute(
                    f"INSERT INTO {cls.TABLE_NAME} (key, value, user_id) VALUES (?, ?, ?)",
                    (key, value, user_id)
                )
            else:
                cursor.execute(f"DELETE FROM {cls.TABLE_NAME} WHERE key = ? AND user_id IS NULL", (key,))
                cursor.execute(
                    f"INSERT INTO {cls.TABLE_NAME} (key, value, user_id) VALUES (?, ?, NULL)",
                    (key, value)
                )
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

        # Invalidate SettingsCache if it's general settings
        if cls.TABLE_NAME == "settings":
            try:
                from src.core.settings_cache import settings_cache
                settings_cache.invalidate(user_id)
            except Exception:
                pass

        cache_user_id = user_id if user_id is not None else "guest"
        cache_key = f"{cls.TABLE_NAME}:{cache_user_id}:{key}"
        with cls._cache_lock:
            cls._cache[cache_key] = str(value)

    @classmethod
    def delete(cls, key: str, user_id: str = None):
        if user_id is None:
            try:
                from src.api.auth_routes import _app_controller
                if _app_controller and _app_controller.auth_manager:
                    user_id = _app_controller.auth_manager.active_user_id
            except Exception:
                pass

        conn = get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("BEGIN")
            if user_id is not None:
                cursor.execute(
                    f"DELETE FROM {cls.TABLE_NAME} WHERE key = ? AND user_id = ?",
                    (key, user_id)
                )
            else:
                cursor.execute(
                    f"DELETE FROM {cls.TABLE_NAME} WHERE key = ? AND user_id IS NULL",
                    (key,)
                )
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

        # Invalidate SettingsCache if it's general settings
        if cls.TABLE_NAME == "settings":
            try:
                from src.core.settings_cache import settings_cache
                settings_cache.invalidate(user_id)
            except Exception:
                pass

        cache_user_id = user_id if user_id is not None else "guest"
        cache_key = f"{cls.TABLE_NAME}:{cache_user_id}:{key}"
        with cls._cache_lock:
            cls._cache.pop(cache_key, None)

    @classmethod
    def get_bool(cls, key: str, default: bool = False, user_id: str = None) -> bool:
        value = cls.get(key, user_id=user_id)

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

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT,
                value TEXT,
                user_id TEXT
            )
        """)

        defaults = {
            "notifications": "false",
            "notifications_enable_goal_events": "true",
            "notifications_enable_limit_events": "true",
            "notifications_enable_test_events": "true",
            "notifications_enable_digest_events": "true",
            "notifications_quiet_hours_enabled": "false",
            "notifications_quiet_start": "22:00",
            "notifications_quiet_end": "07:00",
            "notifications_context_quiet_mode_enabled": "true",
            "notifications_daily_digest_time": "21:00",
            "notifications_digest_last_sent_date": "",
            "notifications_limit_snooze_until": "",
            "file_logging_enabled": "false",
            "file_logging_essential_only": "false",
            "show_yesterday_comparison": "true",
            "show_goals_in_overview": "true",
            "hardware_acceleration": "true",
            "idle_detection": "true",
            "browser_tracking": "true",
            "weekly_report_telegram": "false",
            "weekly_report_verbosity": "standard",
            "weekly_report_last_sent_week": "",
            "widget_enabled": "false",
            "widget_details_hover_enabled": "true",
            "widget_theme": "normal",
            "widget_anchor_x": "0",
            "widget_anchor_y": "0",
            "auto_delete_days": "30",
            "auto_delete_stats_days": "0",
            "database_last_optimized": ""
        }

        for key, value in defaults.items():
            cursor.execute(
                "INSERT OR IGNORE INTO settings (key, value, user_id) VALUES (?, ?, NULL)",
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
                key TEXT,
                value TEXT,
                user_id TEXT
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
                "INSERT OR IGNORE INTO telegram_settings (key, value, user_id) VALUES (?, ?, NULL)",
                (key, str(value).lower() if isinstance(value, bool) else value)
            )

        conn.commit()
        conn.close()
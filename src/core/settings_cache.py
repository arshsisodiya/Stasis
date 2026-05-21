import time
from src.database.database import get_connection

CACHE_REFRESH_INTERVAL = 60  # seconds


class SettingsCache:
    def __init__(self):
        self.cache = {}
        self.last_refresh = {}

    def refresh(self, user_id=None):
        conn = get_connection()
        cursor = conn.cursor()

        if user_id is not None:
            cursor.execute("""
                SELECT key, value, user_id 
                FROM settings 
                WHERE user_id = ? OR user_id IS NULL
            """, (user_id,))
        else:
            cursor.execute("""
                SELECT key, value, user_id 
                FROM settings 
                WHERE user_id IS NULL
            """)
        rows = cursor.fetchall()
        conn.close()

        # Sort rows so that user_id IS NULL comes first, and user-specific override comes second
        rows_sorted = sorted(rows, key=lambda r: 1 if r[2] is not None else 0)

        user_cache = {}
        for k, v, _ in rows_sorted:
            user_cache[k] = v

        self.cache[user_id] = user_cache
        self.last_refresh[user_id] = time.monotonic()

    def warm(self, user_id=None):
        """Load all settings into cache immediately; avoids DB hit on first get()."""
        self.refresh(user_id)

    def invalidate(self, user_id=None):
        """Force eviction of a user's settings cache."""
        self.cache.pop(user_id, None)
        self.last_refresh.pop(user_id, None)

    def get(self, key, default=None, user_id=None):
        # If user_id is not provided, dynamically fetch active_user_id from auth_manager
        if user_id is None:
            try:
                from src.api.auth_routes import _app_controller
                if _app_controller and _app_controller.auth_manager:
                    user_id = _app_controller.auth_manager.active_user_id
            except Exception:
                pass

        now = time.monotonic()
        last_ref = self.last_refresh.get(user_id, 0)

        if now - last_ref > CACHE_REFRESH_INTERVAL:
            self.refresh(user_id)

        user_cache = self.cache.get(user_id, {})
        return user_cache.get(key, default)


settings_cache = SettingsCache()
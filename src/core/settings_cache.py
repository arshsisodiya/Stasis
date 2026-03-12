import time
from src.database.database import get_connection

CACHE_REFRESH_INTERVAL = 60  # seconds


class SettingsCache:
    def __init__(self):
        self.cache = {}
        self.last_refresh = 0

    def refresh(self):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()

        conn.close()

        self.cache = {k: v for k, v in rows}
        self.last_refresh = time.monotonic()

    def warm(self):
        """Load all settings into cache immediately; avoids DB hit on first get()."""
        self.refresh()

    def get(self, key, default=None):
        now = time.monotonic()

        if now - self.last_refresh > CACHE_REFRESH_INTERVAL:
            self.refresh()

        return self.cache.get(key, default)


settings_cache = SettingsCache()
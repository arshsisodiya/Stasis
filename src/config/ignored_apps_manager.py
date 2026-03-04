import json
import os
from functools import lru_cache

IGNORED_APPS_FILE = os.path.join(
    os.path.dirname(__file__),
    "ignored_apps.json"
)

@lru_cache(maxsize=1)
def load_ignored_apps():
    if not os.path.exists(IGNORED_APPS_FILE):
        return []
    try:
        with open(IGNORED_APPS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("ignore_processes", [])
    except Exception as e:
        print(f"Error loading ignored apps: {e}")
        return []

def is_ignored(app_name: str) -> bool:
    if not app_name:
        return False
    ignored_list = load_ignored_apps()
    app_name_lower = app_name.lower().replace(".exe", "")
    return any(ignored.lower().replace(".exe", "") == app_name_lower for ignored in ignored_list)

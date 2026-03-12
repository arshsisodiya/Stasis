import json
import os

IGNORED_APPS_FILE = os.path.join(
    os.path.dirname(__file__),
    "ignored_apps.json"
)

_cached_list: list = []
_cached_mtime: float = 0.0


def load_ignored_apps():
    global _cached_list, _cached_mtime
    if not os.path.exists(IGNORED_APPS_FILE):
        return []
    try:
        mtime = os.path.getmtime(IGNORED_APPS_FILE)
        if mtime != _cached_mtime:
            with open(IGNORED_APPS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _cached_list = data.get("ignore_processes", [])
            _cached_mtime = mtime
        return _cached_list
    except Exception as e:
        print(f"Error loading ignored apps: {e}")
        return []


# Pre-built lowercase set for O(1) lookup, refreshed when file changes
_ignored_set: set = set()
_ignored_set_mtime: float = 0.0


def is_ignored(app_name: str) -> bool:
    global _ignored_set, _ignored_set_mtime
    if not app_name:
        return False
    ignored_list = load_ignored_apps()
    if _ignored_set_mtime != _cached_mtime:
        _ignored_set = {n.lower().replace(".exe", "") for n in ignored_list}
        _ignored_set_mtime = _cached_mtime
    return app_name.lower().replace(".exe", "") in _ignored_set

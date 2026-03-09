import os
import time
import winreg
from src.utils.logger import setup_logger
logger = setup_logger()

# ---------------------------------------------------
# Cache
# ---------------------------------------------------

APP_CACHE = {
    "data": None,
    "timestamp": 0
}

CACHE_TTL = 600  # seconds


# ---------------------------------------------------
# Helpers
# ---------------------------------------------------

def normalize_key(name):
    if not name:
        return ""
    return name.lower().replace(".exe", "").strip()


def clean_name(name):
    if not name:
        return "Unknown"
    name = os.path.splitext(name)[0]
    return name.replace("_", " ").title()


def safe_run(func, *args):
    try:
        return func(*args)
    except Exception as e:
        logger.info(f"[app_discovery] {func.__name__} failed: {e}")
        return {}


# ---------------------------------------------------
# Source 1 — Activity Logs (Most Important)
# ---------------------------------------------------

def get_apps_from_history(cursor):

    apps = {}

    if not cursor:
        logger.info("[app_discovery] No DB cursor provided for history discovery")
        return apps

    try:
        cursor.execute("""
            SELECT DISTINCT app_name
            FROM activity_logs
            WHERE active_seconds > 5
        """)

        rows = cursor.fetchall()
        logger.info(f"[app_discovery] history apps found: {len(rows)}")

        for row in rows:

            exe = row[0]
            key = normalize_key(exe)

            apps[key] = {
                "name": clean_name(exe),
                "exe": exe,
                "appid": "",
                "type": "desktop",
                "source": "history"
            }

    except Exception as e:
        logger.info(f"[app_discovery] history query error: {e}")

    return apps


# ---------------------------------------------------
# Source 2 — Installed Apps (Registry)
# ---------------------------------------------------

def scan_registry_apps():

    apps = {}

    registry_paths = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    ]

    for path in registry_paths:

        try:
            reg = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path)

            subkey_count = winreg.QueryInfoKey(reg)[0]
            logger.info(f"[app_discovery] scanning registry: {path} ({subkey_count} keys)")

            for i in range(subkey_count):

                try:
                    subkey_name = winreg.EnumKey(reg, i)
                    subkey = winreg.OpenKey(reg, subkey_name)

                    name, _ = winreg.QueryValueEx(subkey, "DisplayName")

                    key = normalize_key(name)

                    apps[key] = {
                        "name": name,
                        "exe": "",
                        "appid": "",
                        "type": "desktop",
                        "source": "registry"
                    }

                except Exception:
                    continue

        except Exception as e:
            logger.info(f"[app_discovery] registry scan failed for {path}: {e}")

    logger.info(f"[app_discovery] registry apps discovered: {len(apps)}")

    return apps


# ---------------------------------------------------
# Merge Sources
# ---------------------------------------------------

def merge_sources(*sources):

    apps = {}

    for source in sources:

        for key, value in source.items():

            if key not in apps:
                apps[key] = value
            else:
                existing = apps[key]

                if not existing.get("exe") and value.get("exe"):
                    existing["exe"] = value["exe"]

    return apps


# ---------------------------------------------------
# Main Discovery
# ---------------------------------------------------

def get_installed_apps(cursor=None):

    now = time.time()

    if APP_CACHE["data"] and now - APP_CACHE["timestamp"] < CACHE_TTL:
        logger.info("[app_discovery] returning cached apps")
        return APP_CACHE["data"]

    logger.info("[app_discovery] starting discovery")

    history_apps = safe_run(get_apps_from_history, cursor)
    registry_apps = safe_run(scan_registry_apps)

    merged = merge_sources(
        history_apps,
        registry_apps
    )

    result = sorted(merged.values(), key=lambda x: x["name"].lower())

    logger.info(f"[app_discovery] total apps discovered: {len(result)}")

    APP_CACHE["data"] = result
    APP_CACHE["timestamp"] = now

    return result
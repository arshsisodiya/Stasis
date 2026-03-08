import subprocess
import json
import os
import time
from typing import Dict, List

# -----------------------------
# Configuration
# -----------------------------

APP_CACHE = {
    "data": None,
    "timestamp": 0
}

CACHE_TTL = 600  # seconds (10 minutes)


# -----------------------------
# Utility Functions
# -----------------------------

def normalize_exe_name(exe: str) -> str:
    """Normalize executable name for consistent matching."""
    if not exe:
        return ""
    exe = exe.lower()
    return exe.replace(".exe", "").strip()


def clean_display_name(name: str) -> str:
    """Convert exe or raw name to user friendly format."""
    if not name:
        return "Unknown"

    name = os.path.splitext(name)[0]
    name = name.replace("_", " ").strip()
    return name.title()


# -----------------------------
# Database App Discovery
# -----------------------------

def get_apps_from_history(db_cursor) -> Dict[str, dict]:
    """
    Get apps discovered from activity logs.
    """
    apps = {}

    if not db_cursor:
        return apps

    try:
        db_cursor.execute("""
            SELECT DISTINCT app_name
            FROM activity_logs
            WHERE active_seconds > 5
        """)

        for row in db_cursor.fetchall():
            exe = row[0]
            key = normalize_exe_name(exe)

            apps[key] = {
                "name": clean_display_name(exe),
                "exe": exe,
                "appid": "",
                "type": "desktop",
                "source": "history"
            }

    except Exception as e:
        print(f"[app_discovery] DB error: {e}")

    return apps


# -----------------------------
# System App Discovery
# -----------------------------

def run_powershell_app_discovery() -> List[dict]:
    """
    Uses PowerShell Get-StartApps to detect installed apps.
    """
    try:
        cmd = [
            "powershell",
            "-Command",
            "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json"
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )

        if not result.stdout.strip():
            return []

        data = json.loads(result.stdout)

        if not isinstance(data, list):
            data = [data]

        return data

    except Exception as e:
        print(f"[app_discovery] PowerShell error: {e}")
        return []


def extract_exe_from_appid(appid: str) -> str:
    """Attempt to extract exe name from AppID."""
    if not appid:
        return ""

    appid = appid.strip()

    if appid.lower().endswith(".exe"):
        return os.path.basename(appid)

    if "\\" in appid:
        parts = appid.split("\\")
        last = parts[-1]
        if last.lower().endswith(".exe"):
            return last

    return ""


def detect_app_type(appid: str, exe: str) -> str:
    """Detect application type."""
    if "!" in appid:
        return "uwp"
    if exe:
        return "desktop"
    return "unknown"


def get_apps_from_system() -> Dict[str, dict]:
    """
    Discover apps using PowerShell.
    """
    apps = {}

    ps_apps = run_powershell_app_discovery()

    for app in ps_apps:
        name = app.get("Name", "")
        appid = app.get("AppID", "")

        exe = extract_exe_from_appid(appid)

        key = normalize_exe_name(exe or name)

        apps[key] = {
            "name": name or clean_display_name(exe),
            "exe": exe,
            "appid": appid,
            "type": detect_app_type(appid, exe),
            "source": "system"
        }

    return apps


# -----------------------------
# Main App Discovery
# -----------------------------

def get_installed_apps(db_cursor=None) -> List[dict]:
    """
    Returns merged list of apps from:
    - activity logs
    - system discovery
    """

    now = time.time()

    if APP_CACHE["data"] and (now - APP_CACHE["timestamp"] < CACHE_TTL):
        return APP_CACHE["data"]

    apps: Dict[str, dict] = {}

    # historical apps
    history_apps = get_apps_from_history(db_cursor)

    for key, value in history_apps.items():
        apps[key] = value

    # system apps
    system_apps = get_apps_from_system()

    for key, value in system_apps.items():
        if key not in apps:
            apps[key] = value
        else:
            # merge missing fields
            if not apps[key].get("exe") and value.get("exe"):
                apps[key]["exe"] = value["exe"]

            if not apps[key].get("appid") and value.get("appid"):
                apps[key]["appid"] = value["appid"]

    result = sorted(apps.values(), key=lambda x: x["name"].lower())

    APP_CACHE["data"] = result
    APP_CACHE["timestamp"] = now

    return result
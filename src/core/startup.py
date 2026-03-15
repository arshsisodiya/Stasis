import os
from pathlib import Path
import winreg
from src.utils.logger import setup_logger

logger = setup_logger()

RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_REG_NAME = "Stasis"
APP_AUMID = "Stasis: Digital Wellbeing"
START_MENU_SHORTCUT_NAME = "Stasis Digital Wellbeing.lnk"


def _resolve_icon_path() -> str | None:
    repo_root = Path(__file__).resolve().parents[2]
    candidates = [
        repo_root / "frontend" / "src-tauri" / "icons" / "icon.ico",
        repo_root / "frontend" / "src-tauri" / "icons" / "Square44x44Logo.png",
        repo_root / "frontend" / "src-tauri" / "icons" / "Square71x71Logo.png",
        repo_root / "frontend" / "src-tauri" / "icons" / "icon.png",
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            return os.fspath(path)
    return None


def _start_menu_shortcut_path() -> str:
    appdata = os.environ.get("APPDATA", "")
    programs = Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
    return os.fspath(programs / START_MENU_SHORTCUT_NAME)


def _set_shortcut_app_id(shortcut_path: str, app_id: str):
    from pythoncom import VT_LPWSTR
    from win32com.propsys import propsys, pscon

    store = propsys.SHGetPropertyStoreFromParsingName(
        shortcut_path,
        None,
        2,  # GPS_READWRITE
        propsys.IID_IPropertyStore,
    )
    store.SetValue(pscon.PKEY_AppUserModel_ID, propsys.PROPVARIANTType(app_id, VT_LPWSTR))
    store.Commit()


def ensure_notification_identity(exe_path: str, launch_args: str = "", working_dir: str | None = None):
    """One-time self-heal for notification attribution (Start Menu shortcut + AUMID)."""
    try:
        from win32com.client import Dispatch

        shortcut_path = _start_menu_shortcut_path()
        os.makedirs(os.path.dirname(shortcut_path), exist_ok=True)

        shell = Dispatch("WScript.Shell")
        shortcut = shell.CreateShortcut(shortcut_path)
        shortcut.Targetpath = exe_path
        shortcut.Arguments = launch_args or ""
        shortcut.WorkingDirectory = working_dir or os.path.dirname(exe_path)
        icon_path = _resolve_icon_path()
        if icon_path:
            shortcut.IconLocation = f"{icon_path},0"
        shortcut.Description = "Stasis: Digital Wellbeing"
        shortcut.Save()

        _set_shortcut_app_id(shortcut_path, APP_AUMID)
        logger.info("Notification identity self-heal ensured")
    except Exception as e:
        logger.warning(f"Notification identity self-heal failed: {e}")


def add_to_startup(exe_path: str):
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            RUN_KEY_PATH,
            0,
            winreg.KEY_READ | winreg.KEY_SET_VALUE
        ) as key:

            try:
                existing_value, _ = winreg.QueryValueEx(key, APP_REG_NAME)

                # If already correct, do nothing
                if existing_value == exe_path:
                    logger.info("Startup entry already exists and is correct")
                    return

                # If path changed, update it
                winreg.SetValueEx(key, APP_REG_NAME, 0, winreg.REG_SZ, exe_path)
                logger.info("Startup entry updated")

            except FileNotFoundError:
                # Entry does not exist → create it
                winreg.SetValueEx(key, APP_REG_NAME, 0, winreg.REG_SZ, exe_path)
                logger.info("Startup entry created")

    except Exception as e:
        logger.error(f"Failed to add to startup: {e}")


def remove_from_startup():
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            RUN_KEY_PATH,
            0,
            winreg.KEY_SET_VALUE
        ) as key:
            winreg.DeleteValue(key, APP_REG_NAME)

        logger.info("Application removed from Windows startup")
    except FileNotFoundError:
        logger.warning("Startup registry entry not found")
    except Exception as e:
        logger.error(f"Failed to remove from startup: {e}")

# startup.py

import winreg
from src.utils.logger import setup_logger

logger = setup_logger()

RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_REG_NAME = "Stasis"


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

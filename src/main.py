# main.py
import os
import sys
import threading
import time

from src.api.api_server import APIServer
from src.core.activity_logger import start_logging
from src.core.app_controller import AppController
from src.core.file_monitor import file_monitor_controller
from src.core.single_instance import ensure_single_instance
from src.core.startup import add_to_startup, ensure_notification_identity
from src.database.database import init_db
from src.services.blocking_service import BlockingService
from src.services.update_manager import UpdateManager
from src.utils.logger import setup_logger
from src.core.shutdown import trigger_shutdown, shutdown_event
import signal
from src.core.data_retention import retention_worker
from src.api.report_routes import run_weekly_report_scheduler

logger = setup_logger()
ENABLE_UPDATER = False


# ===============================
# Safe Thread Wrappers
# ===============================

def safe_activity_logger():
    try:
        logger.info("Activity logger thread started")
        start_logging()
    except Exception:
        logger.exception("Activity logger crashed unexpectedly")

def safe_data_retention():
    try:
        logger.info("Data retention thread started")
        retention_worker()
    except Exception:
        logger.exception("Data retention worker crashed unexpectedly")

def safe_weekly_report_scheduler():
    try:
        logger.info("Weekly report scheduler thread started")
        run_weekly_report_scheduler(stop_event=shutdown_event)
    except Exception:
        logger.exception("Weekly report scheduler crashed unexpectedly")
# FileMonitor is managed by FileMonitorController — no wrapper needed.


def get_executable_path():
    if getattr(sys, "frozen", False):
        return sys.executable
    return os.path.abspath(__file__)


def main():
    logger.info("Application started")
    
    # Track resources for graceful shutdown
    api_server = None
    blocking_service = None
    threads = []

    def handle_signal(signum, frame):
        logger.info(f"Signal {signum} received. Initiating graceful shutdown...")
        trigger_shutdown()
        if api_server: api_server.stop()
        if blocking_service: blocking_service.stop()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # 🔒 Ensure single instance
    _app_mutex = ensure_single_instance()
    
    app_controller = AppController()
    app_controller.initialize()

    def api_server_vessel():
        nonlocal api_server
        try:
            logger.info("API server thread started")
            api_server = APIServer(app_controller)
            api_server.start()
        except Exception:
            logger.exception("API server crashed unexpectedly")

    init_db()

    # Pre-warm settings cache so the first get() doesn't hit the DB
    from src.core.settings_cache import settings_cache
    settings_cache.warm()

    # One-time self-heal for Windows notification attribution (shortcut + AUMID).
    if os.name == "nt":
        if getattr(sys, "frozen", False):
            ensure_notification_identity(exe_path=get_executable_path())
        else:
            repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            ensure_notification_identity(
                exe_path=sys.executable,
                launch_args="-m src.main",
                working_dir=repo_root,
            )

    if getattr(sys, "frozen", False):
        add_to_startup(get_executable_path())

    time.sleep(1) # Reduced startup delay

    blocking_service = BlockingService()
    blocking_service.start()
    logger.info("Blocking Service started on startup")

    # Start tracking threads
    t_api = threading.Thread(target=api_server_vessel, daemon=True, name="APIServerThread")
    t_log = threading.Thread(target=safe_activity_logger, daemon=True, name="ActivityLoggerThread")
    t_ret = threading.Thread(target=safe_data_retention, daemon=True, name="DataRetentionThread")
    t_weekly = threading.Thread(target=safe_weekly_report_scheduler, daemon=True, name="WeeklyReportSchedulerThread")

    for t in [t_api, t_log, t_ret, t_weekly]:
        t.start()
        threads.append(t)

    # Start file monitor controller — starts the Observer only if the toggle is enabled.
    # It responds instantly to setting changes without polling.
    file_monitor_controller.start_manager()

    logger.info("Activity tracking services started")

    if ENABLE_UPDATER and getattr(sys, "frozen", False):
        updater = UpdateManager(silent=True, logger=logger)
        updater.start()

    logger.info("System initialization completed")

    # Wait for shutdown signal
    while not shutdown_event.is_set():
        try:
            time.sleep(1)
        except KeyboardInterrupt:
            trigger_shutdown()
            break

    logger.info("Shutdown event set. Waiting for threads to conclude...")
    
    # Stop listeners manually (from activity_logger)
    try:
        from src.core.activity_logger import input_tracker
        input_tracker.stop()
    except Exception:
        pass

    # Give threads a few seconds to finish their cleanup
    for t in threads:
        t.join(timeout=3)
    
    logger.info("Stasis has shut down gracefully.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.critical("Fatal error occurred in main()", exc_info=True)
        sys.exit(1)

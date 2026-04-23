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
from src.database.database import init_db, log_system_boot, log_system_shutdown
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
    shutdown_status = 'graceful'

    def handle_signal(signum, frame):
        logger.info(f"Signal {signum} received. Initiating graceful shutdown...")
        
        status = 'graceful'
        if signum == signal.SIGTERM:
            status = 'system_shutdown'
            
        trigger_shutdown(status=status)
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
    log_system_boot()
    logger.info("System lifecycle session initialized")

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

    # if getattr(sys, "frozen", False):
    #     add_to_startup(get_executable_path())

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
    # We join them in parallel-ish by using a short timeout and multiple passes
    for _ in range(3): # Try 3 times
        active_threads = [t for t in threads if t.is_alive()]
        if not active_threads:
            break
        for t in active_threads:
            t.join(timeout=0.5)
    
    # Finalize system lifecycle logging
    try:
        from src.core.shutdown import shutdown_status as final_status
        # Always log the shutdown time in system_lifecycle to record 'Last Seen'
        # Returns the total system uptime duration
        is_actual = (final_status == 'system_shutdown')
        uptime_duration = log_system_shutdown(is_actual_shutdown=is_actual)
        logger.info(f"System lifecycle updated. Total Uptime: {uptime_duration}s (Actual Shutdown: {is_actual})")
        
        # Send Telegram shutdown notification and daily digest if enabled
        if app_controller.telegram_service:
            # 1. Basic shutdown summary
            try:
                app_controller.telegram_service.send_shutdown_notification(
                    duration_seconds=uptime_duration,
                    status=final_status
                )
            except Exception:
                logger.exception("Failed to send shutdown notification to Telegram")
            
            # 2. Daily productivity digest (if it's the end of the day or shutdown)
            try:
                if blocking_service:
                    logger.info("Generating daily digest data for shutdown...")
                    digest_data = blocking_service.get_daily_digest_data()
                    if digest_data:
                        logger.info("Sending daily digest via Telegram...")
                        app_controller.telegram_service.send_daily_digest(digest_data)
                    else:
                        logger.info("No digest data available for today.")
            except Exception:
                logger.exception("Failed to send daily digest during shutdown teardown")
    except Exception:
        logger.exception("Failed to finalize system lifecycle session")

    logger.info("Stasis has shut down gracefully.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.critical("Fatal error occurred in main()", exc_info=True)
        sys.exit(1)

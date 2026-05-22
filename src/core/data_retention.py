import time
from datetime import datetime, timedelta

from src.database.database import (
    get_connection,
    delete_expired_telemetry,
    optimize_database
)
from src.config.settings_manager import SettingsManager
from src.utils.logger import setup_logger
from src.core.shutdown import shutdown_event

logger = setup_logger()

# Run cleanup every 6 hours
RETENTION_CHECK_INTERVAL = 6 * 3600


def retention_worker():
    """
    Background worker that periodically deletes
    activity data older than the configured retention period
    for all registered users (and guest), and runs database defragmentation
    and indexing optimization once every 7 days.
    """

    logger.info("Data retention and database performance tuning worker started")

    while not shutdown_event.is_set():
        # 1. Execute Retention Cleanup across all users and guest
        try:
            # Query all user IDs
            conn = get_connection()
            cursor = conn.cursor()
            user_ids = []
            try:
                cursor.execute("SELECT id FROM users")
                user_ids = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Could not fetch user list for retention: {e}")
            finally:
                conn.close()

            # Purge guest telemetry
            try:
                delete_expired_telemetry(user_id=None)
                logger.debug("Guest telemetry retention cleanup executed")
            except Exception as e:
                logger.error(f"Guest telemetry retention cleanup failed: {e}")

            # Purge authenticated users' telemetry
            for uid in user_ids:
                try:
                    delete_expired_telemetry(user_id=uid)
                    logger.debug(f"User {uid} telemetry retention cleanup executed")
                except Exception as e:
                    logger.error(f"User {uid} telemetry retention cleanup failed: {e}")

            logger.info("Retention cleanup completed successfully for all contexts")

        except Exception:
            logger.exception("Telemetry retention cleanup encountered an unexpected error")

        # 2. Programmatic SQLite Defragmentation & Performance Tuning (Every 7 Days)
        try:
            last_opt_str = SettingsManager.get("database_last_optimized")
            should_optimize = False

            if not last_opt_str:
                should_optimize = True
            else:
                try:
                    last_opt = datetime.strptime(last_opt_str, "%Y-%m-%d %H:%M:%S")
                    if datetime.now() - last_opt >= timedelta(days=7):
                        should_optimize = True
                except Exception:
                    should_optimize = True

            if should_optimize:
                logger.info("Programmatic database defragmentation triggered (7 days since last tune or never tuned)")
                result = optimize_database()
                logger.info(f"Database performance tuning success: Reclaimed {result['reclaimed_mb']} MB. New size: {result['new_size_mb']} MB.")

        except Exception:
            logger.exception("Programmatic database defragmentation failed")

        shutdown_event.wait(RETENTION_CHECK_INTERVAL)
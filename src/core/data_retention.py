import time

from src.database.database import (
    get_auto_delete_days,
    delete_activity_older_than
)

from src.utils.logger import setup_logger
from src.core.shutdown import shutdown_event

logger = setup_logger()

# Run cleanup every 6 hours
RETENTION_CHECK_INTERVAL = 6 * 3600


def retention_worker():
    """
    Background worker that periodically deletes
    activity data older than the configured retention period.
    """

    logger.info("Data retention worker started")

    while not shutdown_event.is_set():
        try:
            days = get_auto_delete_days()

            if days is None:
                logger.debug("Retention disabled (forever)")
            else:
                delete_activity_older_than(days)
                logger.info(f"Retention cleanup executed (>{days} days)")

        except Exception:
            logger.exception("Retention cleanup failed")

        shutdown_event.wait(RETENTION_CHECK_INTERVAL)
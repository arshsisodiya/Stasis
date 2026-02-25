# logger.py

import logging
import os
from datetime import datetime, timedelta
from src.config.storage import get_logs_dir

LOG_RETENTION_DAYS = 7


def cleanup_old_logs(log_dir):
    cutoff = datetime.now() - timedelta(days=LOG_RETENTION_DAYS)

    for file in os.listdir(log_dir):
        if file.startswith("stasis_") and file.endswith(".log"):
            path = os.path.join(log_dir, file)
            try:
                file_time = datetime.fromtimestamp(os.path.getmtime(path))
                if file_time < cutoff:
                    os.remove(path)
            except Exception:
                pass


def setup_logger():
    log_dir = get_logs_dir()

    today = datetime.now().strftime("%Y-%m-%d")
    log_file = os.path.join(log_dir, f"stasis_{today}.log")

    logger = logging.getLogger("stasis")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    if logger.hasHandlers():
        logger.handlers.clear()

    file_handler = logging.FileHandler(log_file, encoding="utf-8")

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(filename)s:%(lineno)d | %(message)s",
        "%Y-%m-%d %H:%M:%S"
    )

    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    cleanup_old_logs(log_dir)

    return logger


def log_exception(logger, message):
    logger.exception(message)

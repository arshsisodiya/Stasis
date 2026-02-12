# logger.py

import logging
import os
from datetime import datetime, timedelta

APP_NAME = "Startup Notifier"
LOG_RETENTION_DAYS = 7


def get_program_data_dir():
    """
    Try using:
    C:\ProgramData\StartupNotifier
    """
    base = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    app_dir = os.path.join(base, APP_NAME)

    try:
        os.makedirs(app_dir, exist_ok=True)
        return app_dir
    except PermissionError:
        return None
    except Exception:
        return None


def get_app_data_dir():

    base = os.environ.get("APPDATA", os.path.expanduser("~"))
    app_dir = os.path.join(base, APP_NAME)
    os.makedirs(app_dir, exist_ok=True)
    return app_dir

def get_base_storage_dir():
    """
    Try ProgramData first.
    If not possible → fallback to AppData.
    """
    program_data_dir = get_program_data_dir()

    if program_data_dir and os.access(program_data_dir, os.W_OK):
        return program_data_dir

    return get_app_data_dir()


def get_log_dir():
    base_dir = get_base_storage_dir()
    log_dir = os.path.join(base_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def cleanup_old_logs(log_dir):
    cutoff = datetime.now() - timedelta(days=LOG_RETENTION_DAYS)

    for file in os.listdir(log_dir):
        if file.startswith("startup_") and file.endswith(".log"):
            path = os.path.join(log_dir, file)
            try:
                file_time = datetime.fromtimestamp(os.path.getmtime(path))
                if file_time < cutoff:
                    os.remove(path)
            except Exception:
                pass


def setup_logger():
    log_dir = get_log_dir()

    today = datetime.now().strftime("%Y-%m-%d")
    log_file = os.path.join(log_dir, f"startup_{today}.log")

    logger = logging.getLogger("startup_notifier")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    if logger.hasHandlers():
        logger.handlers.clear()

    file_handler = logging.FileHandler(
        log_file,
        encoding="utf-8"
    )

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

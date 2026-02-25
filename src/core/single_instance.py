# single_instance.py

import sys
import win32event
import win32api
import winerror

MUTEX_NAME = "Global\\StasisSingleInstance"


def ensure_single_instance():
    mutex = win32event.CreateMutex(None, False, MUTEX_NAME)
    last_error = win32api.GetLastError()

    if last_error == winerror.ERROR_ALREADY_EXISTS:
        # Another instance already running
        sys.exit(0)

    return mutex

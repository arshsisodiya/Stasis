import ctypes
import threading
import re
import win32gui
import win32process
import psutil

# ===============================
# CONFIG
# ===============================
COINIT_APARTMENTTHREADED = 0x2
TreeScope_Subtree = 7
UIA_ValuePatternId = 10002
UIA_ControlTypePropertyId = 30003
UIA_EditControlTypeId = 50004

_TIMEOUT = 2.5  # faster for logger loop
_URL_RE = re.compile(r"(https?://[^\s]+)", re.IGNORECASE)

# ===============================
# PRELOAD UIA (IMPORTANT)
# ===============================
import comtypes
import comtypes.client

# Generate once at import time (not every call)
try:
    comtypes.client.GetModule("UIAutomationCore.dll")
except Exception:
    pass

from comtypes.gen import UIAutomationClient


# ===============================
# COM HELPERS
# ===============================
def _co_initialize():
    ctypes.windll.ole32.CoInitializeEx(None, COINIT_APARTMENTTHREADED)


def _co_uninitialize():
    ctypes.windll.ole32.CoUninitialize()


# ===============================
# CORE READER
# ===============================
def _read_url(hwnd, result):
    try:
        uia = comtypes.client.CreateObject(
            UIAutomationClient.CUIAutomation,
            interface=UIAutomationClient.IUIAutomation,
        )

        root = uia.ElementFromHandle(hwnd)
        if not root:
            return

        condition = uia.CreatePropertyCondition(
            UIA_ControlTypePropertyId,
            UIA_EditControlTypeId
        )

        edits = root.FindAll(TreeScope_Subtree, condition)
        if not edits:
            return

        for i in range(edits.Length):
            try:
                el = edits.GetElement(i)

                vp_unknown = el.GetCurrentPattern(UIA_ValuePatternId)
                if not vp_unknown:
                    continue

                vp = vp_unknown.QueryInterface(
                    UIAutomationClient.IUIAutomationValuePattern
                )

                val = (vp.CurrentValue or "").strip()
                if not val:
                    continue

                # Full http(s) URL
                match = _URL_RE.search(val)
                if match:
                    result[0] = match.group(1)
                    return

                # Chrome hides protocol sometimes
                if "." in val and " " not in val:
                    result[0] = "https://" + val
                    return

            except Exception:
                continue

    except Exception:
        return


# ===============================
# PUBLIC API (USED BY LOGGER)
# ===============================
def get_browser_url(hwnd=None):
    if hwnd is None:
        hwnd = win32gui.GetForegroundWindow()

    if not hwnd:
        return None

    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc_name = psutil.Process(pid).name().lower()
    except Exception:
        return None

    if not any(b in proc_name for b in [
        "chrome", "msedge", "brave", "opera",
        "firefox", "vivaldi"
    ]):
        return None

    result = [None]

    t = threading.Thread(
        target=_read_url,
        args=(hwnd, result),
        daemon=True
    )

    _co_initialize()
    try:
        t.start()
        t.join(_TIMEOUT)
    finally:
        _co_uninitialize()

    return result[0]


# ===============================
# BACKGROUND URL RESOLVER
# ===============================
_URL_POLL_INTERVAL = 3  # seconds between background URL polls

BROWSER_NAMES = ["chrome", "msedge", "brave", "firefox", "opera", "vivaldi"]


class BackgroundURLResolver:
    """
    Resolves browser URLs on a dedicated daemon thread every _URL_POLL_INTERVAL
    seconds.  The main logger loop reads the cached result via get_cached_url()
    which never blocks.

    This keeps the heavy COM/UIA work off the 1-second logger tick.
    """

    def __init__(self):
        self._cached_url: str | None = None
        self._cached_hwnd: int | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # -- public ---------------------------------------------------------
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._poll_loop, daemon=True, name="URLResolver"
        )
        self._thread.start()

    def stop(self):
        self._stop.set()

    def get_cached_url(self, hwnd: int, app_name: str) -> str | None:
        """
        Returns the last resolved URL if *hwnd* matches the window that was
        resolved.  If the foreground window changed since the last poll,
        returns None (the next poll cycle will pick it up).
        """
        if not any(b in app_name.lower() for b in BROWSER_NAMES):
            return None
        with self._lock:
            if self._cached_hwnd == hwnd:
                return self._cached_url
        return None

    # -- internal -------------------------------------------------------
    def _poll_loop(self):
        while not self._stop.is_set():
            try:
                hwnd = win32gui.GetForegroundWindow()
                if hwnd:
                    url = get_browser_url(hwnd=hwnd)
                    with self._lock:
                        self._cached_hwnd = hwnd
                        self._cached_url = url
            except Exception:
                pass
            self._stop.wait(_URL_POLL_INTERVAL)


# Singleton — started in activity_logger.start_logging()
url_resolver = BackgroundURLResolver()
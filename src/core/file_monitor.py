"""
file_monitor.py
───────────────
File system activity monitor.

Implements a FileMonitorController that:
  - Stays dormant (zero CPU / zero Drive I/O) when file logging is disabled.
  - Starts the watchdog Observer the moment the toggle is turned ON.
  - Stops and fully tears down the Observer the moment the toggle is turned OFF.
  - Responds instantly to setting changes via a threading.Event signal rather
    than sleeping through a long poll interval.

Usage
-----
  # In main.py
  from src.core.file_monitor import file_monitor_controller
  file_monitor_controller.start_manager()          # starts background thread

  # In wellbeing_routes.py (after saving the setting)
  from src.core.file_monitor import file_monitor_controller
  file_monitor_controller.notify_setting_changed() # wake manager immediately
"""

import time
import datetime
import threading
import psutil
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from src.core.shutdown import shutdown_event
from src.config.storage import get_data_dir
from src.database.database import get_connection
from src.utils.logger import setup_logger

logger = setup_logger()

APP_NAME = "Stasis"
BASE_DIR = get_data_dir()

IGNORE_KEYWORDS = [
    "$Recycle.Bin",
    "AppData",
    "Temp",
    "ProgramData",
    "Windows",
    "System Volume Information",
    "Program Files",
    APP_NAME,
]

ESSENTIAL_EXTENSIONS = {
    'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'csv', 'md',
    'mp4', 'mkv', 'avi', 'mp3', 'wav', 'png', 'jpg', 'jpeg', 'gif', 'webp',
    'exe', 'msi', 'zip', 'rar', '7z', 'apk',
    'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'yml', 'yaml',
    'c', 'cpp', 'h', 'java',
}


def _get_local_drives():
    return [p.mountpoint for p in psutil.disk_partitions() if 'fixed' in p.opts]


# ─── Event handler ────────────────────────────────────────────────────────────

class _ActivityHandler(FileSystemEventHandler):
    """Handles raw watchdog events and writes qualifying ones to the DB."""

    def __init__(self, essential_only: bool):
        self._essential_only = essential_only
        self._last_logged: dict[str, float] = {}

    def _should_ignore(self, path: str) -> bool:
        if path.startswith(BASE_DIR):
            return True
        if any(k.lower() in path.lower() for k in IGNORE_KEYWORDS):
            return True
        if self._essential_only:
            ext = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
            if ext not in ESSENTIAL_EXTENSIONS:
                return True
        return False

    def _log(self, action: str, path: str):
        now = time.time()
        # Throttle: same path within 1 s → skip
        if path in self._last_logged and now - self._last_logged[path] < 1:
            return
        self._last_logged[path] = now

        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO file_logs (timestamp, action, file_path) VALUES (?, ?, ?)",
                (timestamp, action, path),
            )
            conn.commit()
            conn.close()
        except Exception as exc:
            logger.error("File DB insert error: %s", exc)

    def on_created(self, event):
        if not event.is_directory and not self._should_ignore(event.src_path):
            self._log("CREATED/DOWNLOADED", event.src_path)

    def on_modified(self, event):
        if not event.is_directory and not self._should_ignore(event.src_path):
            self._log("MODIFIED", event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            src_ok = not self._should_ignore(event.src_path)
            dst_ok = not self._should_ignore(event.dest_path)
            if src_ok or dst_ok:
                self._log("MOVED/RENAMED", f"{event.src_path} -> {event.dest_path}")

    def on_deleted(self, event):
        if not event.is_directory and not self._should_ignore(event.src_path):
            self._log("DELETED", event.src_path)


# ─── Controller ───────────────────────────────────────────────────────────────

class FileMonitorController:
    """
    Manages the lifecycle of the watchdog Observer.

    The internal manager thread sleeps indefinitely until either:
      • The global shutdown_event is set  →  exits cleanly.
      • notify_setting_changed() is called  →  re-evaluates the setting and
        starts or stops the Observer accordingly, then goes back to sleep.

    Resource profile when disabled: 1 sleeping thread, 0 OS file handles.
    """

    def __init__(self):
        self._observer: Observer | None = None
        self._observer_lock = threading.Lock()
        # Poked whenever the file_logging_enabled setting changes
        self._change_event = threading.Event()

    # ── Public API ────────────────────────────────────────────────────────────

    def start_manager(self):
        """Spawn the background manager thread (call once at startup)."""
        t = threading.Thread(
            target=self._manager_loop,
            daemon=True,
            name="FileMonitorManager",
        )
        t.start()
        logger.info("FileMonitorManager thread started.")

    def notify_setting_changed(self):
        """
        Call this whenever file_logging_enabled is toggled in settings.
        Wakes the manager immediately so it can start/stop the Observer.
        """
        self._change_event.set()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _is_enabled(self) -> bool:
        from src.config.settings_manager import SettingsManager
        return SettingsManager.get_bool("file_logging_enabled", default=True)

    def _is_essential_only(self) -> bool:
        from src.config.settings_manager import SettingsManager
        return SettingsManager.get_bool("file_logging_essential_only", default=True)

    def _start_observer(self):
        """Start a new Observer and schedule all local drives."""
        with self._observer_lock:
            if self._observer is not None:
                return  # already running

            handler = _ActivityHandler(essential_only=self._is_essential_only())
            observer = Observer()
            for drive in _get_local_drives():
                try:
                    observer.schedule(handler, drive, recursive=True)
                    logger.info("FileMonitor: scheduling drive %s", drive)
                except Exception as exc:
                    logger.warning("FileMonitor: could not schedule %s — %s", drive, exc)

            observer.start()
            self._observer = observer
            logger.info("FileMonitor: Observer started (file logging ON).")

    def _stop_observer(self):
        """Stop and join the Observer, releasing all OS file handles."""
        with self._observer_lock:
            if self._observer is None:
                return  # nothing to stop

            try:
                self._observer.stop()
                self._observer.join(timeout=5)
            except Exception as exc:
                logger.warning("FileMonitor: error stopping Observer — %s", exc)
            finally:
                self._observer = None
                logger.info("FileMonitor: Observer stopped (file logging OFF).")

    def _manager_loop(self):
        """
        Main loop of the FileMonitorManager thread.
        Sleeps until woken by a setting change or global shutdown.
        """
        # Apply the initial state
        if self._is_enabled():
            self._start_observer()
        else:
            logger.info("FileMonitor: file logging disabled — Observer not started.")

        while not shutdown_event.is_set():
            # Block until either a setting change or shutdown is signalled.
            # We use a timeout as a safety net (60 s) — NOT for polling.
            self._change_event.wait(timeout=60)

            if shutdown_event.is_set():
                break

            if self._change_event.is_set():
                self._change_event.clear()
                enabled = self._is_enabled()
                if enabled and self._observer is None:
                    self._start_observer()
                elif not enabled and self._observer is not None:
                    self._stop_observer()

        # ── Shutdown ──
        self._stop_observer()
        logger.info("FileMonitorManager: exited cleanly.")


# ─── Singleton ────────────────────────────────────────────────────────────────

# Single shared instance; import this in main.py and wellbeing_routes.py.
file_monitor_controller = FileMonitorController()

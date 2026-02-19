import time
import datetime
import psutil
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from src.config.storage import get_data_dir
from src.database.database import get_connection

APP_NAME = "Startup Notifier"
BASE_DIR = get_data_dir()


def get_local_drives():
    return [p.mountpoint for p in psutil.disk_partitions() if 'fixed' in p.opts]


IGNORE_KEYWORDS = [
    "$Recycle.Bin",
    "AppData",
    "Temp",
    "ProgramData",
    "Windows",
    "System Volume Information",
    "Program Files",
    APP_NAME
]


class AdvancedActivityHandler(FileSystemEventHandler):

    def __init__(self):
        self.last_logged = {}

    def should_ignore(self, path):
        if path.startswith(BASE_DIR):
            return True
        return any(k.lower() in path.lower() for k in IGNORE_KEYWORDS)

    def log_event(self, action, path):
        now = time.time()

        # Throttle duplicate events within 1 second
        if path in self.last_logged and now - self.last_logged[path] < 1:
            return

        self.last_logged[path] = now

        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # -------------------------
        # SQLITE INSERT ONLY
        # -------------------------
        try:
            conn = get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO file_logs (timestamp, action, file_path)
                VALUES (?, ?, ?)
            """, (timestamp, action, path))

            conn.commit()
            conn.close()

        except Exception as e:
            print("File DB Insert Error:", e)

    def on_created(self, event):
        if not event.is_directory and not self.should_ignore(event.src_path):
            self.log_event("CREATED/DOWNLOADED", event.src_path)

    def on_modified(self, event):
        if not event.is_directory and not self.should_ignore(event.src_path):
            self.log_event("MODIFIED", event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            if not self.should_ignore(event.src_path) or not self.should_ignore(event.dest_path):
                self.log_event("MOVED/RENAMED", f"{event.src_path} -> {event.dest_path}")

    def on_deleted(self, event):
        if not event.is_directory and not self.should_ignore(event.src_path):
            self.log_event("DELETED", event.src_path)


def start_file_watchdog():
    observer = Observer()
    event_handler = AdvancedActivityHandler()

    for drive in get_local_drives():
        try:
            observer.schedule(event_handler, drive, recursive=True)
            print(f"Monitoring: {drive}")
        except Exception as e:
            print("Drive scheduling error:", e)

    observer.start()

    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()
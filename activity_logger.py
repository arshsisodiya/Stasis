import win32gui
import win32process
import psutil
import datetime
import csv
import time
import os
from url_sniffer import get_browser_url
# 🚀 New import for input tracking
from pynput import mouse, keyboard

APP_NAME = "Startup Notifier"
BASE_DIR = os.path.join(os.environ.get("PROGRAMDATA", "C:\\ProgramData"), APP_NAME)


# --- Input Tracking Logic ---
class InputCounter:
    def __init__(self):
        self.kb_count = 0
        self.mouse_count = 0

        # Start listeners in background threads
        self.kb_listener = keyboard.Listener(on_press=self._on_key_press)
        self.mouse_listener = mouse.Listener(on_click=self._on_mouse_click)

        self.kb_listener.start()
        self.mouse_listener.start()

    def _on_key_press(self, key):
        self.kb_count += 1

    def _on_mouse_click(self, x, y, button, pressed):
        if pressed:
            self.mouse_count += 1

    def get_and_reset(self):
        """Returns current counts and resets them for the next window session."""
        counts = (self.kb_count, self.mouse_count)
        self.kb_count = 0
        self.mouse_count = 0
        return counts


# Initialize the global counter
input_tracker = InputCounter()


def get_daily_log_file():
    """Generates a filename based on the current date."""
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    filename = f"activity_log_{date_str}.csv"
    return os.path.join(BASE_DIR, filename)


def format_duration(seconds):
    """Formats raw seconds into 'X Minutes Y Seconds' or 'X Seconds'."""
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds} Seconds"

    minutes = seconds // 60
    remaining_seconds = seconds % 60

    if remaining_seconds == 0:
        return f"{minutes} Minutes"
    else:
        return f"{minutes} Minutes {remaining_seconds} Seconds"


def ensure_log_file(file_path):
    """Creates the directory and file with headers if they don't exist."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    if not os.path.exists(file_path):
        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            # 🚀 Added Keystrokes and Clicks columns
            writer.writerow(
                ["Timestamp", "Application", "PID", "Window Title", "URL", "Duration", "Keystrokes", "Clicks"])


def get_active_window_info():
    """Captures foreground window details and sniffs browser URLs."""
    try:
        hwnd = win32gui.GetForegroundWindow()
        if hwnd == 0: return None
        title = win32gui.GetWindowText(hwnd)
        if not title: return None

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid)
        app_name = process.name()

        url = "N/A"
        if any(b in app_name.lower() for b in ["chrome", "msedge", "brave"]):
            url = get_browser_url()

        return {"app_name": app_name, "pid": pid, "title": title.strip(), "url": url}
    except Exception:
        return None


def start_logging():
    """Main loop: Detects changes and logs formatted duration with input counts."""
    last_info = None
    start_time = time.time()

    while True:
        try:
            current_log_file = get_daily_log_file()
            ensure_log_file(current_log_file)

            info = get_active_window_info()

            if info:
                if last_info is None:
                    last_info = info
                    start_time = time.time()
                    # Reset counter when we start the very first session
                    input_tracker.get_and_reset()

                elif (info["app_name"] != last_info["app_name"] or
                      info["pid"] != last_info["pid"] or
                      info["title"] != last_info["title"] or
                      info["url"] != last_info["url"]):

                    raw_seconds = time.time() - start_time
                    readable_duration = format_duration(raw_seconds)

                    # 🚀 Retrieve and reset input counts for the finished session
                    keys, clicks = input_tracker.get_and_reset()

                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    with open(current_log_file, "a", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f)
                        writer.writerow([
                            timestamp,
                            last_info["app_name"],
                            last_info["pid"],
                            last_info["title"],
                            last_info["url"],
                            readable_duration,
                            keys,  # 🚀 Logged Keys
                            clicks  # 🚀 Logged Clicks
                        ])

                    last_info = info
                    start_time = time.time()

            time.sleep(1)
        except Exception:
            time.sleep(1)


if __name__ == "__main__":
    start_logging()
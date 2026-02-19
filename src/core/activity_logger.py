import win32gui
import win32process
import psutil
import datetime
import csv
import time
import os
from pynput import mouse, keyboard

from src.core.url_sniffer import get_browser_url
from src.config.storage import get_data_dir
from src.analytics.daily_summary import update_daily_stats
from src.analytics.daily_wellbeing import calculate_daily_wellbeing
from src.database.database import get_connection

APP_NAME = "Startup Notifier"
IDLE_THRESHOLD = 120  # seconds


# ===============================
# INPUT TRACKER
# ===============================
class InputCounter:
    def __init__(self):
        self.kb_count = 0
        self.mouse_count = 0
        self.last_input_time = time.time()

        self.kb_listener = keyboard.Listener(on_press=self._on_key_press)
        self.mouse_listener = mouse.Listener(on_click=self._on_mouse_click)

        self.kb_listener.start()
        self.mouse_listener.start()

    def _on_key_press(self, key):
        self.kb_count += 1
        self.last_input_time = time.time()

    def _on_mouse_click(self, x, y, button, pressed):
        if pressed:
            self.mouse_count += 1
            self.last_input_time = time.time()

    def get_idle_time(self):
        return time.time() - self.last_input_time

    def get_and_reset(self):
        counts = (self.kb_count, self.mouse_count)
        self.kb_count = 0
        self.mouse_count = 0
        return counts


input_tracker = InputCounter()


# ===============================
# HELPERS
# ===============================
def is_media_active(info):
    if not info:
        return False

    app = info["app_name"].lower()
    title = info["title"].lower()

    media_apps = ["vlc.exe", "mpc-hc.exe", "spotify.exe"]
    web_media = ["youtube", "netflix", "prime video", "hotstar", "twitch", "vimeo"]

    if any(m in app for m in media_apps):
        return True
    if any(w in title for w in web_media):
        return True
    return False


def get_daily_log_file():
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    filename = f"activity_log_{date_str}.csv"
    return os.path.join(get_data_dir(), filename)


def format_duration(seconds):
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds} Seconds"

    minutes = seconds // 60
    remaining = seconds % 60

    if remaining == 0:
        return f"{minutes} Minutes"
    return f"{minutes} Minutes {remaining} Seconds"


def ensure_log_file(file_path):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    if not os.path.exists(file_path):
        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Timestamp", "Application", "PID",
                "Window Title", "URL", "Duration",
                "Keystrokes", "Clicks"
            ])


def get_active_window_info():
    try:
        hwnd = win32gui.GetForegroundWindow()
        if hwnd == 0:
            return None

        title = win32gui.GetWindowText(hwnd)
        if not title:
            return None

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid)
        app_name = process.name()

        url = "N/A"
        if any(b in app_name.lower() for b in ["chrome", "msedge", "brave"]):
            detected_url = get_browser_url()
            if detected_url:
                url = detected_url

        return {
            "app_name": app_name,
            "pid": pid,
            "title": title.strip(),
            "url": url
        }
    except Exception:
        return None


# ===============================
# MAIN LOGGER LOOP
# ===============================
def start_logging():
    last_info = None
    start_time = time.time()
    total_idle_deduction = 0

    while True:
        try:
            current_log_file = get_daily_log_file()
            ensure_log_file(current_log_file)

            info = get_active_window_info()
            idle_seconds = input_tracker.get_idle_time()
            is_idle = idle_seconds > IDLE_THRESHOLD and not is_media_active(info)

            if info:
                if last_info is None:
                    last_info = info
                    start_time = time.time()
                    input_tracker.get_and_reset()
                    total_idle_deduction = 0

                elif (
                    info["app_name"] != last_info["app_name"] or
                    info["pid"] != last_info["pid"]
                ):
                    raw_seconds = (time.time() - start_time) - total_idle_deduction
                    raw_seconds = max(0, raw_seconds)

                    keys, clicks = input_tracker.get_and_reset()
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    if raw_seconds > 0:
                        readable_duration = format_duration(raw_seconds)

                        # -------------------------
                        # CSV LOGGING
                        # -------------------------
                        with open(current_log_file, "a", newline="", encoding="utf-8") as f:
                            writer = csv.writer(f)
                            writer.writerow([
                                timestamp,
                                last_info["app_name"],
                                last_info["pid"],
                                last_info["title"],
                                last_info["url"],
                                readable_duration,
                                keys,
                                clicks
                            ])

                        # -------------------------
                        # SQLITE INSERT
                        # -------------------------
                        try:
                            conn = get_connection()
                            cursor = conn.cursor()

                            cursor.execute("""
                                INSERT INTO activity_logs
                                (timestamp, app_name, pid, window_title, url,
                                 active_seconds, idle_seconds, keystrokes, clicks)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                timestamp,
                                last_info["app_name"],
                                last_info["pid"],
                                last_info["title"],
                                last_info["url"],
                                int(raw_seconds),
                                int(total_idle_deduction),
                                int(keys),
                                int(clicks)
                            ))

                            conn.commit()
                            conn.close()
                        except Exception:
                            pass

                        # Update analytics
                        update_daily_stats(
                            last_info["app_name"],
                            last_info["url"],
                            raw_seconds,
                            total_idle_deduction,
                            keys,
                            clicks
                        )

                        calculate_daily_wellbeing()

                    last_info = info
                    start_time = time.time()
                    total_idle_deduction = 0

                if is_idle:
                    total_idle_deduction += 1

            time.sleep(1)

        except Exception:
            time.sleep(1)

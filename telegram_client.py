# telegram_client.py

import requests
import time
from logger import setup_logger
from system_status import get_status_text
from screenshot import capture_screenshot
from system_actions import shutdown_system, restart_system, lock_system
import os
from config_loader import load_config
from webcam import capture_webcam, record_video
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

    def listen_forever(self):
        """
        Persistent Telegram command listener.
        """
        logger.info("Entering persistent Telegram listener")

        while True:
            try:
                response = requests.get(
                    f"{self.base_url}/getUpdates",
                    params={"timeout": 30, "offset": self.offset},
                    timeout=REQUEST_TIMEOUT + 20
                )
                response.raise_for_status()
                updates = response.json().get("result", [])

                for update in updates:
                    self.offset = update["update_id"] + 1
                    message = update.get("message", {})

                    text = message.get("text", "").strip()
                    chat_id = str(message.get("chat", {}).get("id", ""))

                    # 🔒 Security: Ignore messages from unknown chats
                    if chat_id != TELEGRAM_CHAT_ID:
                        logger.warning("Unauthorized chat attempted command")
                        continue

                    command = text.lower()

                    # -------------------
                    # STATUS
                    # -------------------
                    if command == "/ping":
                        logger.info("/ping command received")
                        self.send_message(get_status_text())

                    # -------------------
                    # SCREENSHOT
                    # -------------------
                    elif command == "/screenshot":
                        logger.info("/screenshot command received")
                        path = capture_screenshot()

                        if path:
                            self.send_photo(path, caption="🖥 Current Screen")
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                        else:
                            self.send_message("❌ Screenshot failed")

                    # -------------------
                    # LOCK
                    # -------------------
                    elif command == "/lock":
                        logger.info("/lock command received")
                        self.send_message("🔒 Locking system...")
                        lock_system()

                    # -------------------
                    # SHUTDOWN
                    # -------------------
                    elif command == "/shutdown":
                        self.send_message(
                            "⚠️ Shutdown requested.\n"
                            "Send `/shutdown confirm` to proceed."
                        )

                    elif command == "/shutdown confirm":
                        logger.info("/shutdown confirmed")
                        self.send_message("⏻ Shutting down now...")
                        shutdown_system()

                    # -------------------
                    # RESTART
                    # -------------------
                    elif command == "/restart":
                        self.send_message(
                            "⚠️ Restart requested.\n"
                            "Send `/restart confirm` to proceed."
                        )

                    elif command == "/restart confirm":
                        logger.info("/restart confirmed")
                        self.send_message("🔄 Restarting now...")
                        restart_system()
                        # -------------------
                        # WEBCAM
                        # -------------------
                    elif command == "/camera":
                        logger.info("/camera command received")
                        self.send_message("📸 Capturing webcam image...")
                        path = capture_webcam()

                        if path:
                            # Using your existing send_photo method
                            self.send_photo(path, caption="📸 Webcam Snapshot")
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                        else:
                            self.send_message("❌ Failed to access webcam.")

                    # -------------------
                    # VIDEO RECORDING
                    # -------------------

                    for update in updates:
                        self.offset = update["update_id"] + 1
                        message = update.get("message", {})
                        text = message.get("text", "").strip()

                        # Ensure chat_id is compared as a string and stripped of whitespace
                        incoming_chat_id = str(message.get("chat", {}).get("id", "")).strip()

                        # 🔒 Security: Strict comparison
                        if incoming_chat_id != TELEGRAM_CHAT_ID:
                            logger.warning(f"Unauthorized chat ID: {incoming_chat_id}")
                            continue

                        # Convert to lowercase for easier matching
                        full_command = text.lower()

                        # -------------------
                        # VIDEO RECORDING
                        # -------------------
                        if full_command.startswith("/video"):
                            logger.info(f"Video command received: {full_command}")

                            parts = full_command.split()
                            duration = 10  # Default

                            if len(parts) > 1 and parts[1].isdigit():
                                duration = int(parts[1])

                            self.send_message(f"🎥 Recording {duration}s video...")
                            path = record_video(duration)
                            # ... rest of your video sending code ...

                        if path:
                            self.send_video(path, caption=f"📹 Webcam Clip ({duration}s)")
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                        else:
                            self.send_message("❌ Failed to record video.")

            except requests.exceptions.ReadTimeout:
                logger.warning("Telegram long-poll timeout (expected)")

            except Exception as e:
                logger.error(f"Listener error: {e}")

            time.sleep(2)
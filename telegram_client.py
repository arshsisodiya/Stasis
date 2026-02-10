# telegram_client.py

import requests
import time
from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, REQUEST_TIMEOUT
from logger import setup_logger
from system_status import get_status_text

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

    def poll_commands(self, duration=30):
        logger.info("Polling Telegram commands")
        start_time = time.time()

        while time.time() - start_time < duration:
            try:
                response = requests.get(
                    f"{self.base_url}/getUpdates",
                    params={"timeout": 10, "offset": self.offset},
                    timeout=REQUEST_TIMEOUT
                )
                response.raise_for_status()
                updates = response.json().get("result", [])

                for update in updates:
                    self.offset = update["update_id"] + 1
                    text = update.get("message", {}).get("text", "")

                    if text.strip() == "/ping":
                        logger.info("/ping command received")
                        self.send_message(get_status_text())

            except requests.RequestException as e:
                logger.warning(f"Polling error: {e}")

            time.sleep(2)

        logger.info("Command polling finished")

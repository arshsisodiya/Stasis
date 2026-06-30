# src/core/telegram/api.py

import os
import json
import requests
from typing import Optional, List, Dict

REQUEST_TIMEOUT = 15


class TelegramAPI:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = str(chat_id)
        self.base_url = f"https://api.telegram.org/bot{token}"
        self.offset: Optional[int] = None

    def _update_activity(self):
        try:
            from src.config.settings_manager import SettingsManager
            from datetime import datetime
            SettingsManager.set("telegram_last_activity_timestamp", datetime.now().isoformat())
        except:
            pass

    # --------------------------
    # CORE API
    # --------------------------

    def get_updates(self, timeout: int = 30) -> List[Dict]:
        response = requests.get(
            f"{self.base_url}/getUpdates",
            params={
                "timeout": timeout,
                "offset": self.offset,
            },
            timeout=timeout + 10,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("result", [])

    def send_message(self, text: str, parse_mode: str = "HTML", reply_markup: dict = None) -> bool:
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        response = requests.post(
            f"{self.base_url}/sendMessage",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        self._update_activity()
        data = response.json()
        return data.get("result", {}).get("message_id")

    def send_photo(self, photo_path: str, caption: str = "", reply_markup: dict = None) -> bool:
        with open(photo_path, "rb") as photo:
            data = {
                "chat_id": self.chat_id,
                "caption": caption,
            }
            if reply_markup:
                data["reply_markup"] = json.dumps(reply_markup)

            response = requests.post(
                f"{self.base_url}/sendPhoto",
                files={"photo": photo},
                data=data,
                timeout=60,
            )
        response.raise_for_status()
        self._update_activity()
        return True

    def send_video(self, video_path: str, caption: str = "") -> bool:
        with open(video_path, "rb") as video:
            response = requests.post(
                f"{self.base_url}/sendVideo",
                files={
                    "video": (
                        os.path.basename(video_path),
                        video,
                        "video/mp4",
                    )
                },
                data={
                    "chat_id": self.chat_id,
                    "caption": caption,
                    "supports_streaming": True,
                },
                timeout=(15, 600),
            )
        response.raise_for_status()
        self._update_activity()
        return True

    def send_document(self, file_path: str, caption: str = "") -> bool:
        with open(file_path, "rb") as doc:
            response = requests.post(
                f"{self.base_url}/sendDocument",
                files={"document": doc},
                data={
                    "chat_id": self.chat_id,
                    "caption": caption,
                },
                timeout=60,
            )
        response.raise_for_status()
        self._update_activity()
        return True

    def edit_message(self, message_id: int, text: str, parse_mode: str = "HTML", reply_markup: dict = None) -> bool:
        payload = {
            "chat_id": self.chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        response = requests.post(
            f"{self.base_url}/editMessageText",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        self._update_activity()
        return True

    def answer_callback_query(self, callback_query_id: str, text: str = "", show_alert: bool = False) -> bool:
        response = requests.post(
            f"{self.base_url}/answerCallbackQuery",
            json={
                "callback_query_id": callback_query_id,
                "text": text,
                "show_alert": show_alert,
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        self._update_activity()
        return True

    def set_my_commands(self, commands: List[Dict[str, str]]) -> bool:
        response = requests.post(
            f"{self.base_url}/setMyCommands",
            json={"commands": commands},
            timeout=REQUEST_TIMEOUT,
        )
        try:
            response.raise_for_status()
            return True
        except Exception:
            return False
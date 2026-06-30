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
            from src.config.settings_manager import TelegramSettingsManager
            from src.api.auth_routes import _app_controller as _ac
            from datetime import datetime
            uid = _ac.auth_manager.active_user_id if _ac else None
            TelegramSettingsManager.set(
                "telegram_last_activity_timestamp",
                datetime.now().isoformat(),
                user_id=uid
            )
        except Exception:
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

    def get_file(self, file_id: str) -> dict:
        response = requests.get(
            f"{self.base_url}/getFile",
            params={"file_id": file_id},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        self._update_activity()
        return response.json().get("result", {})

    def download_file(self, file_path: str, dest_path: str) -> bool:
        url = f"https://api.telegram.org/file/bot{self.token}/{file_path}"
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        self._update_activity()
        return True
# src/core/telegram/api.py

import os
import requests
from typing import Optional, List, Dict

REQUEST_TIMEOUT = 15


class TelegramAPI:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = str(chat_id)
        self.base_url = f"https://api.telegram.org/bot{token}"
        self.offset: Optional[int] = None

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

    def send_message(self, text: str, parse_mode: str = "HTML") -> bool:
        response = requests.post(
            f"{self.base_url}/sendMessage",
            json={
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": parse_mode,
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("result", {}).get("message_id")

    def send_photo(self, photo_path: str, caption: str = "") -> bool:
        with open(photo_path, "rb") as photo:
            response = requests.post(
                f"{self.base_url}/sendPhoto",
                files={"photo": photo},
                data={
                    "chat_id": self.chat_id,
                    "caption": caption,
                },
                timeout=60,
            )
        response.raise_for_status()
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
        return True

    def edit_message(self, message_id: int, text: str, parse_mode: str = "HTML") -> bool:
        response = requests.post(
            f"{self.base_url}/editMessageText",
            json={
                "chat_id": self.chat_id,
                "message_id": message_id,
                "text": text,
                "parse_mode": parse_mode,
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return True
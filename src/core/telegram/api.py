# src/core/telegram/api.py

import os
import json
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Optional, List, Dict

REQUEST_TIMEOUT = 15
# Max retries for transient upload errors (connect reset, timeout)
_UPLOAD_RETRY_ATTEMPTS = 3


class ProgressFileReader:
    def __init__(self, filename, callback):
        self.file = open(filename, 'rb')
        self.len = os.path.getsize(filename)
        self.callback = callback
        self.read_bytes = 0
        self.last_percent = 0
        self.last_time = 0

    def read(self, size=-1):
        chunk = self.file.read(size)
        self.read_bytes += len(chunk)
        if self.len > 0:
            percent = int((self.read_bytes / self.len) * 100)
            now = time.time()
            if (percent - self.last_percent >= 5 and now - self.last_time > 1.0) or percent == 100:
                self.callback(percent)
                self.last_percent = percent
                self.last_time = now
        return chunk
        
    def __len__(self):
        return self.len

    def close(self):
        self.file.close()


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

    def send_message(self, text: str, parse_mode: str = "HTML", reply_markup: dict = None) -> Optional[int]:
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

    def edit_message(self, message_id: int, text: str, parse_mode: str = "HTML") -> bool:
        payload = {
            "chat_id": self.chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        response = requests.post(
            f"{self.base_url}/editMessageText",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        if response.ok:
            return True
        return False

    def send_photo(self, photo_path: str, caption: str = "", reply_markup: dict = None, progress_msg_id: int = None) -> bool:
        from src.utils.logger import setup_logger
        log = setup_logger()
        log.info(f"[TelegramAPI] Uploading photo: {os.path.basename(photo_path)}")

        last_exc = None
        for attempt in range(1, _UPLOAD_RETRY_ATTEMPTS + 1):
            try:
                session = requests.Session()
                adapter = HTTPAdapter(max_retries=Retry(total=0))
                session.mount("https://", adapter)
                
                def progress_callback(percent):
                    if progress_msg_id:
                        self.edit_message(progress_msg_id, f"📤 Uploading photo... {percent}%")
                
                photo = ProgressFileReader(photo_path, progress_callback) if progress_msg_id else open(photo_path, "rb")
                try:
                    data = {
                        "chat_id": self.chat_id,
                        "caption": caption,
                    }
                    if reply_markup:
                        data["reply_markup"] = json.dumps(reply_markup)

                    response = session.post(
                        f"{self.base_url}/sendPhoto",
                        files={"photo": photo},
                        data=data,
                        timeout=(30, 300),
                        stream=False,
                    )
                finally:
                    if hasattr(photo, 'close'):
                        photo.close()
                response.raise_for_status()
                self._update_activity()
                log.info(f"[TelegramAPI] Photo sent successfully on attempt {attempt}")
                return True
                
            except (requests.ConnectionError, requests.Timeout) as e:
                last_exc = e
                wait = 2 ** (attempt - 1)
                log.warning(
                    f"[TelegramAPI] Photo upload failed (attempt {attempt}/{_UPLOAD_RETRY_ATTEMPTS}): "
                    f"{type(e).__name__}: {e}. Retrying in {wait}s..."
                )
                time.sleep(wait)

        log.error(f"[TelegramAPI] Photo upload failed after {_UPLOAD_RETRY_ATTEMPTS} attempts. Last error: {last_exc}")
        raise last_exc

    def send_video(self, video_path: str, caption: str = "", progress_msg_id: int = None) -> bool:
        ext = os.path.splitext(video_path)[1].lower()
        mime_map = {
            ".mp4": "video/mp4",
            ".avi": "video/x-msvideo",
            ".mkv": "video/x-matroska",
            ".mov": "video/quicktime",
        }
        mime_type = mime_map.get(ext, "video/mp4")
        file_size_kb = os.path.getsize(video_path) / 1024

        from src.utils.logger import setup_logger
        log = setup_logger()
        log.info(f"[TelegramAPI] Uploading video: {os.path.basename(video_path)} ({file_size_kb:.1f} KB) mime={mime_type}")

        last_exc = None
        for attempt in range(1, _UPLOAD_RETRY_ATTEMPTS + 1):
            try:
                session = requests.Session()
                adapter = HTTPAdapter(
                    max_retries=Retry(total=0)
                )
                session.mount("https://", adapter)

                def progress_callback(percent):
                    if progress_msg_id:
                        self.edit_message(progress_msg_id, f"📤 Uploading video... {percent}%")
                        
                video = ProgressFileReader(video_path, progress_callback) if progress_msg_id else open(video_path, "rb")
                try:
                    response = session.post(
                        f"{self.base_url}/sendVideo",
                        files={
                            "video": (
                                os.path.basename(video_path),
                                video,
                                mime_type,
                            )
                        },
                        data={
                            "chat_id": self.chat_id,
                            "caption": caption,
                            "supports_streaming": True,
                        },
                        timeout=(30, 300),
                        stream=False,
                    )
                finally:
                    if hasattr(video, 'close'):
                        video.close()

                log.info(f"[TelegramAPI] sendVideo response: status={response.status_code} attempt={attempt}")

                if not response.ok and ext != ".mp4":
                    log.warning(f"[TelegramAPI] sendVideo rejected ({response.status_code}), retrying as sendDocument")
                    video_doc = ProgressFileReader(video_path, progress_callback) if progress_msg_id else open(video_path, "rb")
                    try:
                        response = session.post(
                            f"{self.base_url}/sendDocument",
                            files={"document": (os.path.basename(video_path), video_doc, mime_type)},
                            data={"chat_id": self.chat_id, "caption": caption},
                            timeout=(30, 300),
                        )
                    finally:
                        if hasattr(video_doc, 'close'):
                            video_doc.close()
                    log.info(f"[TelegramAPI] sendDocument response: status={response.status_code}")

                response.raise_for_status()
                self._update_activity()
                log.info(f"[TelegramAPI] Video sent successfully on attempt {attempt}")
                return True

            except (requests.ConnectionError, requests.Timeout) as e:
                last_exc = e
                wait = 2 ** (attempt - 1)  # 1s, 2s, 4s
                log.warning(
                    f"[TelegramAPI] Video upload failed (attempt {attempt}/{_UPLOAD_RETRY_ATTEMPTS}): "
                    f"{type(e).__name__}: {e}. Retrying in {wait}s..."
                )
                time.sleep(wait)

        log.error(f"[TelegramAPI] Video upload failed after {_UPLOAD_RETRY_ATTEMPTS} attempts. Last error: {last_exc}")
        raise last_exc


    def send_document(self, file_path: str, caption: str = "", progress_msg_id: int = None) -> bool:
        def progress_callback(percent):
            if progress_msg_id:
                self.edit_message(progress_msg_id, f"📤 Uploading document... {percent}%")
                
        doc = ProgressFileReader(file_path, progress_callback) if progress_msg_id else open(file_path, "rb")
        try:
            response = requests.post(
                f"{self.base_url}/sendDocument",
                files={"document": doc},
                data={
                    "chat_id": self.chat_id,
                    "caption": caption,
                },
                timeout=(30, 300),
            )
        finally:
            if hasattr(doc, 'close'):
                doc.close()
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
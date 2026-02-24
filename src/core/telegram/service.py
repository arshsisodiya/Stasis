# src/core/telegram/service.py
import platform
import socket
import psutil
from datetime import datetime
import threading
from src.core.telegram.api import TelegramAPI
from src.core.telegram.command_handler import CommandHandler
from src.core.telegram.listener import TelegramListener

class TelegramService:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id

        self.api = TelegramAPI(token, chat_id)
        self.handler = CommandHandler(self.api)
        self.listener = TelegramListener(self.api, self.handler)

        self.thread = None

    def _build_status_text(self) -> str:
        try:
            hostname = socket.gethostname()
            os_name = platform.system()
            os_release = platform.release()

            cpu_usage = psutil.cpu_percent(interval=1)
            cpu_cores = psutil.cpu_count()

            memory = psutil.virtual_memory()
            total_ram_gb = round(memory.total / (1024 ** 3), 2)
            used_ram_percent = memory.percent

            boot_time = datetime.fromtimestamp(psutil.boot_time())
            uptime_delta = datetime.now() - boot_time
            hours, remainder = divmod(int(uptime_delta.total_seconds()), 3600)
            minutes, _ = divmod(remainder, 60)

            local_ip = socket.gethostbyname(socket.gethostname())

            return (
                "<b>System Status</b>\n\n"
                f"<b>Device:</b> {hostname}\n"
                f"<b>OS:</b> {os_name} {os_release}\n"
                f"<b>Uptime:</b> {hours}h {minutes}m\n\n"
                f"<b>CPU:</b> {cpu_usage}% ({cpu_cores} cores)\n"
                f"<b>RAM:</b> {used_ram_percent}% of {total_ram_gb} GB\n\n"
                f"<b>IP:</b> {local_ip}\n"
                f"<b>Time:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )

        except Exception:
            return "System status unavailable."
    # -------------------------
    # LIFECYCLE
    # -------------------------

    def start(self, notify: bool = True):
        if self.thread and self.thread.is_alive():
            return

        self.thread = threading.Thread(
            target=self.listener.start,
            daemon=True,
        )
        self.thread.start()

        if notify:
            try:
                status = self._build_status_text()
                self.api.send_message(
                    "<b>Telegram Service Started</b>\n\n" + status,
                    parse_mode="HTML",
                )
            except Exception:
                pass

    def stop(self, notify: bool = True):
        if notify:
            try:
                self.api.send_message(
                    "<b>Telegram Service Stopped</b>",
                    parse_mode="HTML",
                )
            except Exception:
                pass

        if self.listener:
            self.listener.stop()

        if self.thread:
            self.thread.join(timeout=5)
            self.thread = None

    def restart(self, token: str, chat_id: str):
        try:
            message_id = self.api.send_message(
                "<b>Telegram Service Restarting...</b>",
                parse_mode="HTML",
            )
        except Exception:
            message_id = None

        # Stop silently
        self.stop(notify=False)

        # Rebuild service cleanly
        self.token = token
        self.chat_id = chat_id

        self.api = TelegramAPI(token, chat_id)
        self.handler = CommandHandler(self.api)
        self.listener = TelegramListener(self.api, self.handler)

        # Start silently
        self.start(notify=False)

        # Edit restart message
        if message_id:
            try:
                self.api.edit_message(
                    message_id,
                    "<b>Telegram Service Restarted Successfully</b>",
                    parse_mode="HTML",
                )
            except Exception:
                pass
    def is_running(self):
        if not self.thread:
            return False
        return self.thread.is_alive()
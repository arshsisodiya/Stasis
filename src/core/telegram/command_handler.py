# src/core/telegram/command_handler.py

import os
import glob
import json
import uuid
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
        self._fetch_results = {}

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
        text = message.get("text", "")
        if "caption" in message and not text:
            text = message["caption"]
        text = text.strip()
        
        chat_id = str(message.get("chat", {}).get("id", "")).strip()

        if chat_id != self.api.chat_id:
            return

        from src.utils.logger import setup_logger
        logger = setup_logger()

        # Check for media attachments (Drop-zone)
        file_id = None
        file_name = None
        if "document" in message:
            file_id = message["document"].get("file_id")
            file_name = message["document"].get("file_name", "document.file")
        elif "photo" in message and isinstance(message["photo"], list) and len(message["photo"]) > 0:
            file_id = message["photo"][-1].get("file_id")
            file_name = f"photo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        elif "video" in message:
            file_id = message["video"].get("file_id")
            file_name = message["video"].get("file_name", f"video_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4")
        elif "audio" in message:
            file_id = message["audio"].get("file_id")
            file_name = message["audio"].get("file_name", f"audio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp3")

        if file_id and file_name:
            self.api.send_message(f"📥 Downloading {file_name}...")
            try:
                file_info = self.api.get_file(file_id)
                file_path = file_info.get("file_path")
                if file_path:
                    home_dir = os.path.expanduser("~")
                    dest_dir = os.path.join(home_dir, "Downloads", "Stasis_Drops")
                    dest_file = os.path.join(dest_dir, file_name)
                    
                    self.api.download_file(file_path, dest_file)
                    self.api.send_message(f"✅ Saved to Downloads/Stasis_Drops/{file_name}")
                    
                    try:
                        os.startfile(dest_file)
                    except Exception as e:
                        logger.error(f"Failed to open downloaded file: {e}")
                else:
                    self.api.send_message("❌ Failed to get file path from Telegram.")
            except Exception as e:
                logger.error(f"Download error: {e}")
                self.api.send_message(f"❌ Error downloading file: {str(e)}")
            
            if not text:
                return

        command = text.lower()
        if command:
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
                msg_id = self.api.send_message("Locking system...")
                lock_system()
                if msg_id:
                    self.api.edit_message(msg_id, f"🔒 System locked at {datetime.now().strftime('%I:%M %p')}")

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
                msg_id = self.api.send_message("Shutting down...")
                shutdown_system()
                if msg_id:
                    self.api.edit_message(msg_id, f"🛑 System shut down at {datetime.now().strftime('%I:%M %p')}")

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
                msg_id = self.api.send_message("Restarting...")
                restart_system()
                if msg_id:
                    self.api.edit_message(msg_id, f"🔄 System restarting at {datetime.now().strftime('%I:%M %p')}")

            elif command == "/camera":
                if not TelegramSettingsManager.get_bool("telegram_webcam_allowed", True):
                    self.api.send_message("❌ Webcam access is disabled in settings.")
                    return

                msg_id = self.api.send_message("📸 Capturing webcam...")
                path = capture_webcam()
                if path:
                    self.api.edit_message(msg_id, "📤 Uploading photo...")
                    try:
                        self.api.send_photo(path, "Webcam Snapshot")
                        self.api.edit_message(msg_id, "✅ Snapshot sent successfully.")
                    except Exception as e:
                        self.api.edit_message(msg_id, f"❌ Failed to upload photo: {e}")
                    finally:
                        try:
                            os.remove(path)
                        except Exception:
                            pass
                else:
                    self.api.edit_message(msg_id, "❌ Failed to capture webcam snapshot.")

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

                msg_id = self.api.send_message(f"🎥 Recording {duration}s video... Please wait.")
                path = record_video(duration)

                if path:
                    self.api.edit_message(msg_id, "📤 Uploading video...")
                    try:
                        self.api.send_video(path, f"Webcam Clip ({duration}s)")
                        self.api.edit_message(msg_id, "✅ Video sent successfully.")
                    except Exception as e:
                        self.api.edit_message(msg_id, f"❌ Failed to upload video: {e}")
                    finally:
                        try:
                            os.remove(path)
                        except Exception:
                            pass
                else:
                    self.api.edit_message(msg_id, "❌ Failed to record video.")
                    
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
                    
                    current_pid = os.getpid()
                    closed_count = 0
                    for proc in psutil.process_iter(['name', 'pid']):
                        try:
                            # Prevent Stasis from committing suicide and causing a boot-loop
                            if proc.info['pid'] == current_pid or "stasis" in proc.info['name'].lower():
                                continue
                                
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

            elif command.startswith("/open "):
                if not TelegramSettingsManager.get_bool("telegram_remote_open_allowed", True):
                    self.api.send_message("❌ Remote link opening is disabled in settings.")
                    return
                url = text[6:].strip()
                if not url:
                    self.api.send_message("❌ Usage: `/open <url>`", parse_mode="Markdown")
                    return
                if not url.startswith("http://") and not url.startswith("https://"):
                    url = "https://" + url
                try:
                    import webbrowser
                    webbrowser.open(url)
                    self.api.send_message(f"🌐 Opened on PC: {url}")
                except Exception as e:
                    self.api.send_message(f"Failed to open URL: {e}")
                    
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

            elif command == "/fwd10":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import seek_forward
                seek_forward()
                self.api.send_message("⏩ Fast Forward 10s")

            elif command == "/bwd10":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import seek_backward
                seek_backward()
                self.api.send_message("⏪ Rewind 10s")

            elif command == "/next_slide":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import presentation_next
                presentation_next()
                self.api.send_message("📽 Next Slide")

            elif command == "/prev_slide":
                if not TelegramSettingsManager.get_bool("telegram_media_controls_allowed", True):
                    self.api.send_message("❌ Media controls are disabled in settings.")
                    return
                from src.core.telegram.media_controller import presentation_prev
                presentation_prev()
                self.api.send_message("📽 Previous Slide")
                
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
                    
                    uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                    conn = get_connection()
                    cursor = conn.cursor()
                    
                    date_str = datetime.now().strftime('%Y-%m-%d')
                    
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
                    
            elif command.startswith("/fetch"):
                parts = text.split(" ", 1)
                if len(parts) < 2 or not parts[1].strip():
                    self.api.send_message("❌ Usage: `/fetch <filename>`", parse_mode="Markdown")
                    return
                
                target_file = parts[1].strip().lower()
                self.api.send_message(f"🔍 Searching for '{target_file}' in Downloads, Desktop, and Documents...")
                
                home_dir = os.path.expanduser("~")
                search_dirs = [
                    os.path.join(home_dir, "Downloads"),
                    os.path.join(home_dir, "Desktop"),
                    os.path.join(home_dir, "Documents")
                ]
                
                found_paths = []
                for d in search_dirs:
                    if not os.path.exists(d): continue
                    for root, dirs, files in os.walk(d):
                        for f in files:
                            if target_file in f.lower():
                                found_paths.append(os.path.join(root, f))
                                if len(found_paths) >= 10:
                                    break
                        if len(found_paths) >= 10:
                            break
                    if len(found_paths) >= 10:
                        break
                
                if found_paths:
                    if len(found_paths) == 1:
                        found_path = found_paths[0]
                        size_mb = os.path.getsize(found_path) / (1024 * 1024)
                        if size_mb > 50:
                            self.api.send_message(f"❌ File '{os.path.basename(found_path)}' is too large ({size_mb:.1f}MB). Max is 50MB.")
                        else:
                            self.api.send_message(f"📤 Uploading {os.path.basename(found_path)} ({size_mb:.1f}MB)...")
                            try:
                                self.api.send_document(found_path)
                            except Exception as e:
                                self.api.send_message(f"❌ Upload failed: {e}")
                    else:
                        buttons = []
                        for path in found_paths:
                            file_id = str(uuid.uuid4())[:8]
                            self._fetch_results[file_id] = path
                            btn_text = f"{os.path.basename(path)} ({os.path.getsize(path) / (1024 * 1024):.1f}MB)"
                            buttons.append([{"text": btn_text, "callback_data": f"cb_fetch_{file_id}"}])
                        
                        reply_markup = {"inline_keyboard": buttons}
                        self.api.send_message(f"📁 Found {len(found_paths)} matching files. Select one to download:", reply_markup=reply_markup)
                else:
                    self.api.send_message("❌ File not found.")
                    
            elif command.startswith("/clip"):
                if not TelegramSettingsManager.get_bool("telegram_clipboard_allowed", True):
                    self.api.send_message("❌ Clipboard syncing is disabled in settings.")
                    return
                
                parts = text.split(" ", 1)
                if len(parts) > 1 and parts[1].strip():
                    from src.core.telegram.clipboard_utils import set_clipboard_text
                    if set_clipboard_text(parts[1].strip()):
                        self.api.send_message("✅ Copied to PC clipboard!")
                    else:
                        self.api.send_message("❌ Failed to copy to PC clipboard.")
                else:
                    from src.core.telegram.clipboard_utils import get_clipboard_text
                    clip_text = get_clipboard_text()
                    if clip_text:
                        self.api.send_message(f"📋 <b>PC Clipboard:</b>\n\n{clip_text}", parse_mode="HTML")
                    else:
                        self.api.send_message("📋 PC Clipboard is empty or contains non-text data.")
                    
            elif command.startswith("/say ") or command == "/say":
                if not TelegramSettingsManager.get_bool("telegram_tts_allowed", True):
                    self.api.send_message("❌ TTS Announcements are disabled in settings.")
                    return
                
                parts = text.split(" ", 1)
                if len(parts) < 2 or not parts[1].strip():
                    self.api.send_message("Please provide a message to speak. Usage: /say [message]")
                    return
                
                msg_to_speak = parts[1].strip()
                from src.core.telegram.tts_utils import speak_text_async
                speak_text_async(msg_to_speak)
                self.api.send_message("🗣️ Message spoken on PC!")

            elif command == "/menu":
                reply_markup = self._get_main_menu_markup()
                self.api.send_message("🎛️ <b>Stasis Main Menu</b>\nSelect an action:", reply_markup=reply_markup)

        except Exception as e:
            from src.utils.logger import setup_logger
            logger = setup_logger()
            logger.exception(f"Error handling command {command}: {e}")
            self.api.send_message(f"⚠️ Internal error processing command: {str(e)}")

    def _get_main_menu_markup(self):
        buttons = [
            {"text": "🏓 Ping", "callback_data": "cb_ping"},
            {"text": "📸 Screenshot", "callback_data": "cb_screenshot"},
            {"text": "📹 Camera", "callback_data": "cb_camera"},
            {"text": "🎥 Video", "callback_data": "cb_video"},
            {"text": "🔒 Lock", "callback_data": "cb_lock"},
            {"text": "📊 Today", "callback_data": "cb_today"},
            {"text": "🎯 Goals", "callback_data": "cb_goals"},
            {"text": "📋 Clip", "callback_data": "cb_clip"},
            {"text": "⛔ Block App", "callback_data": "cb_menu_block"},
            {"text": "✅ Unblock App", "callback_data": "cb_menu_unblock"},
            {"text": "🎵 Media & Present", "callback_data": "cb_menu_media"},
            {"text": "⚠️ Power", "callback_data": "cb_menu_power"}
        ]
        
        inline_keyboard = []
        for i in range(0, len(buttons), 2):
            row = buttons[i:i+2]
            inline_keyboard.append(row)
            
        return {"inline_keyboard": inline_keyboard}

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
            # Re-route simple commands
            simple_commands = {
                "cb_ping": "/ping",
                "cb_screenshot": "/screenshot",
                "cb_camera": "/camera",
                "cb_video": "/video",
                "cb_lock": "/lock",
                "cb_lock_pc": "/lock", # Legacy from previous implementation
                "cb_today": "/today",
                "cb_goals": "/goals",
                "cb_clip": "/clip",
                "cb_play": "/play",
                "cb_pause": "/pause",
                "cb_next": "/next",
                "cb_prev": "/prev",
                "cb_mute": "/mute",
                "cb_volup": "/volup",
                "cb_voldown": "/voldown",
                "cb_fwd10": "/fwd10",
                "cb_bwd10": "/bwd10",
                "cb_next_slide": "/next_slide",
                "cb_prev_slide": "/prev_slide",
            }
            
            if data in simple_commands:
                cmd = simple_commands[data]
                self.api.answer_callback_query(callback_id, text=f"Executing {cmd}...")
                self.handle({"text": cmd, "chat": {"id": chat_id}})
                
            elif data.startswith("cb_fetch_"):
                file_id = data.replace("cb_fetch_", "")
                if file_id in self._fetch_results:
                    found_path = self._fetch_results[file_id]
                    self.api.answer_callback_query(callback_id, text="Uploading file...")
                    if not os.path.exists(found_path):
                        self.api.send_message("❌ File no longer exists on disk.")
                    else:
                        size_mb = os.path.getsize(found_path) / (1024 * 1024)
                        if size_mb > 50:
                            self.api.send_message(f"❌ File '{os.path.basename(found_path)}' is too large ({size_mb:.1f}MB). Max is 50MB.")
                        else:
                            self.api.send_message(f"📤 Uploading {os.path.basename(found_path)} ({size_mb:.1f}MB)...")
                            try:
                                self.api.send_document(found_path)
                            except Exception as e:
                                self.api.send_message(f"❌ Upload failed: {e}")
                else:
                    self.api.answer_callback_query(callback_id, text="❌ File session expired or not found.", show_alert=True)
                    
            elif data == "cb_top_apps":
                self.api.answer_callback_query(callback_id)
                try:
                    from src.database.database import get_connection
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute('''
                        SELECT app_name, SUM(active_seconds)
                        FROM activity_logs
                        WHERE DATE(timestamp) = DATE('now', 'localtime')
                        GROUP BY app_name
                        ORDER BY SUM(active_seconds) DESC
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
                
            elif data == "cb_menu_main":
                self.api.answer_callback_query(callback_id)
                if message.get("message_id"):
                    reply_markup = self._get_main_menu_markup()
                    self.api.edit_message(
                        message_id=message["message_id"],
                        text="🎛️ <b>Stasis Main Menu</b>\nSelect an action:",
                        reply_markup=reply_markup
                    )
                    
            elif data == "cb_menu_media":
                self.api.answer_callback_query(callback_id)
                if message.get("message_id"):
                    buttons = [
                        [{"text": "⏯ Play/Pause", "callback_data": "cb_play"}, {"text": "🔇 Mute", "callback_data": "cb_mute"}],
                        [{"text": "🔉 Vol Down", "callback_data": "cb_voldown"}, {"text": "🔊 Vol Up", "callback_data": "cb_volup"}],
                        [{"text": "⏮ Prev", "callback_data": "cb_prev"}, {"text": "⏭ Next", "callback_data": "cb_next"}],
                        [{"text": "⏪ Bwd 10s", "callback_data": "cb_bwd10"}, {"text": "⏩ Fwd 10s", "callback_data": "cb_fwd10"}],
                        [{"text": "📽 Prev Slide", "callback_data": "cb_prev_slide"}, {"text": "📽 Next Slide", "callback_data": "cb_next_slide"}],
                        [{"text": "🔙 Back to Menu", "callback_data": "cb_menu_main"}]
                    ]
                    self.api.edit_message(
                        message_id=message["message_id"],
                        text="🎵 <b>Media & Presentation</b>\nControl your active media players or presentation slides:",
                        reply_markup={"inline_keyboard": buttons}
                    )
                    
            elif data == "cb_menu_block":
                self.api.answer_callback_query(callback_id)
                if message.get("message_id"):
                    try:
                        from src.database.database import get_connection
                        conn = get_connection()
                        cursor = conn.cursor()
                        # Get top 10 apps used today to populate the block list
                        cursor.execute('''
                            SELECT app_name
                            FROM activity_logs
                            WHERE DATE(timestamp) = DATE('now', 'localtime')
                            GROUP BY app_name
                            ORDER BY SUM(active_seconds) DESC
                            LIMIT 10
                        ''')
                        rows = cursor.fetchall()
                        
                        inline_keyboard = []
                        for row in rows:
                            app_name = row[0]
                            # Truncate app name to fit within Telegram's 64-byte callback_data limit
                            cb_data = f"cb_block_{app_name}"[:64]
                            inline_keyboard.append([{"text": f"⛔ {app_name}", "callback_data": cb_data}])
                            
                        if not inline_keyboard:
                            inline_keyboard.append([{"text": "No active apps today", "callback_data": "ignore"}])
                            
                        inline_keyboard.append([{"text": "🔙 Back to Menu", "callback_data": "cb_menu_main"}])
                        
                        self.api.edit_message(
                            message_id=message["message_id"],
                            text="⛔ <b>Block an App</b>\nSelect an active app to block:",
                            reply_markup={"inline_keyboard": inline_keyboard}
                        )
                    except Exception as ex:
                        logger.exception(f"DB Error fetching block menu: {ex}")
                        
            elif data == "cb_menu_unblock":
                self.api.answer_callback_query(callback_id)
                if message.get("message_id"):
                    try:
                        from src.database.database import get_blocked_app_names
                        from src.api.auth_routes import _app_controller
                        uid = _app_controller.auth_manager.active_user_id if _app_controller else None
                        blocked_apps = get_blocked_app_names(user_id=uid)
                        
                        inline_keyboard = []
                        for app_name in blocked_apps:
                            cb_data = f"cb_unblock_{app_name}"[:64]
                            inline_keyboard.append([{"text": f"✅ {app_name}", "callback_data": cb_data}])
                            
                        if not inline_keyboard:
                            inline_keyboard.append([{"text": "No apps currently blocked", "callback_data": "ignore"}])
                            
                        inline_keyboard.append([{"text": "🔙 Back to Menu", "callback_data": "cb_menu_main"}])
                        
                        self.api.edit_message(
                            message_id=message["message_id"],
                            text="✅ <b>Unblock an App</b>\nSelect a blocked app to allow:",
                            reply_markup={"inline_keyboard": inline_keyboard}
                        )
                    except Exception as ex:
                        logger.exception(f"DB Error fetching unblock menu: {ex}")

            elif data == "cb_menu_power":
                self.api.answer_callback_query(callback_id)
                if message.get("message_id"):
                    inline_keyboard = [
                        [{"text": "🛑 Shutdown", "callback_data": "cb_power_shutdown"}],
                        [{"text": "🔄 Restart", "callback_data": "cb_power_restart"}],
                        [{"text": "🔙 Back to Menu", "callback_data": "cb_menu_main"}]
                    ]
                    self.api.edit_message(
                        message_id=message["message_id"],
                        text="⚠️ <b>Power Options</b>\nSelect an action:",
                        reply_markup={"inline_keyboard": inline_keyboard}
                    )

            elif data.startswith("cb_power_"):
                self.api.answer_callback_query(callback_id)
                if message.get("message_id"):
                    action = data[len("cb_power_"):]
                    inline_keyboard = [
                        [{"text": f"✅ Yes, {action.capitalize()}", "callback_data": f"cb_confirm_{action}"}],
                        [{"text": "❌ Cancel", "callback_data": "cb_menu_power"}]
                    ]
                    self.api.edit_message(
                        message_id=message["message_id"],
                        text=f"⚠️ <b>Confirm {action.capitalize()}</b>\nAre you sure you want to {action} the PC?",
                        reply_markup={"inline_keyboard": inline_keyboard}
                    )

            elif data.startswith("cb_confirm_"):
                action = data[len("cb_confirm_"):]
                self.api.answer_callback_query(callback_id, text=f"Executing {action}...", show_alert=True)
                self.handle({"text": f"/{action} confirm", "chat": {"id": chat_id}})
                if message.get("message_id"):
                    self.api.edit_message(
                        message_id=message["message_id"],
                        text=f"✅ <b>Command sent:</b> {action.capitalize()} PC.",
                        reply_markup=None
                    )

            elif data.startswith("cb_block_"):
                app_name = data[len("cb_block_"):]
                self.api.answer_callback_query(callback_id, text=f"Blocking {app_name}...", show_alert=True)
                self.handle({"text": f"/block {app_name}", "chat": {"id": chat_id}})
                # Optional: refresh the menu? It will redraw automatically if we just re-call cb_menu_block, but toast is fine.
                
            elif data.startswith("cb_unblock_"):
                app_name = data[len("cb_unblock_"):]
                self.api.answer_callback_query(callback_id, text=f"Unblocking {app_name}...", show_alert=True)
                self.handle({"text": f"/unblock {app_name}", "chat": {"id": chat_id}})
                # Optional: refresh the unblock menu
                if message.get("message_id"):
                    # We can quickly refresh the unblock menu by calling handle_callback recursively
                    self.handle_callback({"id": callback_id, "data": "cb_menu_unblock", "message": message})

            elif data == "ignore":
                self.api.answer_callback_query(callback_id)

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
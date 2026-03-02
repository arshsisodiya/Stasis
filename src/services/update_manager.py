import requests
import os
import threading
import subprocess
from packaging import version
from pathlib import Path
import sys
import win32api
import logging
import json
import ctypes

API_URL = "https://api.github.com/repos/arshsisodiya/Stasis/releases/latest"

def get_current_version(logger=None):
    try:
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
        else:
            exe_path = __file__

        if logger:
            logger.info(f"Reading version from: {exe_path}")

        try:
            info = win32api.GetFileVersionInfo(exe_path, "\\")
            ms = info['FileVersionMS']
            ls = info['FileVersionLS']
            version_str = f"{ms >> 16}.{ms & 0xFFFF}.{ls >> 16}"
        except:
            # Fallback if GetFileVersionInfo fails (e.g. while testing)
            try:
                tauri_conf_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src-tauri", "tauri.conf.json")
                with open(tauri_conf_path, "r", encoding="utf-8") as f:
                    conf_data = json.load(f)
                    version_str = conf_data.get("version", "1.0.0")
            except:
                version_str = "1.0.0"

        if logger:
            logger.info(f"Detected application version: {version_str}")

        return version_str

    except Exception as e:
        if logger:
            logger.error(f"Failed to read EXE version: {e}")
        return "1.0.0"

class UpdateManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(UpdateManager, cls).__new__(cls)
                cls._instance._init_state()
            return cls._instance

    def __init__(self, *args, **kwargs):
        pass # Ignore legacy args like silent and logger from main.py

    def _init_state(self):
        self.logger = logging.getLogger("UpdateManager")
        self.current_version = get_current_version(self.logger)
        self.status = "idle" # idle, checking, update_available, downloading, ready
        self.latest_version = None
        self.download_url = None
        self.progress = 0
        self.error = None

    def start(self):
        # Background automatic update loop disabled when UI triggers it, but we can safely ignore
        pass

    def get_state(self):
        return {
            "status": self.status,
            "current_version": self.current_version,
            "latest_version": self.latest_version,
            "progress": self.progress,
            "error": self.error
        }

    def check_for_update_async(self):
        if self.status in ["checking", "downloading"]:
            return
        thread = threading.Thread(target=self._check_for_update, daemon=True)
        thread.start()

    def _check_for_update(self):
        self.status = "checking"
        self.error = None
        try:
            headers = {"User-Agent": "Stasis-Updater"}
            response = requests.get(API_URL, headers=headers, timeout=10)
            response.raise_for_status()

            data = response.json()
            # Strip both 'v' and '-' characters if they exist before parsing
            tag_name = data["tag_name"].lstrip("v")
            self.latest_version = tag_name

            if version.parse(self.latest_version) > version.parse(self.current_version):
                for asset in data["assets"]:
                    asset_name = asset["name"]
                    if asset_name.startswith("Stasis_") and asset_name.endswith(".exe"):
                        self.download_url = asset["browser_download_url"]
                        self.status = "update_available"
                        return

                self.error = "Update available but no installer found."
                self.status = "idle"
            else:
                self.status = "idle"

        except Exception as e:
            self.error = f"Failed to check for updates: {str(e)}"
            self.status = "idle"

    def download_and_install_async(self):
        if self.status != "update_available" or not self.download_url:
            return
        thread = threading.Thread(target=self._download_and_install, daemon=True)
        thread.start()

    def _download_and_install(self):
        self.status = "downloading"
        self.progress = 0
        self.error = None
        try:
            headers = {"User-Agent": "Stasis-Updater"}
            response = requests.get(self.download_url, headers=headers, stream=True, timeout=20)
            response.raise_for_status()

            total_size = int(response.headers.get("content-length", 0))
            block_size = 8192

            temp_dir = Path(os.getenv("TEMP"))
            temp_path = temp_dir / "StasisUpdate.exe"

            with open(temp_path, "wb") as file:
                downloaded = 0
                for chunk in response.iter_content(block_size):
                    if chunk:
                        file.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            self.progress = int(downloaded * 100 / total_size)

            if not temp_path.exists():
                self.error = "Downloaded file not found."
                self.status = "idle"
                return

            self.status = "ready"
            
            # Use ShellExecute with "runas" to trigger the UAC prompt for elevation
            try:
                # Parameters for the installer
                params = "/verysilent /norestart /closeapplications /forcecloseapplications"
                
                # Execute with 'runas' verb to request elevation
                result = ctypes.windll.shell32.ShellExecuteW(
                    None, 
                    "runas", 
                    str(temp_path), 
                    params, 
                    None, 
                    1 # SW_SHOWNORMAL
                )
                
                if result <= 32:
                    raise Exception(f"ShellExecute failed with code {result}")
                
                # Exit this instance if the installer started successfully
                os._exit(0)
            except Exception as launch_err:
                self.error = f"Failed to launch installer: {str(launch_err)}"
                self.status = "idle"

        except Exception as e:
            self.error = f"Download failed: {str(e)}"
            self.status = "idle"
import requests
import os
import threading
import subprocess
from packaging import version
from pathlib import Path
import tkinter as tk
from tkinter import ttk
import sys
import win32api

API_URL = "https://api.github.com/repos/arshsisodiya/StartupNotifier/releases/latest"
INSTALLER_NAME_PREFIX = "StartupNotifierSetup"

# ---------------- Version ---------------- #

def get_current_version(logger=None):
    try:
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
        else:
            exe_path = __file__

        if logger:
            logger.info(f"Reading version from: {exe_path}")

        info = win32api.GetFileVersionInfo(exe_path, "\\")
        ms = info['FileVersionMS']
        ls = info['FileVersionLS']

        version_str = f"{ms >> 16}.{ms & 0xFFFF}.{ls >> 16}"

        if logger:
            logger.info(f"Detected application version: {version_str}")

        return version_str

    except Exception as e:
        if logger:
            logger.error(f"Failed to read EXE version: {e}")
        return "0.0.0"


# ---------------- Update Manager ---------------- #

class UpdateManager:

    def __init__(self, silent=False, logger=None, shutdown_event=None):
        self.shutdown_event = shutdown_event
        self.silent = silent
        self.logger = logger
        self.root = None
        self.progress = None
        self.status_label = None
        self.current_version = get_current_version(logger)
        self._logged_milestones = set()
        self._milestones = [0, 10, 25, 50, 75, 100]

    # ---------------- UI ---------------- #

    def _create_ui(self):
        self.root = tk.Tk()
        self.root.title("Updating Startup Notifier")
        self.root.geometry("400x120")
        self.root.resizable(False, False)

        self.status_label = tk.Label(self.root, text="Checking for updates...")
        self.status_label.pack(pady=10)

        self.progress = ttk.Progressbar(self.root, length=350)
        self.progress.pack(pady=5)

        self.root.update()

    def _update_progress(self, percent):
        if not self.silent and self.progress:
            self.root.after(0, lambda: self.progress.config(value=percent))

        # Log only milestone percentages
        for milestone in self._milestones:
            if percent >= milestone and milestone not in self._logged_milestones:
                self._logged_milestones.add(milestone)
                if self.logger:
                    self.logger.info(f"Download progress reached {milestone}%")

    def _update_status(self, message):
        if not self.silent and self.status_label:
            self.root.after(0, lambda: self.status_label.config(text=message))

        if self.logger:
            self.logger.info(f"STATUS: {message}")

    # ---------------- Core ---------------- #

    def start(self):
        if self.logger:
            self.logger.info("Starting update check...")

        thread = threading.Thread(target=self._run_update, daemon=True)
        thread.start()

        if not self.silent:
            self._create_ui()
            self.root.mainloop()

    def _run_update(self):
        update_info = self._check_for_update()

        if not update_info:
            if self.logger:
                self.logger.info("No update required.")

            if not self.silent and self.root:
                self._update_status("You are using the latest version.")
                self.root.after(2000, self.root.destroy)
            return

        self._download_and_install(update_info["url"])

    # ---------------- Check GitHub ---------------- #

    def _check_for_update(self):
        try:
            self._update_status("Checking GitHub for latest release...")

            headers = {"User-Agent": "StartupNotifier-Updater"}
            response = requests.get(API_URL, headers=headers, timeout=10)
            response.raise_for_status()

            data = response.json()
            latest_version = data["tag_name"].lstrip("v")

            if self.logger:
                self.logger.info(
                    f"Current version: {self.current_version} | "
                    f"Latest version on GitHub: {latest_version}"
                )

            if version.parse(latest_version) > version.parse(self.current_version):

                if self.logger:
                    self.logger.info("Update available.")

                for asset in data["assets"]:
                    asset_name = asset["name"]

                    if self.logger:
                        self.logger.info(f"Found release asset: {asset_name}")

                    if asset_name.startswith(INSTALLER_NAME_PREFIX):
                        if self.logger:
                            self.logger.info("Matching installer asset found.")

                        return {
                            "version": latest_version,
                            "url": asset["browser_download_url"]
                        }

                if self.logger:
                    self.logger.warning("Update detected but no matching installer asset found.")

            else:
                if self.logger:
                    self.logger.info("Application is already up to date.")

            return None

        except Exception as e:
            if self.logger:
                self.logger.error(f"Update check failed: {e}")
            return None

    # ---------------- Download & Install ---------------- #

    def _download_and_install(self, url):
        try:
            self._logged_milestones.clear()
            self._update_status("Downloading update...")

            if self.logger:
                self.logger.info(f"Downloading from URL: {url}")

            headers = {"User-Agent": "StartupNotifier-Updater"}
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()

            total_size = int(response.headers.get("content-length", 0))
            block_size = 8192

            temp_dir = Path(os.getenv("TEMP"))
            temp_path = temp_dir / "StartupNotifierUpdate.exe"

            if self.logger:
                self.logger.info(f"Download directory: {temp_dir}")
                self.logger.info(f"Installer will be saved as: {temp_path}")
                self.logger.info(f"Total download size: {total_size} bytes")

            with open(temp_path, "wb") as file:
                downloaded = 0
                for chunk in response.iter_content(block_size):
                    if chunk:
                        file.write(chunk)
                        downloaded += len(chunk)

                        if total_size > 0:
                            percent = int(downloaded * 100 / total_size)
                            self._update_progress(percent)

            if self.logger:
                self.logger.info("Download completed successfully.")
                self.logger.info(f"Installer saved at: {temp_path}")

            if not temp_path.exists():
                if self.logger:
                    self.logger.error("Downloaded file does not exist after download!")
                return

            self._update_status("Installing update...")

            if self.logger:
                self.logger.info("Launching installer silently...")
                self.logger.info("Installer flags: /verysilent /norestart")

            subprocess.Popen(
                [
                    str(temp_path),
                    "/verysilent",
                    "/norestart",
                    "/closeapplications",
                    "/forcecloseapplications"
                ],
                shell=False
            )

            os._exit(0)


        except Exception as e:
            if self.logger:
                self.logger.error(f"Update download/install failed: {e}")

            if not self.silent and self.root:
                self._update_status("Update failed.")
                self.root.after(3000, self.root.destroy)
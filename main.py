# main.py

from telegram_client import TelegramClient
from logger import setup_logger
from startup import add_to_startup
from network import wait_for_internet
from datetime import datetime
import socket
import platform
import sys
import os
import time

logger = setup_logger()


def get_executable_path():
    if getattr(sys, "frozen", False):
        return sys.executable
    return os.path.abspath(__file__)


def get_system_info() -> str:
    hostname = socket.gethostname()
    os_name = platform.system()
    os_version = platform.version()
    boot_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return (
        f"🖥 <b>System Started</b>\n"
        f"• Hostname: {hostname}\n"
        f"• OS: {os_name} {os_version}\n"
        f"• Time: {boot_time}"
    )


def main():
    logger.info("Application started")

    # Register startup once
    exe_path = get_executable_path()
    add_to_startup(exe_path)

    # Give Defender + system some breathing room
    time.sleep(15)

    # wait for internet
    if not wait_for_internet(timeout=90):
        logger.error("Startup aborted: No internet")
        return

    client = TelegramClient()

    # ✅ STARTUP MESSAGE FIRST
    if not client.send_message(get_system_info(), retries=5, delay=6):
        logger.error("Startup message failed after retries")
    else:
        logger.info("Startup message delivered successfully")

    # cooldown before polling
    time.sleep(20)

    # optional /ping listener
    client.poll_commands(duration=30)

    if not client.send_message(message, retries=5, delay=6):
        logger.error("Startup notification ultimately failed")

    logger.info("Application finished execution")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)

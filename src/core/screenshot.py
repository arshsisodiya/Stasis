# screenshot.py

import os
import time
from PIL import ImageGrab
from src.config.storage import get_data_dir
from src.utils.logger import setup_logger

logger = setup_logger()


def capture_screenshot():
    """
    Captures screenshot and returns file path
    """
    try:
        app_dir = get_data_dir()
        os.makedirs(app_dir, exist_ok=True)

        filename = f"screenshot_{int(time.time())}.png"
        filepath = os.path.join(app_dir, filename)

        img = ImageGrab.grab(all_screens=False)
        img.save(filepath, "PNG")

        logger.info(f"Screenshot captured: {filepath}")
        return filepath

    except Exception as e:
        logger.error(f"Screenshot capture failed: {e}")
        return None

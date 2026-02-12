# webcam.py
import cv2
import os
import time
from logger import setup_logger
from logger import get_app_data_dir

logger = setup_logger()


def capture_webcam():
    """
    Captures an image from the webcam and returns the file path.
    """
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        logger.error("Could not open webcam.")
        return None

    try:
        app_dir = get_app_data_dir()
        os.makedirs(app_dir, exist_ok=True)
        filename = f"webcam_{int(time.time())}.jpg"
        filepath = os.path.join(app_dir, filename)

        # Warm up the camera (skip first few frames for auto-exposure)
        for _ in range(5):
            ret, frame = cap.read()

        if ret:
            cv2.imwrite(filepath, frame)
            logger.info(f"Webcam image captured: {filepath}")
            return filepath
        else:
            logger.error("Failed to capture webcam frame.")
            return None

    except Exception as e:
        logger.error(f"Webcam capture failed: {e}")
        return None
    finally:
        cap.release()


# webcam.py (Add to existing file)
def record_video(duration=10):
    """
    Records video from webcam for a specific duration (seconds) and returns the file path.
    """
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        logger.error("Could not open webcam for video.")
        return None

    try:
        # Get camera properties
        fps = cap.get(cv2.CAP_PROP_FPS) or 20.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        app_dir = get_app_data_dir()
        filename = f"video_{int(time.time())}.mp4"
        filepath = os.path.join(app_dir, filename)

        # Define codec and create VideoWriter
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(filepath, fourcc, fps, (width, height))

        logger.info(f"Recording {duration}s video...")
        start_time = time.time()

        # Record until duration is met
        while (time.time() - start_time) < duration:
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)

        out.release()
        logger.info(f"Video recorded: {filepath}")
        return filepath

    except Exception as e:
        logger.error(f"Video recording failed: {e}")
        return None
    finally:
        cap.release()
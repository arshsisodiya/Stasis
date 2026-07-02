# webcam.py
import os
import time
import sys
import cv2
from src.utils.logger import setup_logger
from src.config.storage import get_data_dir

logger = setup_logger()

def _get_camera():
    # Use DirectShow on Windows, it's generally much more reliable than MSMF
    # and fixes the "black screen" or 1 FPS background throttling issues on webcams.
    if sys.platform.startswith('win'):
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        if cap.isOpened():
            logger.info("[webcam] Opened camera index 0 with DSHOW backend.")
            return cap
        logger.warning("[webcam] Failed to open camera with DSHOW backend, trying default (MSMF) fallback...")
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            logger.info("[webcam] Opened camera index 0 with default (MSMF) backend.")
            return cap
    else:
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            logger.info("[webcam] Opened camera index 0 with default backend.")
            return cap
    return cap

def capture_webcam():
    """
    Captures an image from the webcam and returns the file path.
    """
    cap = _get_camera()
    if not cap.isOpened():
        logger.error("[webcam] Could not open webcam.")
        return None

    try:
        app_dir = get_data_dir()
        os.makedirs(app_dir, exist_ok=True)
        filepath = os.path.join(app_dir, f"webcam_{int(time.time())}.jpg")

        # Warm up: read 3 frames to skip initial blank driver frames
        frame = None
        for _ in range(3):
            ret, temp_frame = cap.read()
            if ret and temp_frame is not None:
                frame = temp_frame

        if frame is not None:
            cv2.imwrite(filepath, frame)
            if os.path.isfile(filepath) and os.path.getsize(filepath) > 0:
                logger.info(f"[webcam] Image captured: {filepath}")
                return filepath
            
        logger.error("[webcam] Failed to capture valid frame.")
        return None
    except Exception as e:
        logger.error(f"[webcam] Capture failed: {e}")
        return None
    finally:
        cap.release()

def record_video(duration=10):
    """
    Records video from webcam for a specific duration (seconds).
    Returns an MP4 file path.
    """
    cap = _get_camera()
    if not cap.isOpened():
        logger.error("[webcam] Could not open webcam for video.")
        return None

    out = None
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

        # Warm up camera and measure actual capture rate to handle background process throttling (if MSMF fallback is used)
        logger.info("[webcam] Warming up camera and measuring frame rate...")
        warmup_start = time.time()
        warmup_frames = 0
        for _ in range(5):
            ret, frame = cap.read()
            if ret and frame is not None:
                warmup_frames += 1
        elapsed = time.time() - warmup_start

        fps = 20.0
        if warmup_frames > 0 and elapsed > 0:
            fps = warmup_frames / elapsed

        if fps < 1.0:
            fps = 1.0
        elif fps > 30.0:
            fps = 30.0

        logger.info(f"[webcam] Camera properties: {width}x{height} @ {fps:.2f}fps")

        app_dir = get_data_dir()
        os.makedirs(app_dir, exist_ok=True)
        filepath = os.path.join(app_dir, f"video_{int(time.time())}.mp4")

        # Direct MP4 recording using mp4v codec
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(filepath, fourcc, fps, (width, height))
        
        if not out.isOpened():
            logger.error("[webcam] Failed to open VideoWriter.")
            cap.release()
            return None

        logger.info(f"[webcam] Recording {duration}s video directly to MP4 at max frames...")
        start_time = time.time()
        frame_count = 0
        
        while (time.time() - start_time) < duration:
            ret, frame = cap.read()
            if not ret or frame is None:
                logger.warning("[webcam] Frame read failed or empty, stopping.")
                break
                
            out.write(frame)
            frame_count += 1

        # Release writer to finalize and save the MP4 file
        out.release()
        out = None
        
        file_size = os.path.getsize(filepath) if os.path.isfile(filepath) else 0
        logger.info(f"[webcam] Recording complete | frames={frame_count} | size={file_size/1024:.1f}KB")
        
        if frame_count > 0 and file_size > 0:
            return filepath
            
        logger.error("[webcam] Recorded file is invalid/empty.")
        return None

    except Exception as e:
        logger.error(f"[webcam] Video recording failed: {e}", exc_info=True)
        return None
    finally:
        if out is not None:
            out.release()
        cap.release()
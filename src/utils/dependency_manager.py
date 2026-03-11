# src/utils/dependency_manager.py

import sys
import subprocess
import importlib.util
import importlib
from src.utils.logger import setup_logger

logger = setup_logger()

def is_installed(package_name: str) -> bool:
    """Checks if a package is installed."""
    import_name = package_name
    if package_name in ["opencv-python", "opencv-python-headless"]:
        import_name = "cv2"
    elif package_name == "Pillow":
        import_name = "PIL"
    
    spec = importlib.util.find_spec(import_name)
    status = spec is not None
    
    # Extra verification for critical packages that might be partially installed/broken
    if status and import_name == "cv2":
        try:
            import cv2
            if not hasattr(cv2, "VideoCapture"):
                logger.warning("cv2 is installed but missing VideoCapture. Marking as NOT installed.")
                status = False
        except Exception as e:
            logger.warning(f"Failed to import cv2 for verification: {e}. Marking as NOT installed.")
            status = False

    logger.info(f"Dependency check: {package_name} (import: {import_name}) - Installed: {status}")
    return status

def install_package(package_name: str) -> bool:
    """Attempts to install a package using pip at runtime."""
    try:
        logger.info(f"--- Starting Dynamic Installation: {package_name} ---")
        
        # We'll try to capture output to log it
        # Using --upgrade --force-reinstall might be safer if we detected it was broken
        cmd = [sys.executable, "-m", "pip", "install", "--upgrade", package_name]
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate(timeout=300) # 5 minute timeout
        
        if process.returncode == 0:
            importlib.invalidate_caches()
            
            # If the module was already attempted to be loaded (and potentially failed/broken)
            # we should remove it from sys.modules to force a fresh import next time.
            import_name = package_name
            if package_name in ["opencv-python", "opencv-python-headless"]:
                import_name = "cv2"
            elif package_name == "Pillow":
                import_name = "PIL"
                
            if import_name in sys.modules:
                logger.info(f"Removing {import_name} from sys.modules to force reload.")
                del sys.modules[import_name]

            logger.info(f"Successfully installed {package_name}")
            if stdout.strip():
                logger.info(f"Pip output:\n{stdout}")
            return True
        else:
            logger.error(f"Failed to install {package_name}. Pip return code: {process.returncode}")
            logger.error(f"Pip error output:\n{stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        process.kill()
        logger.error(f"Installation of {package_name} timed out after 300 seconds.")
        return False
    except Exception as e:
        logger.exception(f"Unexpected error during installation of {package_name}: {e}")
        return False

def ensure_package(package_name: str) -> bool:
    """Checks if a package is installed, and if not, attempts to install it."""
    if is_installed(package_name):
        return True
    
    logger.info(f"Dependency {package_name} is missing. Triggering install...")
    success = install_package(package_name)
    
    if success:
        importlib.invalidate_caches()
        # Re-verify after install
        return is_installed(package_name)
    return False


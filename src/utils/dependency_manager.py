# src/utils/dependency_manager.py

import sys
import subprocess
import importlib.util
import importlib
import threading
import re
from src.utils.logger import setup_logger

logger = setup_logger()

# Global state for tracking installation progress
# { "package_name": { "progress": 0, "status": "idle", "message": "" } }
install_progress = {}

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

def get_install_progress(package_name: str) -> dict:
    """Returns the current progress of a package installation."""
    return install_progress.get(package_name, {"progress": 0, "status": "idle", "message": ""})

def install_package_async(package_name: str):
    """Starts the installation process in a background thread."""
    thread = threading.Thread(target=install_package, args=(package_name,))
    thread.daemon = True
    thread.start()

def install_package(package_name: str) -> bool:
    """Attempts to install a package using pip at runtime with progress tracking."""
    try:
        logger.info(f"--- Starting Dynamic Installation: {package_name} ---")
        install_progress[package_name] = {"progress": 5, "status": "starting", "message": "Starting pip..."}
        
        # Force progress bar even when piped
        cmd = [sys.executable, "-m", "pip", "install", "--upgrade", package_name, "--progress-bar", "on"]
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, 
            text=True,
            bufsize=0, # Unbuffered for real-time reading
            universal_newlines=True
        )
        
        last_progress = 5
        output_lines = []
        current_line = ""
        
        # Read character by character to handle \r updates
        while True:
            char = process.stdout.read(1)
            if not char:
                break
            
            if char == '\n' or char == '\r':
                if current_line.strip():
                    line = current_line.strip()
                    output_lines.append(line)
                    
                    # Try to match MB progress: "10.5/38.0 MB"
                    mb_match = re.search(r"([\d\.]+)/([\d\.]+)\s+MB", line)
                    if mb_match:
                        current = float(mb_match.group(1))
                        total = float(mb_match.group(2))
                        if total > 0:
                            val = (current / total) * 100
                            # Map 0-100 to 10-85 range
                            progress = 10 + (val * 0.75)
                            if progress > last_progress:
                                last_progress = progress
                                install_progress[package_name] = {
                                    "progress": int(progress), 
                                    "status": "downloading", 
                                    "message": f"Downloading... {current:.1f}/{total:.1f} MB ({int(val)}%)"
                                }
                    
                    # Try to match direct percentages: "50%"
                    pct_match = re.search(r"(\d+)%", line)
                    if pct_match:
                        val = int(pct_match.group(1))
                        progress = 10 + (val * 0.8)
                        if progress > last_progress:
                            last_progress = progress
                            install_progress[package_name] = {
                                "progress": int(progress), 
                                "status": "installing", 
                                "message": f"Installation progress: {int(progress)}%"
                            }

                    elif "Downloading" in line:
                        install_progress[package_name] = {"progress": 15, "status": "downloading", "message": "Starting download..."}
                    elif "Installing collected packages" in line:
                        install_progress[package_name] = {"progress": 90, "status": "finalizing", "message": "Finalizing installation..."}
                
                current_line = ""
            else:
                current_line += char

        process.wait()
        
        if process.returncode == 0:
            importlib.invalidate_caches()
            
            import_name = package_name
            if package_name in ["opencv-python", "opencv-python-headless"]:
                import_name = "cv2"
            elif package_name == "Pillow":
                import_name = "PIL"
                
            if import_name in sys.modules:
                logger.info(f"Removing {import_name} from sys.modules to force reload.")
                del sys.modules[import_name]

            install_progress[package_name] = {"progress": 100, "status": "success", "message": "Installation complete!"}
            logger.info(f"Successfully installed {package_name}")
            return True
        else:
            install_progress[package_name] = {"progress": 0, "status": "error", "message": "Installation failed"}
            logger.error(f"Failed to install {package_name}. Pip return code: {process.returncode}")
            logger.error(f"Full pip output:\n" + "\n".join(output_lines))
            return False
            
    except Exception as e:
        install_progress[package_name] = {"progress": 0, "status": "error", "message": str(e)}
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


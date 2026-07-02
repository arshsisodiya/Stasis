# src/utils/dependency_manager.py

import os
import sys
import subprocess
import importlib.util
import importlib
import threading
import re
import shutil
from src.utils.logger import setup_logger

logger = setup_logger()

# Global state for tracking installation progress
# { "package_name": { "progress": 0, "status": "idle", "message": "" } }
install_progress = {}

# Map pip package names to their importable module names
PACKAGE_IMPORT_MAP = {
    "opencv-python": "cv2",
    "opencv-python-headless": "cv2",
    "Pillow": "PIL",
}

def _get_import_name(package_name: str) -> str:
    return PACKAGE_IMPORT_MAP.get(package_name, package_name)


def _get_python_executable() -> str:
    """
    Returns the path to the real python.exe interpreter.

    When running as a PyInstaller-compiled bundle, sys.executable points to the
    bundled .exe (e.g. stasis-backend.exe), NOT to python.exe. Using that .exe
    for subprocess calls re-launches the whole app instead of running Python.

    Strategy:
      1. If not frozen, sys.executable is already python.exe — use it directly.
      2. If frozen, prefer sys._base_executable (set by Python itself).
      3. Search common locations relative to the bundle directory.
      4. Fall back to 'python' on PATH.
    """
    is_frozen = getattr(sys, 'frozen', False)
    logger.info(f"[DependencyManager] Resolving Python executable | frozen={is_frozen} | sys.executable={sys.executable}")

    if not is_frozen:
        logger.info(f"[DependencyManager] Dev mode — using sys.executable directly: {sys.executable}")
        return sys.executable

    # --- Frozen (PyInstaller) path ---
    exe_dir = os.path.dirname(sys.executable)

    # sys._base_executable is the most authoritative source when available
    base = getattr(sys, '_base_executable', None)
    logger.info(f"[DependencyManager] sys._base_executable={base!r}")

    candidates = []
    if base and os.path.isfile(base) and 'stasis' not in base.lower():
        candidates.append(base)

    # Common locations relative to the bundle
    candidates += [
        os.path.join(exe_dir, "python.exe"),
        os.path.join(exe_dir, "python", "python.exe"),
        os.path.join(exe_dir, "..", "python.exe"),
    ]

    logger.info(f"[DependencyManager] Searching candidate Python paths: {candidates}")
    for candidate in candidates:
        norm = os.path.normpath(candidate)
        exists = os.path.isfile(norm)
        logger.info(f"[DependencyManager]   Candidate: {norm!r} — exists={exists}")
        if exists:
            logger.info(f"[DependencyManager] Resolved Python executable: {norm}")
            return norm

    # Last resort: PATH
    found = shutil.which("python")
    logger.info(f"[DependencyManager] PATH search for 'python': {found!r}")
    if found:
        return found

    logger.warning(
        f"[DependencyManager] Could not resolve real python.exe — "
        f"falling back to sys.executable={sys.executable!r}. "
        f"This may cause subprocess calls to re-launch the app!"
    )
    return sys.executable


# Resolved once at module load time — logged so it shows up in every log session
_PYTHON_EXE = _get_python_executable()
logger.info(f"[DependencyManager] _PYTHON_EXE resolved to: {_PYTHON_EXE}")


def _get_real_site_packages() -> list:
    """
    Ask the REAL python.exe for its site-packages directories.

    When running frozen (PyInstaller), the in-process site.getsitepackages()
    only returns the bundled _internal/Lib/site-packages, NOT the system
    Python's site-packages where runtime-installed packages like cv2 live.
    This queries the real interpreter to get the correct paths.
    """
    import json
    try:
        result = subprocess.run(
            [_PYTHON_EXE, "-c",
             "import site, json; print(json.dumps(site.getsitepackages()))"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            paths = json.loads(result.stdout.strip())
            logger.info(f"[DependencyManager] Real site-packages from {_PYTHON_EXE}: {paths}")
            return paths
        else:
            logger.warning(
                f"[DependencyManager] Could not get real site-packages — "
                f"rc={result.returncode} stderr={result.stderr.strip()!r}"
            )
    except Exception as e:
        logger.warning(f"[DependencyManager] _get_real_site_packages() failed: {e}")
    return []


def inject_real_site_packages():
    """
    Inject the real Python's site-packages into sys.path so that packages
    installed at runtime (e.g. cv2) can be imported by the frozen process.

    This must be called after pip installs a package, or when is_installed()
    confirms a package exists in the real interpreter but not in sys.path.
    """
    injected = []
    for sp in _get_real_site_packages():
        if sp not in sys.path:
            sys.path.insert(0, sp)
            injected.append(sp)
            logger.info(f"[DependencyManager] Injected real site-packages into sys.path: {sp}")
        else:
            logger.info(f"[DependencyManager] Real site-packages already in sys.path: {sp}")
    if not injected:
        logger.info("[DependencyManager] No new real site-packages paths needed (all already present)")
    return injected


# Pre-inject the real site-packages at startup so cv2 is importable immediately
# if it was already installed before this session.
_startup_injected = inject_real_site_packages()
logger.info(f"[DependencyManager] Startup site-packages injection complete | injected={_startup_injected}")


# ─────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────

def _can_import_in_subprocess(import_name: str) -> bool:
    """
    Verify that a module is importable by spawning a fresh real-python subprocess.

    Why subprocess? Two reasons:
      1. find_spec() uses the parent process's cached sys.path state, so packages
         installed at runtime via pip are invisible until the process restarts.
      2. When running as a PyInstaller bundle, sys.executable is the app .exe —
         subprocess calls must use the real python.exe (_PYTHON_EXE) to avoid
         re-launching the entire app.
    """
    cmd = [_PYTHON_EXE, "-c", f"import {import_name}; print('ok')"]
    logger.info(f"[DependencyManager] Subprocess import check | cmd={cmd}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        ok = result.returncode == 0 and "ok" in stdout
        logger.info(
            f"[DependencyManager] Subprocess import check result | "
            f"module={import_name} | rc={result.returncode} | ok={ok} | "
            f"stdout={stdout!r} | stderr={stderr!r}"
        )
        if not ok and stderr:
            logger.error(f"[DependencyManager] Subprocess import error for {import_name}:\n{stderr}")
        return ok
    except subprocess.TimeoutExpired:
        logger.error(f"[DependencyManager] Subprocess import check timed out for {import_name} (>15s)")
        return False
    except Exception as e:
        logger.error(f"[DependencyManager] Subprocess import check crashed for {import_name}: {e}", exc_info=True)
        return False


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────

def is_installed(package_name: str) -> bool:
    """
    Checks if a package is installed and importable.

    Uses in-process find_spec first (fast path), then falls back to a subprocess
    check (reliable after runtime pip installs and when running frozen).
    """
    import_name = _get_import_name(package_name)
    logger.info(f"[DependencyManager] is_installed? | package={package_name} | import_name={import_name}")

    # ── Step 1: Clear stale None entries from sys.modules ──────────────────
    stale = [k for k in sys.modules if (k == import_name or k.startswith(import_name + ".")) and sys.modules[k] is None]
    if stale:
        logger.info(f"[DependencyManager] Clearing stale sys.modules entries: {stale}")
        for k in stale:
            del sys.modules[k]

    # ── Step 2: Fast in-process check via find_spec ─────────────────────────
    try:
        importlib.invalidate_caches()
        sys.path_importer_cache.clear()
        spec = importlib.util.find_spec(import_name)
        logger.info(f"[DependencyManager] find_spec({import_name!r}) = {spec}")

        if spec is not None:
            if import_name == "cv2":
                # Extra check: actually import and confirm VideoCapture is present
                try:
                    if import_name in sys.modules:
                        logger.info(f"[DependencyManager] Evicting cached {import_name} from sys.modules before verification import")
                        del sys.modules[import_name]
                    import cv2
                    has_cap = hasattr(cv2, "VideoCapture")
                    logger.info(
                        f"[DependencyManager] cv2 in-process verification | "
                        f"version={getattr(cv2, '__version__', 'unknown')!r} | "
                        f"has_VideoCapture={has_cap}"
                    )
                    if not has_cap:
                        logger.warning("[DependencyManager] cv2 imported but VideoCapture missing — package may be corrupt/headless mismatch")
                    logger.info(f"[DependencyManager] is_installed({package_name}) = {has_cap} (in-process)")
                    return has_cap
                except Exception as e:
                    logger.warning(
                        f"[DependencyManager] cv2 import failed despite find_spec finding it: {e} "
                        f"— falling through to subprocess check"
                    )
            else:
                logger.info(f"[DependencyManager] is_installed({package_name}) = True (find_spec, in-process)")
                return True

    except (ModuleNotFoundError, ValueError) as e:
        logger.warning(f"[DependencyManager] find_spec raised {type(e).__name__}: {e}")

    # ── Step 3: Subprocess fallback (ground truth) ──────────────────────────
    logger.info(f"[DependencyManager] Falling back to subprocess check for {import_name}")
    status = _can_import_in_subprocess(import_name)

    if status:
        # Package is installed in the real Python but invisible to the frozen
        # process's import machinery. Inject the REAL site-packages paths
        # (not the bundled _internal ones) so 'import cv2' works in-process.
        logger.info(f"[DependencyManager] Package found by subprocess but not in-process — injecting real site-packages")
        inject_real_site_packages()
        importlib.invalidate_caches()
        sys.path_importer_cache.clear()

    logger.info(f"[DependencyManager] is_installed({package_name}) = {status} (subprocess verified)")
    return status


def get_install_progress(package_name: str) -> dict:
    """Returns the current progress of a package installation."""
    return install_progress.get(package_name, {"progress": 0, "status": "idle", "message": ""})


def install_package_async(package_name: str):
    """Starts the installation process in a background thread."""
    logger.info(f"[DependencyManager] Scheduling async install for {package_name}")
    thread = threading.Thread(target=install_package, args=(package_name,), daemon=True)
    thread.start()


def install_package(package_name: str) -> bool:
    """
    Attempts to install a package using pip at runtime with progress tracking.

    IMPORTANT: Uses _PYTHON_EXE (not sys.executable) to invoke pip. When running
    as a PyInstaller bundle, sys.executable is the bundled app exe — using it
    would re-launch the entire Stasis application instead of pip.
    """
    # ── Pre-flight log ───────────────────────────────────────────────────────
    logger.info(
        f"[DependencyManager] ══════ Starting installation: {package_name} ══════\n"
        f"  Python interpreter : {_PYTHON_EXE}\n"
        f"  sys.executable     : {sys.executable}\n"
        f"  frozen             : {getattr(sys, 'frozen', False)}\n"
        f"  sys.path[:5]       : {sys.path[:5]}"
    )
    install_progress[package_name] = {"progress": 5, "status": "starting", "message": "Starting pip..."}

    try:
        cmd = [
            _PYTHON_EXE, "-m", "pip", "install", "--upgrade",
            package_name, "--progress-bar", "on"
        ]
        logger.info(f"[DependencyManager] pip command: {' '.join(cmd)}")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=0,
            universal_newlines=True
        )
        logger.info(f"[DependencyManager] pip process started | PID={process.pid}")

        last_progress = 5
        output_lines = []
        current_line = ""

        while True:
            char = process.stdout.read(1)
            if not char:
                break

            if char in ('\n', '\r'):
                if current_line.strip():
                    line = current_line.strip()
                    output_lines.append(line)

                    # MB progress: "10.5/38.0 MB"
                    mb_match = re.search(r"([\d\.]+)/([\d\.]+)\s+MB", line)
                    if mb_match:
                        current_mb = float(mb_match.group(1))
                        total_mb = float(mb_match.group(2))
                        if total_mb > 0:
                            val = (current_mb / total_mb) * 100
                            progress = 10 + (val * 0.75)
                            if progress > last_progress:
                                last_progress = progress
                                install_progress[package_name] = {
                                    "progress": int(progress),
                                    "status": "downloading",
                                    "message": f"Downloading... {current_mb:.1f}/{total_mb:.1f} MB ({int(val)}%)"
                                }

                    # Percentage: "50%"
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
        logger.info(f"[DependencyManager] pip finished | PID={process.pid} | returncode={process.returncode}")
        logger.info(f"[DependencyManager] Full pip output:\n" + "\n".join(output_lines))

        if process.returncode == 0:
            import_name = _get_import_name(package_name)

            # Evict stale module cache entries
            evicted = [k for k in list(sys.modules) if k == import_name or k.startswith(import_name + ".")]
            if evicted:
                logger.info(f"[DependencyManager] Evicting sys.modules entries post-install: {evicted}")
                for k in evicted:
                    del sys.modules[k]

            # Inject the REAL Python's site-packages into sys.path.
            # IMPORTANT: Do NOT use the frozen process's site.getsitepackages() here —
            # it returns the bundled _internal paths, not the system site-packages
            # where pip just installed the package.
            inject_real_site_packages()
            importlib.invalidate_caches()
            sys.path_importer_cache.clear()

            install_progress[package_name] = {"progress": 100, "status": "success", "message": "Installation complete!"}
            logger.info(f"[DependencyManager] ✓ Successfully installed {package_name}")
            return True

        else:
            install_progress[package_name] = {"progress": 0, "status": "error", "message": "pip exited with error"}
            logger.error(
                f"[DependencyManager] ✗ pip failed for {package_name} | "
                f"returncode={process.returncode}\n"
                f"Full pip output:\n" + "\n".join(output_lines)
            )
            return False

    except Exception as e:
        install_progress[package_name] = {"progress": 0, "status": "error", "message": str(e)}
        logger.exception(f"[DependencyManager] Unexpected exception during installation of {package_name}: {e}")
        return False


def ensure_package(package_name: str) -> bool:
    """
    Checks if a package is installed; if not, installs it synchronously.

    After installation, uses subprocess-based verification as ground truth —
    find_spec is unreliable immediately after a runtime pip install on Windows,
    and sys.executable is wrong when running as a PyInstaller bundle.
    """
    logger.info(f"[DependencyManager] ensure_package({package_name!r}) called")

    if is_installed(package_name):
        logger.info(f"[DependencyManager] ensure_package({package_name!r}) — already installed, nothing to do")
        return True

    logger.info(f"[DependencyManager] ensure_package({package_name!r}) — NOT installed, triggering pip install")
    success = install_package(package_name)

    if success:
        import_name = _get_import_name(package_name)
        logger.info(f"[DependencyManager] pip reported success — running post-install subprocess verification for {import_name!r}")
        verified = _can_import_in_subprocess(import_name)
        if verified:
            logger.info(f"[DependencyManager] ✓ ensure_package({package_name!r}) — post-install verification PASSED")
        else:
            logger.error(
                f"[DependencyManager] ✗ ensure_package({package_name!r}) — post-install verification FAILED. "
                f"pip exited 0 but '{import_name}' is still not importable. "
                f"Check pip output above for clues (wrong Python? partial install? corrupt site-packages?)."
            )
        return verified

    logger.error(f"[DependencyManager] ✗ ensure_package({package_name!r}) — pip install failed, returning False")
    return False

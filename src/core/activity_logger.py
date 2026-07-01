import win32gui
import win32process
import datetime
import time
import asyncio
import gc
from pynput import mouse, keyboard

from src.core.url_sniffer import get_browser_url, url_resolver
from src.analytics.daily_summary import update_daily_stats
from src.database.database import get_connection, get_setting
from src.core.settings_cache import settings_cache
from src.core.process_cache import process_cache
from src.core.shutdown import shutdown_event
import win32con
import threading
from pynput.keyboard import Controller, Key

_kb_controller = Controller()

APP_NAME = "Stasis"
IDLE_THRESHOLD = 120        # seconds of no input = idle
SLEEP_DELTA_THRESHOLD = 15 # seconds gap = assume sleep/resume
POLL_INTERVAL = 1          # main loop interval in seconds
BATCH_COMMIT_INTERVAL = 15 # commit to disk every N seconds
PERIODIC_FLUSH_INTERVAL = 60 # flush active session to DB every N seconds even without tab switch

# Browser process names — used to match SMTC source_app_user_model_id
BROWSER_PROCESSES = {"chrome", "msedge", "brave", "firefox", "opera"}


# ===============================
# SMTC MEDIA SESSION MONITOR
# ===============================
class MediaSessionMonitor:
    """
    Polls the Windows Global System Media Transport Controls (SMTC) API
    on a background thread to determine whether any app (especially browsers)
    is actively playing media.

    Uses winsdk (pip install winsdk) which wraps the WinRT APIs.
    Falls back to False on import errors so the rest of the app keeps working
    even if winsdk is not installed.

    Thread-safety: _is_playing is written only from the background asyncio loop
    and read from the main thread — a boolean assignment is atomic in CPython,
    so no lock is needed.
    """

    # Maps WinRT PlaybackStatus integer to a human-readable string
    _STATUS_PLAYING = 4   # GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing

    def __init__(self):
        self._is_playing: bool = False
        self._playing_sources: dict = {}  # {app_name_lower: bool}
        self._available: bool = False   # False if winsdk not installed
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock() # Added for thread safety
        self._start_background_loop()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @property
    def is_available(self) -> bool:
        """False when winsdk is not installed — caller should fall back."""
        return self._available

    def is_media_playing(self) -> bool:
        """
        Returns True if any SMTC session reports PlaybackStatus == Playing.
        Always False when winsdk is unavailable.
        """
        with self._lock:
            return self._is_playing

    def is_app_playing(self, app_name: str) -> bool:
        """
        Returns True ONLY if the specific foreground app has an active
        SMTC playing session. app_name is the process name e.g. 'chrome.exe'.

        This prevents a background Spotify session from blocking idle
        detection when the foreground window is a paused YouTube tab.
        """
        name_lower = app_name.lower().replace(".exe", "")
        with self._lock:
            return self._playing_sources.get(name_lower, False)

    # ------------------------------------------------------------------
    # Background asyncio loop (runs in a daemon thread)
    # ------------------------------------------------------------------
    def _start_background_loop(self):
        try:
            # Validate import early so we can set _available correctly
            import winsdk.windows.media.control as wmc  # noqa: F401
            self._available = True
        except ImportError:
            print("[MediaSessionMonitor] winsdk not installed — SMTC unavailable. "
                  "Run: pip install winsdk")
            return

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="SMTCMonitor"
        )
        self._thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._poll_forever())
        except asyncio.CancelledError:
            pass

    async def _poll_forever(self):
        import winsdk.windows.media.control as wmc

        manager = None
        while not shutdown_event.is_set():
            try:
                # Re-acquire manager if needed (e.g. after resume from sleep)
                if manager is None:
                    manager = await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()

                sessions = manager.get_sessions()
                any_playing     = False

                playing_sources = {}
                for session in sessions:
                    pb_info = session.get_playback_info()
                    if pb_info is None:
                        continue

                    status = pb_info.playback_status
                    # PlaybackStatus: 0=Unknown,1=Closed,2=Opened,3=Changing,4=Stopped,5=Playing,6=Paused
                    is_playing = (int(status) == 5)

                    # source_app_user_model_id looks like "Chrome_Audio",
                    # "MSEdge", "Spotify.exe", "vlc.exe" etc.
                    source = (session.source_app_user_model_id or "").lower()

                    # Normalise to bare app name: "chrome_audio" -> "chrome"
                    # Strip common suffixes so we can match against app_name
                    for suffix in ("_audio", ".exe"):
                        source = source.replace(suffix, "")

                    if source:
                        playing_sources[source] = is_playing

                    if is_playing:
                        any_playing = True

                with self._lock:
                    self._is_playing       = any_playing
                    self._playing_sources  = playing_sources

            except Exception as e:
                # Manager can fail after sleep/resume; reset so we re-acquire next tick
                print(f"[MediaSessionMonitor] Poll error: {e}")
                manager = None
                with self._lock:
                    self._is_playing      = False
                    self._playing_sources = {}

            await asyncio.sleep(2)   # poll every 2 s — plenty for idle detection


# ===============================
# SLEEP MANAGER
# ===============================
class SleepManager:
    def __init__(self):
        self.is_sleeping = False
        self._create_message_window()

    def _create_message_window(self):
        CLASS_NAME = "SleepDetectorWindow"
        wc = win32gui.WNDCLASS()
        wc.lpfnWndProc = self._wnd_proc
        wc.lpszClassName = CLASS_NAME

        try:
            win32gui.RegisterClass(wc)
        except Exception:
            # Error 1410 = class already registered (e.g. hot-reload / second import).
            # Safe to ignore — CreateWindow still works with the existing class name.
            pass

        self.hwnd = win32gui.CreateWindow(
            CLASS_NAME,          # pass the string name, not the atom — always valid
            "SleepDetector", 0,
            0, 0, 0, 0, 0, 0, 0, None
        )
        threading.Thread(target=self._message_loop, daemon=True).start()

    def _message_loop(self):
        win32gui.PumpMessages()

    def _wnd_proc(self, hwnd, msg, wparam, lparam):
        if msg == win32con.WM_POWERBROADCAST:
            if wparam == win32con.PBT_APMSUSPEND:
                self.is_sleeping = True
            elif wparam == win32con.PBT_APMRESUMEAUTOMATIC:
                self.is_sleeping = False
        return 1


# ===============================
# WIN32 IDLE TIME
# ===============================
import ctypes
import ctypes.wintypes

class _LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.wintypes.UINT),
                ("dwTime",  ctypes.wintypes.DWORD)]

def _get_win32_idle_seconds() -> float:
    """
    Ask Windows directly how long since the last hardware input event
    (keyboard, mouse move, mouse click, touch, pen).

    This is the same API used by screensavers and power managers.
    It is immune to software-generated events because it reads from
    the kernel raw-input timestamp, not from pynput hooks.
    """
    lii = _LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(_LASTINPUTINFO)
    if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
        # Both values are milliseconds since boot; subtraction handles
        # the 49.7-day DWORD rollover safely.
        elapsed_ms = (ctypes.windll.kernel32.GetTickCount() - lii.dwTime) & 0xFFFFFFFF
        return elapsed_ms / 1000.0
    return 0.0


# ===============================
# INPUT TRACKER
# ===============================
class InputCounter:
    """
    Counts keystrokes and mouse clicks for productivity metrics.

    Idle time comes from Win32 GetLastInputInfo, NOT from pynput.
    Reason: pynput on_move fires constantly from OS cursor rendering,
    which would reset idle every frame and prevent detection entirely.
    Win32 GetLastInputInfo only responds to real hardware events.
    """
    def __init__(self):
        self.kb_count    = 0
        self.mouse_count = 0
        self._lock       = threading.Lock()

        self.kb_listener = keyboard.Listener(on_press=self._on_key_press)
        self.mouse_listener = mouse.Listener(
            on_click=self._on_mouse_click,
            # on_move deliberately omitted — kills idle detection
        )
        self.kb_listener.start()
        self.mouse_listener.start()

    def _on_key_press(self, key):
        with self._lock:
            self.kb_count += 1

    def _on_mouse_click(self, x, y, button, pressed):
        if pressed:
            with self._lock:
                self.mouse_count += 1

    def get_idle_seconds(self) -> float:
        """True hardware idle time from the OS kernel."""
        return _get_win32_idle_seconds()

    def get_and_reset_counts(self):
        """Return (keystrokes, clicks) accumulated since last call and reset."""
        with self._lock:
            counts = (self.kb_count, self.mouse_count)
            self.kb_count    = 0
            self.mouse_count = 0
        return counts

    def stop(self):
        """Cleanly stop pynput listeners."""
        self.kb_listener.stop()
        self.mouse_listener.stop()


# ===============================
# SINGLETONS
# ===============================
input_tracker = InputCounter()
sleep_manager  = SleepManager()
media_monitor  = MediaSessionMonitor()


# ===============================
# GLOBAL SESSION TRACKER
# ===============================
# Used by API to show "Live Session" duration on frontend
_current_session_start_mono: float | None = None

def get_current_session_duration() -> float:
    """Returns the seconds elapsed in the current unbroken window session."""
    if _current_session_start_mono is None:
        return 0.0
    return time.monotonic() - _current_session_start_mono


# ===============================
# HELPERS
# ===============================

# Known long-form video domains where we should be more lenient if SMTC fails.
# These sites often don't put a ▶ in the title or the browser doesn't report SMTC correctly.
LONG_FORM_STREAMING_DOMAINS = {
    "hotstar.com", "hotstar.in", "netflix.com", "primevideo.com", 
    "disneyplus.com", "hbo.com", "crunchyroll.com"
}

def is_media_active(info: dict) -> bool:
    """
    Returns True ONLY when media is genuinely playing right now,
    meaning idle time should NOT be counted.
    """
    if not info:
        return False

    # --- 1. Primary: SMTC (The gold standard) ---
    if media_monitor.is_available:
        if media_monitor.is_app_playing(info["app_name"]):
            return True

    # --- 2. Fullscreen Heuristic ---
    # People rarely sit in fullscreen without watching/doing something important.
    # If the app is in the 'Entertainment' category or 'Gaming' and is fullscreen,
    # we treat it as active regardless of input.
    if info.get("is_fullscreen", False):
        from src.config.category_manager import get_category
        main_cat, _ = get_category(info["app_name"], info.get("url"))
        if main_cat in ["entertainment", "communication"]: # Communication covers discord/zoom calls
            return True

    # --- 3. URL & Title Keywords (Fallback) ---
    title = info["title"].lower()
    url = info.get("url", "").lower()
    
    # Symbols and Keywords in Title
    media_markers = ["▶", "playing", "watching", "listening", "episode", "season", "movie"]
    if any(marker in title for marker in media_markers):
        return True

    # Streaming Domain check
    if any(domain in url for domain in LONG_FORM_STREAMING_DOMAINS):
        return True

    # URL keywords for video pages
    url_video_keywords = ["/watch", "/video", "/stream", "/movie", "/tv-show", "netflix.com/title"]
    if any(kw in url for kw in url_video_keywords):
        return True

    return False


def is_window_fullscreen(hwnd) -> bool:
    """
    Checks if a window is in fullscreen mode by comparing its 
    dimensions to the primary monitor resolution.
    """
    try:
        from win32api import GetSystemMetrics
        rect = win32gui.GetWindowRect(hwnd)
        w = rect[2] - rect[0]
        h = rect[3] - rect[1]
        sw = GetSystemMetrics(0)
        sh = GetSystemMetrics(1)
        # Covers both exact match and 'borderless' which can be slightly larger
        return w >= sw and h >= sh
    except Exception:
        return False

def get_active_window_info() -> dict | None:
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None
        title = win32gui.GetWindowText(hwnd)
        if not title:
            return None

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        app_name, exe_path = process_cache.get_info(pid)
        
        if not app_name:
            return None

        browser_tracking = settings_cache.get("browser_tracking", "true") in ("true", "1")

        url = "N/A"

        if browser_tracking:
            try:
                # Fast path: read cached URL from background resolver (never blocks)
                detected = url_resolver.get_cached_url(hwnd, app_name)
                if detected:
                    url = detected
            except Exception:
                pass

        return {
            "app_name": app_name, 
            "pid": pid, 
            "title": title.strip(), 
            "url": url, 
            "exe_path": exe_path,
            "is_fullscreen": is_window_fullscreen(hwnd)
        }
    except Exception:
        return None


# ===============================
# SESSION CHANGE DETECTION
# ===============================

# How many consecutive ticks a new URL/title must be stable before we
# treat it as a real tab switch. Prevents micro-sessions when typing
# in the address bar cycles through partial URLs each keystroke.
TAB_SWITCH_DEBOUNCE_TICKS = 3


def session_key(info: dict) -> tuple:
    """
    Unique identity of a window/tab session.
    Priority:  URL (most specific)  >  title  >  app+pid fallback.

    Using title as fallback means tab switches are always caught even
    when get_browser_url() fails or returns N/A.
    """
    url = info.get("url", "N/A")
    if url and url != "N/A":
        # URL is the most precise identifier for browser tabs
        return (info["app_name"], info["pid"], "url", url)
    # Fall back to window title — changes on every tab switch in all browsers
    return (info["app_name"], info["pid"], "title", info["title"])


# ===============================
# SESSION STATE
# ===============================
class SessionState:
    """
    Encapsulates all mutable state for the currently-active window session.

    Idle accounting works like this:
    - When the user goes idle (idle_seconds > IDLE_THRESHOLD), we record
      idle_start_time = time.monotonic() - idle_seconds  (i.e. when idle began).
    - While idle, each loop we extend idle_wall_seconds to cover the gap.
    - When the user returns from idle, we finalize the idle block and reset.
    - On flush, active_seconds = wall_seconds - idle_wall_seconds.

    Tab-switch detection:
    - A pending_key counter debounces rapid URL/title changes (e.g. typing
      in the address bar) so only stable tab switches create new sessions.
    """
    def __init__(self, info: dict):
        self.info            = info
        self.key             = session_key(info)
        self.wall_start      = time.monotonic()
        self.idle_wall_secs  = 0.0
        self._idle_block_start: float | None = None
        # Debounce state: track a candidate new session before committing
        self._pending_key:   tuple | None = None
        self._pending_ticks: int          = 0

    def tick_idle(self, currently_idle: bool, idle_seconds_from_input: float):
        """
        Call once per loop.  currently_idle = True when user is idle right now.
        idle_seconds_from_input = input_tracker.get_idle_seconds()
        """
        if currently_idle:
            if self._idle_block_start is None:
                # Idle just started; back-date the start by how long idle_seconds says
                self._idle_block_start = time.monotonic() - idle_seconds_from_input
                # But never set it before the session wall_start
                if self._idle_block_start < self.wall_start:
                    self._idle_block_start = self.wall_start
        else:
            if self._idle_block_start is not None:
                # User just became active again — finalize this idle block
                idle_block = time.monotonic() - self._idle_block_start
                self.idle_wall_secs += max(0.0, idle_block)
                self._idle_block_start = None

    def check_tab_switch(self, info: dict) -> bool:
        """
        Returns True when a stable tab/window switch has been confirmed.

        A new session key must be seen for TAB_SWITCH_DEBOUNCE_TICKS
        consecutive ticks before we treat it as a real switch.  This
        prevents micro-sessions from address-bar typing or browser
        internal navigations that settle within 1-2 ticks.

        Also updates self.info with the latest title/url so that
        within-session metadata (title updates on the same URL) stay fresh.
        """
        new_key = session_key(info)

        if new_key == self.key:
            # Still on the same session — reset any pending switch and
            # refresh metadata in case the title updated on the same URL.
            self._pending_key   = None
            self._pending_ticks = 0
            self.info = info          # keep title/url fresh
            return False

        # Different key detected — start or continue debounce
        if new_key == self._pending_key:
            self._pending_ticks += 1
        else:
            # New candidate key — restart debounce counter
            self._pending_key   = new_key
            self._pending_ticks = 1

        if self._pending_ticks >= TAB_SWITCH_DEBOUNCE_TICKS:
            return True   # confirmed stable switch

        return False   # still debouncing

    def finalize(self) -> tuple[float, float]:
        """
        Returns (active_seconds, idle_seconds) for the whole session.
        Closes any open idle block at the current moment.
        """
        now = time.monotonic()
        extra_idle = (now - self._idle_block_start) if self._idle_block_start is not None else 0.0
        total_idle   = self.idle_wall_secs + max(0.0, extra_idle)
        total_wall   = now - self.wall_start
        active       = max(0.0, total_wall - total_idle)
        return active, total_idle


# ===============================
# SESSION FLUSH
# ===============================
from src.api.auth_routes import _app_controller

def flush_session(session: SessionState, cursor) -> bool:
    active_secs, idle_secs = session.finalize()

    if active_secs <= 0 and idle_secs <= 0:
        return False

    keys, clicks = input_tracker.get_and_reset_counts()
    timestamp    = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    info         = session.info

    user_id = None
    try:
        from src.api.auth_routes import _app_controller
        if _app_controller and _app_controller.auth_manager:
            user_id = _app_controller.auth_manager.active_user_id
    except Exception:
        pass

    try:
        cursor.execute("""
            INSERT INTO activity_logs
                (timestamp, app_name, exe_path, pid, window_title, url,
                 active_seconds, idle_seconds, keystrokes, clicks, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            timestamp,
            info["app_name"], info.get("exe_path"), info["pid"], info["title"], info["url"],
            int(active_secs), int(idle_secs),
            int(keys), int(clicks), user_id
        ))

        update_daily_stats(cursor, info["app_name"], info["url"], active_secs, idle_secs, keys, clicks, info.get("exe_path"), user_id)
        # Throttled call for wellbeing calculation moved to main loop to save memory/CPU
        return True

    except Exception as e:
        try:
            cursor.connection.rollback()
        except Exception:
            pass
        print(f"[Logger] DB flush error: {e}")
        return False


# ===============================
# MAIN LOGGER LOOP
# ===============================
def start_logging():
    # Start background URL resolver so get_active_window_info() never blocks
    url_resolver.start()

    session: SessionState | None = None
    conn   = get_connection()
    cursor = conn.cursor()

    today = datetime.datetime.now().date()
    current_date = today
    last_loop_mono = time.monotonic()
    last_commit_mono = time.monotonic() # Track for batching
    
    # Efficiency counters
    gc_throttle_ticks = 0

    # Eye-Care state
    eyecare_active_seconds = 0.0
    last_eyecare_notify = 0.0
    
    # URL Blocker state
    last_url_block_time = 0.0
    
    # AFK state
    notified_afk = False

    def reset_session(new_info: dict | None):
        nonlocal session
        global _current_session_start_mono
        session = SessionState(new_info) if new_info else None
        _current_session_start_mono = session.wall_start if session else None
        input_tracker.get_and_reset_counts()  # discard stale counts

    try:
        while not shutdown_event.is_set():
            # ---- sleep guard ----
            if sleep_manager.is_sleeping:
                last_loop_mono = time.monotonic()
                time.sleep(POLL_INTERVAL)
                continue

            now_mono = time.monotonic()
            delta    = now_mono - last_loop_mono
            last_loop_mono = now_mono

            # ---- resume / large-gap guard ----
            if delta > SLEEP_DELTA_THRESHOLD:
                if session:
                    flush_session(session, cursor)
                    conn.commit()
                reset_session(None)
                time.sleep(POLL_INTERVAL)
                continue

            # ---- midnight rollover ----
            if today != current_date:
                if session:
                    flush_session(session, cursor)
                conn.commit()
                last_commit_mono = time.monotonic()
                current_date = today
                reset_session(None)

            # ---- get current window ----
            info = get_active_window_info()

            # ---- determine idle state ----
            idle_detection_enabled = settings_cache.get("idle_detection", "true") in ("true", "1")
            idle_secs = input_tracker.get_idle_seconds() if idle_detection_enabled else 0
            media_playing = is_media_active(info)
            
            # User is idle if: there's a window, no input for threshold, and no media
            currently_idle = (
                idle_detection_enabled
                and info is not None
                and idle_secs > IDLE_THRESHOLD
                and not media_playing
            )
            
            # ---- Telegram AFK & Security Alerts ----
            telegram_afk_alerts_enabled = settings_cache.get("telegram_afk_alerts_enabled", "true") in ("true", "1")
            
            if telegram_afk_alerts_enabled:
                try:
                    afk_threshold_mins = int(settings_cache.get("telegram_afk_alert_threshold", "15"))
                except ValueError:
                    afk_threshold_mins = 15
                
                afk_threshold_secs = afk_threshold_mins * 60

                if currently_idle and idle_secs > afk_threshold_secs and afk_threshold_secs > 0:
                    if not notified_afk:
                        notified_afk = True
                        auto_lock = settings_cache.get("telegram_auto_lock_on_idle", "false") in ("true", "1")
                        
                        try:
                            from src.api.auth_routes import _app_controller
                            if _app_controller and _app_controller.telegram_service and _app_controller.telegram_service.api:
                                msg = f"⚠️ PC has been unattended for {afk_threshold_mins} minutes."
                                keyboard = None
                                if auto_lock:
                                    msg = f"⚠️ PC locked due to {afk_threshold_mins} minutes of inactivity."
                                    from src.core.system_actions import lock_system
                                    lock_system()
                                else:
                                    keyboard = {"inline_keyboard": [[{"text": "🔒 Lock Now", "callback_data": "cb_lock"}]]}
                                _app_controller.telegram_service.api.send_message(msg, reply_markup=keyboard)
                        except Exception as e:
                            print(f"[AFK] Telegram alert failed: {e}")
                
                # Check for wake up
                if not currently_idle and notified_afk and idle_secs < 5:
                    notified_afk = False
                    try:
                        from src.api.auth_routes import _app_controller
                        if _app_controller and _app_controller.telegram_service and _app_controller.telegram_service.api:
                            _app_controller.telegram_service.api.send_message("🚨 PC woke up! Activity detected.")
                            
                            webcam_allowed = settings_cache.get("telegram_webcam_allowed", "true") in ("true", "1")
                            if webcam_allowed:
                                from src.core.telegram.webcam import capture_webcam
                                path = capture_webcam()
                                if path:
                                    _app_controller.telegram_service.api.send_photo(path, "Webcam Snapshot on Wake")
                                    import os
                                    os.remove(path)
                    except Exception as e:
                        print(f"[AFK] Telegram wakeup alert failed: {e}")

            # ---- Eye-Care Rule (20-20-20) ----
            eyecare_enabled = settings_cache.get("notifications_enable_eyecare_events", "false") in ("true", "1")
            if eyecare_enabled:
                is_eye_break = (idle_secs >= 20 and not media_playing) or (info is None) or sleep_manager.is_sleeping
                if is_eye_break:
                    eyecare_active_seconds = 0.0
                else:
                    eyecare_active_seconds += delta

                if eyecare_active_seconds >= 1200 and (now_mono - last_eyecare_notify > 1200):
                    try:
                        from src.core.desktop_notifications import desktop_notifier, DesktopNotifier
                        desktop_notifier.notify(
                            title="Blink Time!",
                            message="Time to give those peepers a break! Look at something 20 feet away for 20 seconds. Your eyes will thank you!",
                            event_type=DesktopNotifier.EVENT_EYECARE,
                            cooldown_seconds=1200,
                            event_key="eye_care_20_20_20"
                        )
                    except Exception as e:
                        print(f"[EyeCare] Failed to send notification: {e}")
                    last_eyecare_notify = now_mono

            # ---- Focus Mode / Pomodoro Enforcement ----
            try:
                from src.core.focus_manager import focus_manager
                if focus_manager.is_active() and info is not None:
                    app_name = info.get("app_name", "")
                    from src.config.category_manager import get_category
                    main_cat, _ = get_category(app_name, None, info.get("exe_path"))
                    if main_cat == "unproductive":
                        # hwnd is NOT in the info dict — read it directly from win32
                        import win32gui as _w32gui
                        hwnd = _w32gui.GetForegroundWindow()
                        strict_mode = settings_cache.get("pomodoro_strict_mode", "false") in ("true", "1")
                        if strict_mode:
                            # Option A: Kill the process entirely
                            import psutil
                            pid = info.get("pid")
                            if pid:
                                try:
                                    psutil.Process(pid).kill()
                                except Exception:
                                    pass
                        else:
                            # Option B (default): Force-minimise the window
                            if hwnd:
                                import win32con as _w32con
                                _w32gui.ShowWindow(hwnd, _w32con.SW_MINIMIZE)

                        # Notify user (at most once every 30 s per unique window)
                        if hwnd and focus_manager.should_warn(hwnd):
                            from src.core.desktop_notifications import desktop_notifier, DesktopNotifier
                            status = focus_manager.get_status()
                            mins_left = max(1, status.get("remaining_seconds", 0) // 60)
                            action = "closed" if strict_mode else "minimised"
                            desktop_notifier.notify(
                                title="🍅 Focus Mode Active",
                                message=(
                                    f"{app_name.replace('.exe','')} was {action}. "
                                    f"{mins_left} minute(s) remaining in your session."
                                ),
                                event_key=f"focus-block:{hwnd}",
                                cooldown_seconds=30,
                                event_type=DesktopNotifier.EVENT_GENERAL,
                                priority="critical",
                            )
            except Exception as _fm_err:
                print(f"[FocusMode] Enforcement error: {_fm_err}")

            # ---- General URL Blocking (Soft-Block via Ctrl+W) ----
            try:
                from src.services.blocking_service import BlockingService
                blocked_set = BlockingService().blocked_apps
                active_url = info.get("url") if info else None
                if active_url and active_url != "N/A" and blocked_set:
                    # check if the domain or subdomain matches anything in blocked_set
                    # we can use the same _url_matches_rule logic, or just a simple domain check
                    from src.config.category_manager import _url_matches_rule
                    is_url_blocked = False
                    matched_rule = None
                    for b_app in blocked_set:
                        # b_app could be an app name (chrome.exe) or a URL (youtube.com)
                        if "." in b_app and not b_app.endswith(".exe"):
                            if _url_matches_rule(active_url.lower(), b_app.lower()):
                                is_url_blocked = True
                                matched_rule = b_app
                                break
                    
                    if is_url_blocked:
                        # Prevent spamming Ctrl+W if the browser is slow to close the tab
                        if now_mono - last_url_block_time > 3.0:
                            last_url_block_time = now_mono
                            print(f"[URL Blocker] Blocking {active_url} (matched {matched_rule}) by sending Ctrl+W")
                            
                            # Use pynput to fire Ctrl+W
                            with _kb_controller.pressed(Key.ctrl):
                                _kb_controller.press('w')
                                _kb_controller.release('w')
                            
                            # Show a quick notification
                            from src.core.desktop_notifications import desktop_notifier, DesktopNotifier

                        desktop_notifier.notify(
                            title="Website Blocked",
                            message=f"{matched_rule} is currently blocked by your limits.",
                            event_key=f"url-block:{matched_rule}",
                            cooldown_seconds=10,
                            event_type=DesktopNotifier.EVENT_GENERAL,
                            priority="high",
                        )
            except Exception as _url_err:
                print(f"[URL Blocker] Error: {_url_err}")

            from src.config.ignored_apps_manager import is_ignored



            if info is None:
                # No foreground window (lock screen, UAC prompt, etc.)
                if session:
                    flush_session(session, cursor)
                    conn.commit()
                reset_session(None)

            elif is_ignored(info.get("app_name")):
                # App is in the ignored list — treat as "no window" to skip tracking
                if session:
                    flush_session(session, cursor)
                    conn.commit()
                reset_session(None)

            elif session is None:
                # First window seen (that isn't ignored) — start tracking
                reset_session(info)

            elif session.check_tab_switch(info):
                # Stable tab/window switch confirmed after debounce —
                # flush the completed session and start a new one.
                flush_session(session, cursor)
                # Note: No immediate conn.commit() here anymore -> Batching
                reset_session(info)

            else:
                # Same session — update idle accounting
                session.tick_idle(currently_idle, idle_secs)
                
                # Periodic flush to keep DB fresh even without window switch
                if time.monotonic() - session.wall_start > PERIODIC_FLUSH_INTERVAL:
                    flush_session(session, cursor)
                    reset_session(info)

            # ---- Database Batching Commit ----
            if time.monotonic() - last_commit_mono > BATCH_COMMIT_INTERVAL:
                conn.commit()
                last_commit_mono = time.monotonic()

            # ---- Periodic Efficiency Logic ----
            # 1. Periodic Garbage Collection (every ~1 hour)
            gc_throttle_ticks += 1
            if gc_throttle_ticks >= 3600:
                gc.collect()
                gc_throttle_ticks = 0

            # 2. Adaptive Polling: if we are deeply idle, sleep longer to save CPU/RAM cycles
            if currently_idle and idle_secs > 600: # 10 minutes of deep idle
                time.sleep(min(delta * 5, 5))   # Cap at 5s between checks
            else:
                time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("[Logger] Stopping...")
    except Exception as e:
        print(f"[Logger] Fatal error: {e}")
    finally:
        url_resolver.stop()
        if session:
            flush_session(session, cursor)
        try:
            conn.commit()
            conn.close()
        except Exception:
            pass
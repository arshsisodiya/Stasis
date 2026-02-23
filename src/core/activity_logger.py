import win32gui
import win32process
import psutil
import datetime
import time
import asyncio
from pynput import mouse, keyboard

from src.core.url_sniffer import get_browser_url
from src.analytics.daily_summary import update_daily_stats
from src.analytics.daily_wellbeing import calculate_daily_wellbeing
from src.database.database import get_connection
import win32con
import threading

APP_NAME = "Startup Notifier"
IDLE_THRESHOLD = 120        # seconds of no input = idle
SLEEP_DELTA_THRESHOLD = 15 # seconds gap = assume sleep/resume
POLL_INTERVAL = 1          # main loop interval in seconds

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
        return self._is_playing

    def is_app_playing(self, app_name: str) -> bool:
        """
        Returns True ONLY if the specific foreground app has an active
        SMTC playing session. app_name is the process name e.g. 'chrome.exe'.

        This prevents a background Spotify session from blocking idle
        detection when the foreground window is a paused YouTube tab.
        """
        name_lower = app_name.lower().replace(".exe", "")
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
        self._loop.run_until_complete(self._poll_forever())

    async def _poll_forever(self):
        import winsdk.windows.media.control as wmc

        manager = None
        while True:
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

                self._is_playing       = any_playing
                self._playing_sources  = playing_sources

            except Exception as e:
                # Manager can fail after sleep/resume; reset so we re-acquire next tick
                print(f"[MediaSessionMonitor] Poll error: {e}")
                manager = None
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


# ===============================
# SINGLETONS
# ===============================
input_tracker = InputCounter()
sleep_manager  = SleepManager()
media_monitor  = MediaSessionMonitor()


# ===============================
# HELPERS
# ===============================

def is_media_active(info: dict) -> bool:
    """
    Returns True ONLY when media is genuinely playing right now,
    meaning idle time should NOT be counted.

    Source of truth priority:
      1. SMTC (winsdk installed) — checks actual playback status reported
         by the OS for ALL apps: VLC, Spotify, Chrome/YouTube, Edge, etc.
         This is the only correct way — app name and tab title are irrelevant.
      2. Tab-title ▶ heuristic — ONLY used as a fallback when winsdk is not
         installed. The ▶ prefix is injected by YouTube/most players into the
         tab title when actually playing, and removed when paused.

    Deliberately removed:
      - NATIVE_MEDIA_APPS list (VLC open ≠ VLC playing)
      - Web media title keywords like "youtube", "netflix" (site open ≠ playing)
      These caused idle time to never be counted whenever these apps were open,
      which was the original bug.
    """
    if not info:
        return False

    # --- Primary: SMTC scoped to the foreground app (accurate) ---
    #
    # We check only the FOREGROUND app's SMTC session, not all sessions.
    # Using the global is_media_playing() would block idle on a paused
    # YouTube tab whenever Spotify (or any other app) is playing in the
    # background — that was the original bug.
    if media_monitor.is_available:
        return media_monitor.is_app_playing(info["app_name"])

    # --- Fallback: ▶ in tab title (winsdk not installed) ---
    # YouTube/most streaming sites prepend ▶ when playing, remove when paused.
    return info["title"].startswith("▶")




def get_active_window_info() -> dict | None:
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None
        title = win32gui.GetWindowText(hwnd)
        if not title:
            return None

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            app_name = psutil.Process(pid).name()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return None

        url = "N/A"
        if any(b in app_name.lower() for b in ["chrome", "msedge", "brave", "firefox", "opera"]):
            try:
                # Pass hwnd directly — avoids a redundant GetForegroundWindow call
                detected = get_browser_url(hwnd=hwnd)
                if detected:
                    url = detected
            except Exception:
                pass

        return {"app_name": app_name, "pid": pid, "title": title.strip(), "url": url}
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
def flush_session(session: SessionState, cursor) -> bool:
    active_secs, idle_secs = session.finalize()

    if active_secs <= 0 and idle_secs <= 0:
        return False

    keys, clicks = input_tracker.get_and_reset_counts()
    timestamp    = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    info         = session.info

    try:
        cursor.execute("""
            INSERT INTO activity_logs
                (timestamp, app_name, pid, window_title, url,
                 active_seconds, idle_seconds, keystrokes, clicks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            timestamp,
            info["app_name"], info["pid"], info["title"], info["url"],
            int(active_secs), int(idle_secs),
            int(keys), int(clicks)
        ))

        update_daily_stats(cursor, info["app_name"], info["url"], active_secs, idle_secs, keys, clicks)
        calculate_daily_wellbeing(cursor)
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
    session: SessionState | None = None
    conn   = get_connection()
    cursor = conn.cursor()

    current_date  = datetime.datetime.now().date()
    last_loop_mono = time.monotonic()

    def reset_session(new_info: dict | None):
        nonlocal session
        session = SessionState(new_info) if new_info else None
        input_tracker.get_and_reset_counts()  # discard stale counts

    try:
        while True:
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
            today = datetime.datetime.now().date()
            if today != current_date:
                if session:
                    flush_session(session, cursor)
                    conn.commit()
                current_date = today
                reset_session(None)

            # ---- get current window ----
            info = get_active_window_info()

            # ---- determine idle state ----
            idle_secs     = input_tracker.get_idle_seconds()
            media_playing = is_media_active(info)
            # User is idle if: there's a window, no input for threshold, and no media
            currently_idle = (
                info is not None
                and idle_secs > IDLE_THRESHOLD
                and not media_playing
            )

            if info is None:
                # No foreground window (lock screen, UAC prompt, etc.)
                if session:
                    flush_session(session, cursor)
                    conn.commit()
                reset_session(None)

            elif session is None:
                # First window seen — start tracking
                reset_session(info)

            elif session.check_tab_switch(info):
                # Stable tab/window switch confirmed after debounce —
                # flush the completed session and start a new one.
                # Use session.info (which has the last known good metadata)
                # not `info` which is the new tab.
                flush_session(session, cursor)
                conn.commit()
                reset_session(info)

            else:
                # Same session — update idle accounting
                session.tick_idle(currently_idle, idle_secs)

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("[Logger] Stopping...")
    except Exception as e:
        print(f"[Logger] Fatal error: {e}")
    finally:
        if session:
            flush_session(session, cursor)
        try:
            conn.commit()
            conn.close()
        except Exception:
            pass
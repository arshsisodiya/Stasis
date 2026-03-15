import logging
import os
import sys
import threading
import time
import html
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote

from src.config.settings_manager import SettingsManager
from src.core.startup import APP_AUMID


class DesktopNotifier:
    """Sends Windows toast notifications with lightweight dedupe/cooldown."""

    APP_ID = APP_AUMID
    EVENT_GENERAL = "general"
    EVENT_TEST = "test"
    EVENT_GOAL = "goal"
    EVENT_LIMIT = "limit"

    def __init__(self):
        self._lock = threading.Lock()
        self._last_sent_by_key = {}
        self._history = deque(maxlen=200)

    def is_enabled(self) -> bool:
        return SettingsManager.get_bool("notifications", False)

    def notify(
        self,
        title: str,
        message: str,
        event_key: str | None = None,
        cooldown_seconds: int = 300,
        event_type: str = EVENT_GENERAL,
        actions: list[tuple[str, str]] | None = None,
        launch_url: str | None = None,
    ) -> bool:
        if not self._can_send(event_type):
            return False

        now = time.time()
        if event_key:
            with self._lock:
                last = self._last_sent_by_key.get(event_key)
                if last and (now - last) < cooldown_seconds:
                    return False

        ok, method, reason = self._show_toast_with_details(
            title=title,
            message=message,
            actions=actions,
            launch_url=launch_url,
        )
        if ok and event_key:
            with self._lock:
                self._last_sent_by_key[event_key] = now
        if ok:
            self._record_event(
                title=title,
                message=message,
                method=method,
                source="runtime",
                event_type=event_type,
            )
        else:
            logging.getLogger(__name__).warning("Notification send failed (runtime): %s", reason)
        return ok

    def notify_test(self, title: str = "Stasis notification test", message: str = "Desktop notifications are working.") -> bool:
        ok, method, _ = self._show_toast_with_details(title=title, message=message)
        if ok:
            self._record_event(title=title, message=message, method=method, source="test", event_type=self.EVENT_TEST)
        return ok

    def notify_test_with_details(self, title: str, message: str, source: str = "test", actions: list[tuple[str, str]] | None = None) -> dict:
        if not self._can_send(self.EVENT_TEST):
            return {
                "ok": False,
                "methods": [],
                "method": "none",
                "reason": "test notifications are disabled by settings",
            }

        ok, method, reason = self._show_toast_with_details(title=title, message=message, actions=actions)
        if ok:
            self._record_event(title=title, message=message, method=method, source=source, event_type=self.EVENT_TEST)
        return {
            "ok": ok,
            "methods": [method] if ok else [],
            "method": method,
            "reason": reason,
        }

    def get_history(self, limit: int = 20) -> list[dict]:
        lim = max(1, min(int(limit), 100))
        with self._lock:
            return list(self._history)[-lim:][::-1]

    def _record_event(self, title: str, message: str, method: str, source: str, event_type: str):
        event = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "title": title,
            "message": message,
            "method": method,
            "source": source,
            "event_type": event_type,
        }
        with self._lock:
            self._history.append(event)

    def _can_send(self, event_type: str) -> bool:
        if not self.is_enabled():
            return False

        if event_type == self.EVENT_TEST and not SettingsManager.get_bool("notifications_enable_test_events", True):
            return False
        if event_type == self.EVENT_GOAL and not SettingsManager.get_bool("notifications_enable_goal_events", True):
            return False
        if event_type == self.EVENT_LIMIT and not SettingsManager.get_bool("notifications_enable_limit_events", True):
            return False

        if self._is_quiet_hours_now():
            return False

        if event_type == self.EVENT_LIMIT and self._is_limit_snoozed():
            return False

        return True

    @staticmethod
    def _is_quiet_hours_now() -> bool:
        if not SettingsManager.get_bool("notifications_quiet_hours_enabled", False):
            return False

        start = (SettingsManager.get("notifications_quiet_start") or "22:00").strip()
        end = (SettingsManager.get("notifications_quiet_end") or "07:00").strip()
        try:
            start_h, start_m = [int(x) for x in start.split(":", 1)]
            end_h, end_m = [int(x) for x in end.split(":", 1)]
            now = datetime.now().time()
            start_t = datetime.now().replace(hour=start_h, minute=start_m, second=0, microsecond=0).time()
            end_t = datetime.now().replace(hour=end_h, minute=end_m, second=0, microsecond=0).time()
            if start_t <= end_t:
                return start_t <= now < end_t
            return now >= start_t or now < end_t
        except Exception:
            return False

    @staticmethod
    def _is_limit_snoozed() -> bool:
        until = SettingsManager.get("notifications_limit_snooze_until")
        if not until:
            return False
        try:
            return datetime.now() < datetime.fromisoformat(until)
        except Exception:
            return False

    @staticmethod
    def snooze_limit_notifications(minutes: int = 60):
        until = datetime.now() + timedelta(minutes=max(1, int(minutes)))
        SettingsManager.set("notifications_limit_snooze_until", until.isoformat(timespec="seconds"))

    @staticmethod
    def _show_toast(title: str, message: str) -> bool:
        ok, _, _ = DesktopNotifier._show_toast_with_details(title=title, message=message)
        return ok

    @staticmethod
    def _show_toast_with_details(
        title: str,
        message: str,
        actions: list[tuple[str, str]] | None = None,
        launch_url: str | None = None,
    ) -> tuple[bool, str, str | None]:
        # Single backend by design: winotify (verified reliable in this app context).
        return DesktopNotifier._show_toast_winotify(title=title, message=message, actions=actions, launch_url=launch_url)

    @staticmethod
    def _show_toast_winotify(
        title: str,
        message: str,
        actions: list[tuple[str, str]] | None = None,
        launch_url: str | None = None,
    ) -> tuple[bool, str, str | None]:
        try:
            from winotify import Notification

            icon_path = DesktopNotifier._resolve_icon_path()
            icon_uri = Path(icon_path).as_uri() if icon_path else ""

            toast = Notification(
                app_id=DesktopNotifier.APP_ID,
                title=title,
                msg=message,
                icon=icon_uri,
                launch=DesktopNotifier._xml_attr_escape(launch_url or ""),
            )
            if actions:
                for label, link in actions[:5]:
                    toast.add_actions(
                        label=DesktopNotifier._xml_attr_escape(label),
                        launch=DesktopNotifier._xml_attr_escape(link),
                    )
            toast.show()
            return True, "winotify", None
        except Exception as exc:
            logging.getLogger(__name__).warning("winotify toast failed: %s", exc)
            return False, "none", f"winotify: {exc}"

    @staticmethod
    def _xml_attr_escape(value: str) -> str:
        # winotify ultimately renders XML; unescaped '&' in deep-link query strings can break toast rendering.
        return html.escape(value or "", quote=True)

    @staticmethod
    def _resolve_icon_path() -> str | None:
        candidates = []

        # Dev workspace paths (current repository layout).
        repo_root = Path(__file__).resolve().parents[2]
        candidates.extend([
            repo_root / "frontend" / "src-tauri" / "icons" / "Square44x44Logo.png",
            repo_root / "frontend" / "src-tauri" / "icons" / "Square71x71Logo.png",
            repo_root / "frontend" / "src-tauri" / "icons" / "icon.png",
            repo_root / "frontend" / "src-tauri" / "icons" / "128x128.png",
            repo_root / "frontend" / "src-tauri" / "icons" / "app-icon.png",
            repo_root / "frontend" / "src-tauri" / "icons" / "icon.ico",
        ])

        # Packaged/runtime fallback locations.
        exe_dir = Path(sys.executable).resolve().parent
        candidates.extend([
            exe_dir / "icons" / "icon.ico",
            exe_dir / "icons" / "icon.png",
        ])

        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            mdir = Path(meipass)
            candidates.extend([
                mdir / "icons" / "icon.ico",
                mdir / "icons" / "icon.png",
            ])

        for path in candidates:
            if path and path.exists() and path.is_file():
                return os.fspath(path)
        return None

    @staticmethod
    def build_action_url(action: str, **params) -> str:
        query = "&".join(f"{quote(str(k))}={quote(str(v))}" for k, v in params.items()) if params else ""
        base = f"stasis://notification?action={quote(action)}"
        if query:
            return f"{base}&{query}"
        return base


desktop_notifier = DesktopNotifier()

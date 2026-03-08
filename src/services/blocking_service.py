import threading
import time
import psutil
from datetime import datetime, timezone
from src.database.database import (
    get_all_limits,
    add_blocked_app,
    remove_blocked_app,
    get_today_usage,
    clear_expired_unblocks,
    get_connection,
    get_blocked_apps,
)
CHECK_INTERVAL = 5  # seconds


class BlockingService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(BlockingService, cls).__new__(cls)
                cls._instance.initialized = False
            return cls._instance

    def __init__(self):
        if self.initialized:
            return
        self.running = False
        self.thread = None
        self.initialized = True

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._run, daemon=True, name="BlockingServiceThread")
            self.thread.start()
            print("Blocking Service started")

    def stop(self):
        self.running = False

    def _run(self):
        while self.running:
            try:
                self.check_limits()
                self.enforce_blocks()
            except Exception as e:
                print("BlockingService Error:", e)

            time.sleep(CHECK_INTERVAL)


    def check_limits(self):
        try:
            clear_expired_unblocks()  # auto clean expired overrides
            limits = get_all_limits()
        except Exception as e:
            # Handle "database is locked" or other DB errors gracefully in the thread
            if "locked" in str(e).lower():
                return
            raise e

        if not limits:
            # Only attempt to clear if we actually have anything blocked
            try:
                blocked_apps = get_blocked_apps()
                if blocked_apps:
                    for app in blocked_apps:
                        remove_blocked_app(app)
            except Exception as e:
                if "locked" not in str(e).lower():
                    print(f"Error clearing blocks: {e}")
            return

        for limit in limits:
            app_name = limit[1]
            daily_limit = limit[2]
            is_enabled = limit[3]
            unblock_until = limit[4]

            if not is_enabled:
                remove_blocked_app(app_name)
                continue

            # Skip if temporary override active
            if unblock_until:
                try:
                    unblock_time = datetime.fromisoformat(unblock_until)
                    if datetime.now() < unblock_time:
                        remove_blocked_app(app_name)
                        continue
                except Exception as e:
                    print("Invalid unblock_until format:", e)
                    continue

            try:
                usage = get_today_usage(app_name)

                if usage >= daily_limit:
                    add_blocked_app(app_name)
                else:
                    remove_blocked_app(app_name)
            except Exception as e:
                if "locked" not in str(e).lower():
                    print(f"Error checking usage for {app_name}: {e}")

    # 🔹 Kill blocked apps continuously
    def enforce_blocks(self):
        try:
            blocked_apps = get_blocked_apps()
        except Exception as e:
            if "locked" in str(e).lower():
                return
            raise e

        if not blocked_apps:
            return

        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] in blocked_apps:
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

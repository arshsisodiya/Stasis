import threading
import time
import psutil
from datetime import datetime

from src.database.database import (
    get_all_limits,
    add_blocked_app,
    remove_blocked_app,
    get_today_usage,
    clear_expired_unblocks,
    get_blocked_apps,
)

LIMIT_CHECK_INTERVAL = 10
PROCESS_CHECK_INTERVAL = 0.5


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
        self.blocked_apps = set()

        self.limit_thread = None
        self.guard_thread = None

        self.initialized = True

    def start(self):

        if self.running:
            return

        self.running = True

        # Load initial blocked apps
        try:
            self.blocked_apps = set(get_blocked_apps())
        except:
            self.blocked_apps = set()

        self.limit_thread = threading.Thread(
            target=self.limit_monitor,
            daemon=True,
            name="LimitMonitor"
        )

        self.guard_thread = threading.Thread(
            target=self.process_guard,
            daemon=True,
            name="ProcessGuard"
        )

        self.limit_thread.start()
        self.guard_thread.start()

        print("Blocking Service started")

    def stop(self):
        self.running = False

    # ----------------------------
    # LIMIT MONITOR
    # ----------------------------
    def limit_monitor(self):

        while self.running:

            try:

                clear_expired_unblocks()

                limits = get_all_limits()

                new_blocked = set()

                for limit in limits:

                    app_name = limit[1]
                    daily_limit = limit[2]
                    is_enabled = limit[3]
                    unblock_until = limit[4]

                    if not is_enabled:
                        remove_blocked_app(app_name)
                        continue

                    if unblock_until:
                        try:
                            unblock_time = datetime.fromisoformat(unblock_until)

                            if datetime.now() < unblock_time:
                                remove_blocked_app(app_name)
                                continue

                        except:
                            pass

                    usage = get_today_usage(app_name)

                    if usage >= daily_limit:
                        add_blocked_app(app_name)
                        new_blocked.add(app_name)
                    else:
                        remove_blocked_app(app_name)

                self.blocked_apps = new_blocked

            except Exception as e:
                print("LimitMonitor error:", e)

            time.sleep(LIMIT_CHECK_INTERVAL)

    # ----------------------------
    # PROCESS GUARD
    # ----------------------------
    def process_guard(self):

        while self.running:

            try:

                if not self.blocked_apps:
                    time.sleep(PROCESS_CHECK_INTERVAL)
                    continue

                for proc in psutil.process_iter(['name']):

                    try:

                        if proc.info['name'] in self.blocked_apps:
                            proc.kill()

                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

            except Exception as e:
                print("ProcessGuard error:", e)

            time.sleep(PROCESS_CHECK_INTERVAL)
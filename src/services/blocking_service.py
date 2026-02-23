import threading
import time
import psutil
from datetime import datetime
from src.database.database import (
    get_all_limits,
    add_blocked_app,
    get_today_usage,
    clear_expired_unblocks,
    get_connection,
    get_blocked_apps,
)
CHECK_INTERVAL = 5  # seconds


class BlockingService:
    def __init__(self):
        self.running = False
        self.thread = None

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._run, daemon=True)
            self.thread.start()

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
        clear_expired_unblocks()  # auto clean expired overrides

        limits = get_all_limits()

        for limit in limits:
            app_name = limit[1]
            daily_limit = limit[2]
            is_enabled = limit[3]
            unblock_until = limit[4]  # new column

            if not is_enabled:
                continue

            # Skip if temporary override active
            if unblock_until:
                try:
                    from datetime import timezone
                    try:
                        unblock_time = datetime.fromisoformat(unblock_until)
                        if datetime.now() < unblock_time:
                            continue
                    except Exception as e:
                        print("Invalid unblock_until format:", e)
                        continue
                except:
                    pass

            usage = get_today_usage(app_name)

            if usage >= daily_limit:
                add_blocked_app(app_name)

    # 🔹 Kill blocked apps continuously
    def enforce_blocks(self):
        blocked_apps = get_blocked_apps()

        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] in blocked_apps:
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

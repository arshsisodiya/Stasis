import psutil
import time
import threading

class ProcessCache:
    """
    Thread-safe cache for process metadata (name and exe path).
    Uses a composite key of (PID, create_time) to handle PID reuse.
    """
    def __init__(self, ttl=300, max_size=1000):
        self._cache = {}  # (pid, create_time) -> (name, exe, timestamp)
        self._ttl = ttl
        self._max_size = max_size
        self._lock = threading.Lock()

    def get_info(self, pid: int) -> tuple[str, str] | tuple[None, None]:
        """
        Retrieves (app_name, exe_path) from cache or queries the OS.
        Returns (None, None) if the process is inaccessible.
        """
        try:
            # We must fetch the process object to get the creation time (ID integrity)
            p = psutil.Process(pid)
            create_time = p.create_time()
            key = (pid, create_time)
            now = time.time()

            with self._lock:
                if key in self._cache:
                    name, exe, timestamp = self._cache[key]
                    if now - timestamp < self._ttl:
                        return name, exe
                
                # Not in cache or expired — fetch fresh data
                name = p.name()
                exe = p.exe()
                
                # Cleanup if cache is getting too large
                if len(self._cache) >= self._max_size:
                    self._cleanup(now)
                
                self._cache[key] = (name, exe, now)
                return name, exe

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return None, None
        except Exception:
            return None, None

    def _cleanup(self, now: float):
        """Removes expired entries from the cache."""
        expired = [k for k, v in self._cache.items() if now - v[2] > self._ttl]
        for k in expired:
            del self._cache[k]
        
        # If still too large, remove the oldest entries (FIFO-ish)
        if len(self._cache) >= self._max_size:
            sorted_keys = sorted(self._cache.keys(), key=lambda k: self._cache[k][2])
            for k in sorted_keys[:int(self._max_size * 0.2)]: # Remove oldest 20%
                del self._cache[k]

# Global singleton for the process cache
process_cache = ProcessCache()

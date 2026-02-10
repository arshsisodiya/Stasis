# system_status.py

import platform
import socket
import psutil
from datetime import datetime


def get_uptime():
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    delta = datetime.now() - boot_time
    hours, remainder = divmod(int(delta.total_seconds()), 3600)
    minutes, _ = divmod(remainder, 60)
    return f"{hours}h {minutes}m"


def get_status_text():
    hostname = socket.gethostname()
    os_name = platform.system()
    os_version = platform.version()

    cpu = psutil.cpu_percent(interval=1)
    ram = psutil.virtual_memory().percent
    uptime = get_uptime()

    return (
        f"🟢 <b>PC Status</b>\n"
        f"• Hostname: {hostname}\n"
        f"• OS: {os_name} {os_version}\n"
        f"• Uptime: {uptime}\n"
        f"• CPU Usage: {cpu}%\n"
        f"• RAM Usage: {ram}%\n"
        f"• Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )

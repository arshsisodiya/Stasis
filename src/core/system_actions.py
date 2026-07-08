# system_actions.py

import subprocess


def shutdown_system():
    subprocess.Popen(
        ["shutdown", "/s", "/t", "0"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW
    )


def restart_system():
    subprocess.Popen(
        ["shutdown", "/r", "/t", "0"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW
    )


def lock_system():
    subprocess.Popen(
        ["rundll32.exe", "user32.dll,LockWorkStation"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW
    )

# storage.py

import os

APP_NAME = "Stasis"

def get_base_dir():
    base = os.path.join(os.environ["LOCALAPPDATA"], APP_NAME)
    os.makedirs(base, exist_ok=True)
    return base

def get_logs_dir():
    path = os.path.join(get_base_dir(), "logs")
    os.makedirs(path, exist_ok=True)
    return path

def get_data_dir():
    path = os.path.join(get_base_dir(), "data")
    os.makedirs(path, exist_ok=True)
    return path

def get_config_path():
    return os.path.join(get_base_dir(), "config.json")

# src/config/crypto.py

import base64
import os
from cryptography.fernet import Fernet
from pathlib import Path


APP_NAME = "Stasis"


def _get_key_path() -> Path:
    base_dir = Path(os.getenv("LOCALAPPDATA", Path.home()))
    app_dir = base_dir / APP_NAME
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir / "secret.key"


def _load_or_create_key():
    key_path = _get_key_path()

    if key_path.exists():
        return key_path.read_bytes()

    key = Fernet.generate_key()
    key_path.write_bytes(key)
    return key


_fernet = Fernet(_load_or_create_key())


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode()
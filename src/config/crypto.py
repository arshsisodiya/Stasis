# src/config/crypto.py

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


def get_or_create_named_fernet(name: str) -> Fernet:
    """
    Load or create a named Fernet key file at:
        %LOCALAPPDATA%\Stasis\<name>.key

    Using named keys isolates encryption contexts so rotating one key
    (e.g. input_dynamics.key) never affects others (e.g. secret.key).
    """
    base_dir = Path(os.getenv("LOCALAPPDATA", Path.home()))
    key_path = base_dir / APP_NAME / f"{name}.key"
    key_path.parent.mkdir(parents=True, exist_ok=True)

    if key_path.exists():
        return Fernet(key_path.read_bytes())

    key = Fernet.generate_key()
    key_path.write_bytes(key)
    return Fernet(key)
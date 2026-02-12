import json
import win32crypt

# Windows constant (not exposed in some pywin32 builds)
CRYPTPROTECT_LOCAL_MACHINE = 0x4


def encrypt_data(data: dict) -> bytes:
    json_bytes = json.dumps(data).encode("utf-8")

    encrypted_blob = win32crypt.CryptProtectData(
        json_bytes,
        None,
        None,
        None,
        None,
        CRYPTPROTECT_LOCAL_MACHINE
    )

    return encrypted_blob


def decrypt_data(encrypted_blob: bytes) -> dict:
    decrypted_blob = win32crypt.CryptUnprotectData(
        encrypted_blob,
        None,
        None,
        None,
        CRYPTPROTECT_LOCAL_MACHINE
    )[1]

    return json.loads(decrypted_blob.decode("utf-8"))

# config_loader.py

import os
import json
import tkinter as tk
from tkinter import messagebox
from src.config.secure_config import encrypt_data, decrypt_data
from src.config.storage import get_config_path


# ===============================
# CONFIG CREATION
# ===============================

def create_config(bot_token, chat_id):
    config_path = get_config_path()

    config_data = {
        "ui_mode": "normal",
        "startup_delay": 15,
        "logging": {"level": "info"},
        "telegram": {
            "bot_token": bot_token,
            "chat_id": chat_id
        }
    }

    encrypted_blob = encrypt_data(config_data)

    with open(config_path, "wb") as f:
        f.write(encrypted_blob)

    return config_data


# ===============================
# LOAD CONFIG
# ===============================

def load_config():
    config_path = get_config_path()

    if os.path.exists(config_path):

        # Try encrypted first
        try:
            with open(config_path, "rb") as f:
                encrypted_blob = f.read()

            return decrypt_data(encrypted_blob)

        except Exception:
            pass

        # Try plain JSON fallback (rare case)
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)

            if "telegram" in config:
                return create_config(
                    config["telegram"]["bot_token"],
                    config["telegram"]["chat_id"]
                )

        except Exception:
            pass

        # Corrupted file
        try:
            os.remove(config_path)
        except Exception:
            pass

    # No config found → prompt user
    bot_token, chat_id = prompt_for_config()
    return create_config(bot_token, chat_id)


# ===============================
# UI SETUP PROMPT
# ===============================

def prompt_for_config():
    result = {}

    def toggle_password():
        if bot_entry.cget("show") == "*":
            bot_entry.config(show="")
            toggle_btn.config(text="Hide")
        else:
            bot_entry.config(show="*")
            toggle_btn.config(text="Show")

    def on_save():
        bot = bot_entry.get().strip()
        chat = chat_entry.get().strip()

        if not bot or not chat:
            messagebox.showerror("Error", "All fields are required.")
            return

        result["bot"] = bot
        result["chat"] = chat
        root.destroy()

    root = tk.Tk()
    root.title("Stasis Setup")
    root.geometry("440x260")
    root.resizable(False, False)
    root.configure(bg="#1e1e1e")

    tk.Label(
        root,
        text="Telegram Configuration",
        bg="#1e1e1e",
        fg="white",
        font=("Segoe UI", 14, "bold")
    ).pack(pady=(15, 10))

    tk.Label(root, text="Bot Token:", bg="#1e1e1e", fg="white").pack(anchor="w", padx=30)

    bot_frame = tk.Frame(root, bg="#1e1e1e")
    bot_frame.pack(padx=30, fill="x")

    bot_entry = tk.Entry(
        bot_frame,
        bg="#2d2d2d",
        fg="white",
        insertbackground="white",
        show="*"
    )
    bot_entry.pack(side="left", fill="x", expand=True)

    toggle_btn = tk.Button(
        bot_frame,
        text="Show",
        bg="#444",
        fg="white",
        width=6,
        command=toggle_password
    )
    toggle_btn.pack(side="right", padx=(5, 0))

    tk.Label(root, text="Chat ID:", bg="#1e1e1e", fg="white").pack(anchor="w", padx=30, pady=(15, 0))

    chat_entry = tk.Entry(
        root,
        bg="#2d2d2d",
        fg="white",
        insertbackground="white"
    )
    chat_entry.pack(padx=30, fill="x", pady=(0, 15))

    save_button = tk.Button(
        root,
        text="Save",
        bg="#4CAF50",
        fg="white",
        width=12,
        command=on_save
    )
    save_button.pack(pady=15)

    root.mainloop()

    if "bot" not in result:
        raise RuntimeError("Telegram configuration is required.")

    return result["bot"], result["chat"]
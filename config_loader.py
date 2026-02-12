import json
import os
import sys
import shutil
import requests
import tkinter as tk
from tkinter import messagebox

APP_NAME = "Startup Notifier"


def get_programdata_config_path():
    return os.path.join(
        os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
        APP_NAME,
        "config.json"
    )


def get_exe_directory_config_path():
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
    else:
        exe_dir = os.getcwd()

    return os.path.join(exe_dir, "config.json")


def ensure_directory(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def validate_telegram(bot_token, chat_id):
    try:
        r = requests.get(
            f"https://api.telegram.org/bot{bot_token}/getMe",
            timeout=10
        )
        if not r.ok:
            return False, "Invalid Bot Token"

        r2 = requests.get(
            f"https://api.telegram.org/bot{bot_token}/getChat",
            params={"chat_id": chat_id},
            timeout=10
        )
        if not r2.ok:
            return False, "Invalid Chat ID"

        return True, "OK"
    except Exception as e:
        return False, str(e)


def is_valid_config(config):
    try:
        bot = config["telegram"]["bot_token"]
        chat = config["telegram"]["chat_id"]
        valid, _ = validate_telegram(bot, chat)
        return valid
    except Exception:
        return False


def copy_config_to_programdata(source_path):
    dest_path = get_programdata_config_path()
    ensure_directory(dest_path)
    shutil.copy2(source_path, dest_path)
    return dest_path


def prompt_for_config():
    result = {}

    def toggle_password():
        if bot_entry.cget("show") == "*":
            bot_entry.config(show="")
            toggle_btn.config(text="Hide")
        else:
            bot_entry.config(show="*")
            toggle_btn.config(text="Show")

    def on_validate():
        bot = bot_entry.get().strip()
        chat = chat_entry.get().strip()

        if not bot or not chat:
            messagebox.showerror("Error", "All fields are required.")
            return

        status_label.config(text="Validating...", fg="#FFC107")
        root.update()

        valid, msg = validate_telegram(bot, chat)

        if valid:
            status_label.config(text="✔ Telegram validated", fg="#4CAF50")
            save_button.config(state="normal")
            result["bot"] = bot
            result["chat"] = chat
        else:
            status_label.config(text=f"✖ {msg}", fg="#F44336")
            save_button.config(state="disabled")

    def on_save():
        root.destroy()

    root = tk.Tk()
    root.title("Startup Notifier Setup")
    root.geometry("440x300")
    root.resizable(False, False)
    root.configure(bg="#1e1e1e")

    tk.Label(
        root,
        text="Telegram Configuration",
        bg="#1e1e1e",
        fg="white",
        font=("Segoe UI", 14, "bold")
    ).pack(pady=(15, 10))

    # Bot Token
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

    # Chat ID
    tk.Label(root, text="Chat ID:", bg="#1e1e1e", fg="white").pack(anchor="w", padx=30, pady=(15, 0))

    chat_entry = tk.Entry(
        root,
        bg="#2d2d2d",
        fg="white",
        insertbackground="white"
    )
    chat_entry.pack(padx=30, fill="x", pady=(0, 15))

    status_label = tk.Label(root, text="", bg="#1e1e1e", fg="white")
    status_label.pack()

    button_frame = tk.Frame(root, bg="#1e1e1e")
    button_frame.pack(pady=20)

    validate_button = tk.Button(
        button_frame,
        text="Validate",
        bg="#0078D7",
        fg="white",
        width=12,
        command=on_validate
    )
    validate_button.grid(row=0, column=0, padx=5)

    save_button = tk.Button(
        button_frame,
        text="Save",
        bg="#4CAF50",
        fg="white",
        width=12,
        state="disabled",
        command=on_save
    )
    save_button.grid(row=0, column=1, padx=5)

    root.mainloop()

    if "bot" not in result:
        raise RuntimeError("Telegram configuration is required.")

    return result["bot"], result["chat"]


def create_config(bot_token, chat_id):
    config_path = get_programdata_config_path()
    ensure_directory(config_path)

    config_data = {
        "ui_mode": "normal",
        "startup_delay": 15,
        "logging": {"level": "info"},
        "telegram": {
            "bot_token": bot_token,
            "chat_id": chat_id
        }
    }

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=4)

    return config_data


def load_config():
    programdata_path = get_programdata_config_path()

    # 1️⃣ If ProgramData config exists → use it
    if os.path.exists(programdata_path):
        with open(programdata_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # 2️⃣ If config exists beside EXE → validate & copy
    exe_config_path = get_exe_directory_config_path()

    if os.path.exists(exe_config_path):
        try:
            with open(exe_config_path, "r", encoding="utf-8") as f:
                config = json.load(f)

            if is_valid_config(config):
                copy_config_to_programdata(exe_config_path)
                return config
        except Exception:
            pass

    # 3️⃣ Otherwise prompt user
    bot_token, chat_id = prompt_for_config()
    return create_config(bot_token, chat_id)

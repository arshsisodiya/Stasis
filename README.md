<div align="center">
  <h1>🚀 Stasis</h1>
  <p><b>Digital Wellbeing & System Telemetry</b></p>
  <p><i>It started as a simple startup notifier app and has now evolved into a full Digital Wellbeing app with Telegram integration!</i></p>
</div>

---

**Stasis** is an advanced Windows background utility designed for active productivity tracking, system telemetry, and controlled remote interaction via a private Telegram Bot. It provides real-time boot notifications, detailed activity logging, and remote management—all accessible seamlessly through Telegram.

## 📸 Screenshots

*(We will add UI screenshots later)*
<div align="center">
  <img src="https://via.placeholder.com/800x450?text=UI+Screenshot+Placeholder" alt="UI Placeholder 1">
  <br><br>
  <img src="https://via.placeholder.com/800x450?text=Telegram+Integration+Placeholder" alt="UI Placeholder 2">
</div>

## ✨ Features

- **📱 Telegram-Based Remote Control:** Manage your PC from anywhere using simple Telegram commands.
- **📊 Advanced Activity Logging:** Track active applications, window titles, URLs visited, session durations, keystrokes, and mouse clicks.
- **🧠 Intelligent Idle Detection:** Automatically subtracts idle time (no input for 2 minutes) from usage metrics, ensuring your productivity stats are realistic.
- **🎬 Media Exception Handling:** Prevents video playback (YouTube, VLC, etc.) from being incorrectly classified as idle time.
- **📂 Global File System Monitor:** Monitors file creations, modifications, deletions, and renames across connected drives.
- **📥 Remote Log Retrieval:** Instantly trigger log dumps via Telegram (`/log`) to receive formatted CSV files of your activity directly to your phone.

## ⚙️ How It Works

Stasis is built to run reliably in the background while keeping a minimal footprint:

1. **Activity Monitoring:** Using minimal system hooks, Stasis observes which application currently has focus, alongside logging keystroke/mouse click intensity.
2. **Idle & Media States:** When no interaction is detected for a period, it transitions to "Idle Mode". If media is playing (such as YouTube), it actively overrides the idle state so your data reflects true ongoing usage.
3. **Local Architecture:** All gathered data is organized locally into CSV files and databases. Your tracked files never leave your machine unless specifically requested.
4. **Secure Telegram Long-Polling:** A secure pipeline connects Stasis to the Telegram API. Your configured Telegram Bot acts as your private interface to issue commands and request data payloads anywhere in the world.

## 💻 Developer Setup & Build Instructions

Want to dig into the code or build Stasis locally? Follow these simple steps.

### Prerequisites
To build the full project (which includes the Tauri frontend and the Python backend), you need the following tools installed and added to your system PATH:
- **Python 3.8+** (with `pyinstaller` installed via `pip install pyinstaller`)
- **Node.js & npm**
- **Rust** (stable, via rustup)
- **NSIS**
- **Git**
- *(Optional)* **UPX** for backend executable compression

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/arshsisodiya/Stasis.git
cd Stasis
```

### 2️⃣ Configuration
Before running, you must define your credentials. Rename the provided configuration template:
```bash
mv config.template.json config.json  # Or rename manually
```
Open `config.json` and insert your **Telegram Bot Token** and your **Chat ID**.

### 🔨 Building the Full Application (Recommended)
Stasis features a modern **React/Vite Tauri frontend** seamlessly bundled with its **Python background telemetry engine**. We provide an automated PowerShell script to handle compiling both and generating a cohesive NSIS installer.

From the project root, open PowerShell and run:
```powershell
.\build.ps1
```

#### What `build.ps1` Does:
1. Evaluates your system to ensure all prerequisites are met.
2. Compiles the Python backend into a standalone `.exe` via `PyInstaller`.
3. Moves the backend executable to the Tauri binaries folder (`frontend/src-tauri/bin/`).
4. Runs `npm install` inside the `frontend/` directory.
5. Executes `npm run tauri:build` to build the Vite interface and Rust shell, outputting the final user installers.

> **Output Location:** Once finished, your packaged `.exe` installers will be sitting in `frontend\src-tauri\target\release\bundle\`.

### 🛠 Manual Developer Setup (Testing the Python Backend Only)
If you just want to run the python telemetry instance without the frontend UI:
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python src/main.py
```

---

## 🤖 Telegram Commands Reference

| Command       | Description                     | Confirmation Required |
| ------------- | ------------------------------- | --------------------- |
| `/ping`       | Check if system is online       | No                    |
| `/screenshot` | Capture and send current screen | No                    |
| `/camera`     | Capture webcam image            | No                    |
| `/video [s]`  | Record webcam video (def: 10s)  | No                    |
| `/lock`       | Lock Windows session            | No                    |
| `/shutdown`   | Shutdown PC                     | Yes                   |
| `/restart`    | Restart PC                      | Yes                   |
| `/log`        | Retrieve activity & file logs   | No                    |

---

## 📦 Download

Download the latest builds from the Releases section: 👉 [https://github.com/arshsisodiya/Stasis/releases](https://github.com/arshsisodiya/Stasis/releases)

---

## ⚠️ Ethical & Legal Notice

This project is developed strictly for **educational purposes, personal system monitoring, and controlled lab reference**. Do **NOT** deploy this software on systems you do not own or do not have explicit written authorization to monitor. Unauthorized surveillance may be illegal in your jurisdiction.

---

<div align="center">
  <b>Developed by Arsh</b><br>
  Made with ❤️ for automation, digital wellbeing, and peace of mind.<br>
</div>

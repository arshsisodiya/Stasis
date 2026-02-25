# Stasis 🚀

**Stasis** is a Windows background utility designed for system telemetry, activity logging, and controlled remote interaction via a private Telegram Bot.

It provides real-time boot notifications, remote system control, structured activity logging, and secure log retrieval — all accessible through Telegram.

---

## ⚠️ Ethical & Legal Notice

This project is developed strictly for:

* Educational purposes
* Personal system monitoring
* Cybersecurity research
* Controlled lab environments

Do **NOT** deploy this software on systems you do not own or do not have explicit written authorization to monitor.

Unauthorized surveillance or monitoring may be illegal in your jurisdiction.

You are solely responsible for how you use this software.

---

## 📦 Download

Download the latest builds from the Releases section:

👉 [https://github.com/arshsisodiya/Stasis/releases](https://github.com/arshsisodiya/Stasis/releases)

Available builds:

* **Portable (.exe)** – Standalone executable
* **Installer (.exe setup)** – Recommended for permanent installation

---

## 🆚 Portable vs Installer

### 🔹 Portable Version

* Single executable
* No installation required
* Manual startup configuration
* Suitable for testing or temporary use

### 🔹 Installer Version

* Installs into Program Files
* Automatically registers Windows startup
* Allows Telegram credentials entry during installation
* Clean uninstall via Control Panel
* Recommended for long-term deployment

---

# 🚀 Core Capabilities

## 📡 Telegram-Based Remote Control

| Command       | Action                          | Confirmation Required     |
| ------------- | ------------------------------- | ------------------------- |
| `/ping`       | Check if system is online       | No                        |
| `/screenshot` | Capture and send current screen | No                        |
| `/camera`     | Capture webcam image            | No                        |
| `/video`      | Record 10s webcam video         | No                        |
| `/video 30`   | Record custom-duration video    | No                        |
| `/lock`       | Lock Windows session            | No                        |
| `/shutdown`   | Shutdown PC                     | Yes (`/shutdown confirm`) |
| `/restart`    | Restart PC                      | Yes (`/restart confirm`)  |
| `/log`        | Retrieve activity & file logs   | No                        |

---

## 📊 Activity Logging & System Telemetry

Stasis includes an advanced structured logging engine that records system interaction data locally in CSV format.

---

## 🖥️ Application Activity Log

Tracks:

* Active application name
* Process ID (PID)
* Window title
* Visited URLs (supported browsers)
* Session duration
* Keystroke count
* Mouse click count
* Idle detection handling

### 💤 Intelligent Idle Detection

* If no keyboard or mouse input is detected for **2 minutes**, the system enters Idle Mode.
* Idle time:

  * Is not counted toward application usage
  * Is automatically subtracted from total duration
* Ensures realistic usage statistics.

### 🎬 Media Exception Handling

Idle detection is automatically disabled for media platforms such as:

* YouTube
* VLC Media Player
* Other supported media applications

This prevents video playback from being incorrectly classified as idle time.

---

### 📁 Activity Log CSV Format

| Timestamp | Application | PID | Window Title | URL | Duration | Keystrokes | Clicks |
| --------- | ----------- | --- | ------------ | --- | -------- | ---------- | ------ |

**Field Explanation:**

* **Timestamp** – Session start time
* **Application** – Executable name
* **PID** – Process ID
* **Window Title** – Active window
* **URL** – Browser URL (if detected)
* **Duration** – Active time (Idle excluded)
* **Keystrokes** – Total key presses
* **Clicks** – Mouse clicks

This provides deep insight into:

* Application usage duration
* Interaction intensity
* Browsing behavior
* True active vs idle time

---

## 📂 Global File System Monitor

Monitors file system events across connected drives.

### 📌 Tracked Events

* File Created
* File Modified
* File Deleted
* File Renamed

---

### 📁 File Monitor CSV Format

| Timestamp | Action | File Path |
| --------- | ------ | --------- |

**Field Explanation:**

* **Timestamp** – Time of event
* **Action** – Created / Modified / Deleted / Renamed
* **File Path** – Full file path

---

## 📥 Remote Log Retrieval

Using the Telegram command:

```
/log
```

You can retrieve:

* Activity logs (application usage)
* File monitoring logs

Logs are sent directly to your Telegram chat as CSV files for download and analysis.

This allows remote review without direct system access.

---

# ⚙️ Configuration

Stasis uses `config.json`.

If setting up manually:

Rename:

```
config.template.json → config.json
```

---

## 🔑 How to Get Telegram Bot Token

1. Open Telegram
2. Search **@BotFather**
3. Send:

```
/newbot
```

4. Follow instructions
5. Copy the generated Bot Token

Example:

```
123456789:AAExampleGeneratedToken
```

---

## 🆔 How to Get Chat ID

1. Start chat with your bot
2. Send any message
3. Open:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

4. Find:

```
"chat": {
  "id": 123456789
}
```

That is your Chat ID.

---

### Example config.json

```json
{
  "ui_mode": "normal",
  "startup_delay": 15,
  "logging": {
    "level": "info",
    "monitor_windows": true,
    "monitor_files": true
  },
  "telegram": {
    "bot_token": "YOUR_BOT_TOKEN",
    "chat_id": "YOUR_CHAT_ID"
  }
}
```

---

# 🛠 Developer Setup

## 📁 Project Structure

```
Stasis/
│
├── src/
│   └── main.py
│
├── assets/
├── config.template.json
├── requirements.txt
└── README.md
```

---

## 1️⃣ Clone Repository

```bash
git clone https://github.com/arshsisodiya/Stasis.git
cd Stasis
```

---

## 2️⃣ Create Virtual Environment

```bash
python -m venv venv
venv\Scripts\activate
```

---

## 3️⃣ Install Dependencies

If requirements.txt exists:

```bash
pip install -r requirements.txt
```

Otherwise:

```bash
pip install requests opencv-python pyautogui watchdog pyinstaller
```

---

## 4️⃣ Configure

Rename:

```
config.template.json → config.json
```

Insert Telegram credentials.

---

## 5️⃣ Run in Development

```bash
python src/main.py
```

---

# 🔨 Building Executables

## Option A — Single File (`--onefile`)

```bash
pyinstaller --onefile --noconsole --name Stasis --icon=assets/icon.ico src/main.py
```

Output:

```
dist/Stasis.exe
```

---

## Option B — One Directory (`--onedir`)

```bash
pyinstaller --onedir --noconsole --name Stasis --icon=assets/icon.ico src/main.py
```

Output:

```
dist/Stasis/
```

Use `--onedir` for:

* Faster startup time
* Easier debugging
* Reduced antivirus false positives
* Cleaner dependency layout

---

## Installer Build

Use your Inno Setup `.iss` script to generate installer package.

---

# 🔐 Security & Transparency Documentation

### Command Restrictions

* Only configured Chat ID is allowed.
* Critical commands require confirmation.
* No arbitrary shell execution.

### Credential Protection

* `config.json` must be added to `.gitignore`.
* Bot token is never stored remotely.
* No external server communication except Telegram API.

### Hardware Transparency

* Webcam LED activates during capture.
* Application is visible in Task Manager.
* No hidden persistence mechanisms.

### Logging Scope

* Window logger tracks titles only (not content).
* File monitor logs file events (not file contents).
* URL logging is browser-based and local.
* Logs are stored locally and retrievable via `/log`.

---

## 📄 License

MIT License

---

**Developed by Arsh**
Made with ❤️ for automation, security, and peace of mind.

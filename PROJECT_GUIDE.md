# 🎨 Stasis: Complete UI & Customization Guide

Welcome to the **Stasis Documentation**. This guide serves as a comprehensive manual for understanding, interacting with, and modifying the frontend User Interface (UI). It covers every major component, how the final user engages with the app, and how a developer can alter aesthetics, categories, data models, and styling.

---

## 📑 Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [End-User Guide: Using the Interface](#2-end-user-guide-using-the-interface)
3. [Breakdown of UI Components (Widgets)](#3-breakdown-of-ui-components-widgets)
4. [Settings & Feature Management](#4-settings--feature-management)
5. [Developer Guide: Customizing the UI](#5-developer-guide-customizing-the-ui)
6. [Data Flow & Telemetry Management](#6-data-flow--telemetry-management)

---

## 🏗 1. Architectural Overview

Stasis uses a dual-backend approach:
- **Python Telemetry Engine:** Runs silently in the background capturing active window focus, idle times, and mouse/keyboard intensity.
- **Tauri + React/Vite Frontend:** A high-performance, lightweight UI that compiles to a native desktop Windows window.

The frontend is built primarily as a Single Page Application (SPA), dynamically updating based on the latest `.json` dumps provided by the backend. It uses strict inline aesthetic rules paired with `index.css` for background gradients and custom scrollbars to maintain a highly polished, zero-external-dependency dark theme.

---

## 👨‍💻 2. End-User Guide: Using the Interface

For the end user installing Stasis, the interface is split into two primary views: **The Dashboard** and **The Settings Page**.

### The Dashboard
When you open Stasis, you land on the **Digital Wellbeing Dashboard**.
- **Real-Time Tracking:** The banner continuously displays the active application and live session duration.
- **Date Navigation:** A heatmap-style calendar row sits below the banner. Color intensities signify heavier device usage. Click any dot to travel back in time and view historical application data.
- **Today's Summary:** Donut charts and hourly activity bars visually split your focus for the day.
- **App List:** The detailed list breaks down exactly what you used, for how long, and assigns categories. Click on an application row to view granular tracking (like window titles or keystrokes during that application).

### ⚙️ Enabling/Disabling Tracking
All tracking configuration is handled natively from the **Settings Menu** (represented by the gear icon ⚙️ in the top right corner). 
- **Application Tracking:** Enabled by default. Tracks the active window titles and maps EXEs to categories.
- **File Monitoring:** Disabled by default. Can be enabled to track file creation, modification, and deletion events system-wide.
- **Telegram Bot Control:** Allows you to sync the desktop telemetry with your phone, requesting screenshots or activity overviews directly from the Telegram app.

---

## 🧩 3. Breakdown of UI Components (Widgets)

If you are inspecting or modifying the layout, refer to `frontend/src/WellbeingDashboard.jsx`.

| Component Name | Description | Customization Point |
| -------------- | ----------- | ------------------- |
| **`TopNav`** & **`HeroBanner`** | The header containing the name, Telegram connection status dot, Settings cog, and the live tracking count-up timer. | Search for `HeroBanner()` or `TopNav()` |
| **`DateStrip`** | A heatmap-style horizontal list of dates. Colors shift from dark gray to bright green/yellow based on relative hours tracked that day. | Search `DateStrip()` |
| **`DonutChart`** | Circular breakdown of category times (`productive`, `entertainment`, etc). Hovering a category in the legend highlights the chart slice. | Search `DonutChart()` |
| **`HourlyBar`** | A bar chart dynamically rendering `0h-23h`. Highlights the "peak hour" of the day with a solid glow. | Search `HourlyBar()` |
| **`AppList`** | Maps tracked EXEs (e.g. `chrome.exe`) to readable icons, categorizes them, and provides an expandable "drawer" of granular Window Titles. | Search `AppItemRow()` |

---

## 🛠 4. Settings & Feature Management

The **Settings Page** (`frontend/src/SettingsPage.jsx`) handles all feature toggles and backend communication flags.

### Modifying Toggles (For Users)
In the Settings UI, you'll find categorized cards:
1. **General Configurations:** Modify `startup_delay` or toggle specific data monitors (like Window Tracking vs File Tracking).
2. **Telegram Live Remote:** Insert your `Bot Token` and `Chat ID` to bind the client to your phone. Includes dynamic "Test Conenction" and "Start/Stop Service" buttons.
3. **Security Danger Zone:** Options to *Clear All Activity Data*, *Clear All File Logs*, or *Factory Reset* the entire app. This involves a confirmation word to prevent accidental deletion.

---

## 🎨 5. Developer Guide: Customizing the UI

Want to modify the colors, categories, or layout of Stasis? The code is incredibly modular.

### A. Changing the Global Background & Fonts
Open `frontend/src/index.css`.
- The default font is **DM Sans**. Change the `@import url()` to swap to Inter, Roboto, etc.
- The background uses a dual radial gradient. Locate `body { background: radial-gradient(...) }` to inject custom hex codes.

### B. Modifying Theme Accent Colors
Open `frontend/src/WellbeingDashboard.jsx` and locate the `COLORS` object near line 10.
```javascript
const COLORS = {
  bg: "#080b14",          // App background
  surface: "#111424",     // Card backgrounds
  border: "rgba(255,255,255,0.06)", // Card borders
  green: "#4ade80",       // Primary positive accent
  blue: "#3b82f6"         // Secondary accent
};
```
Modify these hex variables to immediately change the application's entire color palette.

### C. Adding or Modifying Application Categories
To alter how EXEs are grouped (e.g., separating "Design" out of "Productive"):
1. In `WellbeingDashboard.jsx`, locate the `CATEGORY_THEMES` object. 
2. Add your new category here, mapping a primary color, a glow color, and a CSS gradient.
3. Update `CATEGORY_CHIP_EMOJI` with the desired emoji.
4. Modify the backend python categorizer (`src/core/app_categorizer.py`) to actually yield your new string natively.

### D. Updating App Icons
We utilize high-fidelity browser API favicons. Locate the `KNOWN_APP_DOMAINS` object.
```javascript
"photoshop.exe": "adobe.com",
"figma.exe": "figma.com",
"yournewapp.exe": "domain.com",
```
Fallback emojis are defined in the `KNOWN_APP_EMOJIS` array right below it. This dictates what the UI shows when an executable isn't mapped to a global corporate domain.

---

## 💾 6. Data Flow & Telemetry Management

### How does the UI receive data?
Due to Tauri restrictions, we don't query a live SQL backend constantly right from the React thread. Instead, the backend exposes active `.json` endpoints on a local interface (or via direct Tauri commands mapping to the local filesystem). 

1. **`fetchSummary()`**: The React Dashboard polls the Python/Rust interface for a JSON tree summarizing all activity for `$SELECTED_DATE`.
2. **Background Processing**: If the user drops to idle (no mouse/keyboard inputs), the python engine flags the timestamp and dynamically subtracts that duration out. This ensures the React GUI never reports "12 hours of Figma" if you were away making coffee.
3. **Save Routines**: Changes hit in the `SettingsPage.jsx` trigger File I/O overwrites on the `config.json` payload, which the Python watchdog actively observes, adopting the new settings immediately without requiring an app reboot. 

---

## 🛠 7. In-Depth Settings Configuration (SettingsPage.jsx)

The `SettingsPage.jsx` file is the master configuration hub for the user. If you want to add or modify features, you will need to add them here. 

Currently, the user has access to the following toggles across three sections:

### 1. General Settings (`GeneralSection`)
- **Startup Delay (`startup_delay`)**: Number of seconds before the python process starts logging after boot. (Useful to not bog down PC launch speeds).
- **Log Level**: Selects how verbose the python backend logging should be (`debug`, `info`, `warning`, `error`).
- **Monitor Active Windows**: Toggles whether Stasis logs the title of the window the user is currently looking at. (Stored in `logging.monitor_windows`).
- **Monitor File System**: Toggles whether Stasis records file creations, deletions, and edits. (Stored in `logging.monitor_files`).

### 2. Telegram Settings (`TelegramSection`)
- **Bot Token**: Standard Telegram API Token.
- **Chat ID**: The unique ID of the user's private chat.
- **Service Status Toggle**: Starts or Stops the python async watcher for the Telegram bot, effectively turning off remote control without deleting credentials.
- **Test Connection**: Pings the Telegram server via the local backend to verify credentials before saving.

### 3. Security Settings (`SecuritySection`)
- **Clear Activity Data**: Purges the `activity_records` SQLite table via the local API. Wipes all charting data.
- **Clear File Data**: Purges `file_records` SQLite table.
- **Factory Reset**: A deeply destructive command needing the confirmation word `'RESET'` typed out. This deletes the local `stasis.db`, resets `config.json` to factory defaults, and kicks the user back to the initial setup screen.

> **Adding a new Setting**: To add a new setting (like a "Dark/Light Mode" toggle), you would add a new `SettingRow` component inside `GeneralSection` in `SettingsPage.jsx`, and map its `onToggle`/`onChange` handler to update the local `config.json` payload asynchronously.

---

## 🎨 8. Advanced UI Customization & Component Logic

### Animations & Keyframes (`index.css` & Styled Components)
Stasis relies entirely on vanilla CSS and inline React styles. All animations are defined either in `index.css` or inside large template strings in `.jsx` files.

- **`slide-down`**: Used for notifications and toasts.
- **`center-fade-in`**: Used across Modals, Modals backdrops, and the Donut Chart rendering.
- **Donut Chart Tooltips**: Managed inside `DonutChart()` using the `DONUT_CSS` const containing complex hover-scaling math.

### The Loading & Connection Screen (`LoadingScreen.jsx`)
When the app launches, Tauri bootstraps the HTML window instantly, but the React layer goes into `LoadingScreen.jsx`. 
1. It attempts to poll `http://127.0.0.1:48911/ping` every 1.5 seconds.
2. If it succeeds, it sets `ready = true` in `App.jsx`, sliding up the `WellbeingDashboard.jsx`.
3. If it fails continuously, it shows a "Backend Offline" state. 

*If you change the python port in `src/api/server.py`, you **must** update the hardcoded port in `LoadingScreen.jsx` and `SettingsPage.jsx`*.

## ⚙️ 9. Backend Architecture & Customization (Python)

The true heavy lifting of Stasis occurs in the Python backend. The backend manages the data ingestion, Telegram polling, background OS hooks, and database commits.

### Backend Structure (`src/`)
- **`main.py`**: The entry point. Initializes thread wrappers (`safe_activity_logger`, `safe_file_watchdog`, `safe_api_server`), single instance locks, the database, and the background updater.
- **`api/`**: Contains `api_server.py`, a lightweight Flask/Tornado server running on port `48911` that ferries local SQLite data to the Tauri Frontend.
- **`core/`**: 
  - `activity_logger.py`: Manages the Win32 hooks to detect window focus changes.
  - `app_categorizer.py`: The python logic that parses an `.exe` string and maps it to a category.
  - `file_monitor.py`: The background watchdog that continuously tracks file creation, movement, or deletion.
  - `idle_tracker.py`: Hooks into Windows API `GetLastInputInfo` to check if a user has gone AFK.
- **`database/`**: Contains `database.py`, using standard `sqlite3` to dump tracked rows locally into `stasis.db`.
- **`services/`**: Includes `telegram_bot.py` which uses secure long-polling to await remote Telegram commands.

### How to Modify Data Tracking Logic
If you want to track a new metric (e.g. CPU temperature):
1. **Gather**: Write a new script in `src/core/cpu_tracker.py` that yields the data.
2. **Commit**: Update `src/database/database.py` to create a `cpu_logs` table schema and write insert methods.
3. **Expose**: Update `src/api/routes.py` (or equivalent) to expose a `/api/cpu` endpoint.
4. **Consume**: Within the React frontend, add a `fetch` call pointing to that endpoint and render a chart.

### How to Add A New Telegram Command
If you want to add a telegram command (like `/sleep` to put the PC to sleep via phone):
1. Open `src/services/telegram_bot.py`.
2. Locate the message parsing block (`handle_message`).
3. Add a new `if text == '/sleep':` condition.
4. Define the execution logic (e.g. `os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")`).
5. Map any needed responses back using `self.send_message(chat_id, "PC is sleeping.")`.

---

<div align="center">
  <b>That's it!</b><br>
  You now have a complete understanding of the Stasis project architecture, configuration flow, and customization hooks across both the React frontend and Python backend.<br>
</div>

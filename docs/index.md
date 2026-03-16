# Stasis — Digital Wellbeing for Windows

<div class="hero-badge" markdown>
  ![Platform](https://img.shields.io/badge/platform-Windows-0078d7?style=flat-square&logo=windows)
  ![Python](https://img.shields.io/badge/python-3.11-yellow?style=flat-square&logo=python)
  ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
  ![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri)
</div>

**Stasis** is a privacy-first, fully local screen-time tracker, focus scorer, app blocker, and Telegram remote-control tool — all in one lightweight Windows desktop application.

It runs silently in the background, capturing which app you are using, how actively you are using it (keystrokes + mouse clicks), and whether you are genuinely focused or just context-switching. All data lives in a local SQLite database — nothing leaves your machine unless you explicitly request it.

---

## What Stasis does

| Capability | Details |
|---|---|
| **Screen-time tracking** | Logs every foreground app with second-granularity, including the active window title and (for browsers) the current URL. |
| **Productivity & focus scoring** | A configurable weighted formula rates each day 0–100 using deep-work time, engagement, flow streaks, and switch/idle penalties. |
| **Weekly reporting** | Built-in weekly report experience with per-day breakdown, top apps, category insights, goals impact, and week-over-week comparison. |
| **App limit enforcement** | Set per-app daily time budgets. Stasis automatically terminates processes once limits are reached, with optional temporary unblocks. |
| **Goals & coaching signals** | Define goals, track daily progress, review drift alerts, and correlate goal completion with weekly productivity outcomes. |
| **Telegram remote control** | Receive boot notifications, capture screenshots, pull activity logs, and lock/shutdown your PC from anywhere. |
| **File system monitoring** | Optional background watcher for file create/modify/delete events across all drives. |
| **Automatic self-updates** | Checks GitHub Releases and installs new versions in the background. |

---

## Key design principles

- **Local-first** — SQLite database at `%LOCALAPPDATA%\Stasis\data\stasis.db`. No external servers, no cloud sync.
- **Privacy-aware** — Telegram credentials are encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256). The Flask API binds only to `127.0.0.1`.
- **Minimal footprint** — A compiled Python backend (~100 MB, standalone `.exe`) + a Tauri WebView2 shell (~5 MB Rust binary). No Node or Python runtime required at runtime.
- **Configurable** — Categories, ignored processes, limits, and all toggles are editable from the UI or directly in JSON/SQLite.

---

## Documentation sections

<div class="grid cards" markdown>

- :material-download: **[Installation](installation.md)**  
  Download the installer, system requirements, first-run setup.

- :material-shield-lock: **[Privacy Policy](privacy-policy.md)**  
  What Stasis collects, when data leaves your device, and your controls.

- :material-cog: **[Configuration](configuration.md)**  
  Settings reference, app categories, ignored processes, startup options.

- :material-sitemap: **[Architecture](architecture.md)**  
  Dual-process design, thread model, data flow, and component overview.

- :material-api: **[API Reference](api-reference.md)**  
  Complete REST API documentation for all 40+ endpoints.

- :material-database: **[Database Schema](database.md)**  
  SQLite tables, columns, indexes, and pragma settings.

- :material-telegram: **[Telegram Integration](telegram.md)**  
  Bot setup, command reference, service states, security.

- :material-wrench: **[Developer Guide](developer-guide.md)**  
  Building from source, frontend dev server, linting, and contributing.

</div>

---

## Quick start

```bash
# Clone
git clone https://github.com/arshsisodiya/Stasis.git && cd Stasis

# Run backend only (no frontend UI needed for testing)
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
python src/main.py
# API now available at http://127.0.0.1:7432
```

Or download the pre-built installer from [Releases](https://github.com/arshsisodiya/Stasis/releases/latest).

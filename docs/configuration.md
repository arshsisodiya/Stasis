# Configuration

Stasis stores all runtime configuration in the **`settings` table** of the SQLite database at `%LOCALAPPDATA%\Stasis\data\stasis.db`. You can change any setting from the UI (**Settings** tab) or by writing directly to the table.

---

## Settings reference

| Key | Type | Default | UI location | Description |
|---|---|---|---|---|
| `telegram_enabled` | bool | `false` | Settings → Telegram | Whether the Telegram bot service starts on boot. |
| `telegram_token` | str (encrypted) | — | Settings → Telegram | Fernet-encrypted Telegram Bot token. |
| `telegram_chat_id` | str (encrypted) | — | Settings → Telegram | Fernet-encrypted Telegram Chat ID. |
| `file_logging_enabled` | bool | `false` | Settings → File Logging | Enable the watchdog file system monitor. |
| `file_logging_essential_only` | bool | `false` | Settings → File Logging | Restrict file events to Documents, Desktop, and Downloads. |
| `show_yesterday_comparison` | bool | `true` | Settings → Appearance | Show a yesterday-delta column in the Apps tab. |
| `hardware_acceleration` | bool | `true` | Settings → Appearance | Enable WebView2 GPU acceleration. Disable if you see rendering glitches. |
| `browser_tracking` | bool | `true` | Settings → Tracking | Capture the active URL from Chrome/Firefox/Edge/Opera/Brave. |
| `idle_detection` | bool | `true` | Settings → Tracking | Subtract idle time (no input for ≥ 2 min) from screen time totals. |
| `data_retention_days` | int | `0` | Settings → Data | Auto-delete activity records older than N days. `0` = keep forever. |

---

## App categories (`src/config/app_categories.json`)

Every tracked executable is mapped to a **main category** and an optional **sub-category**. The category drives colour coding, productivity scoring, and chart groupings in the UI.

### Main categories

| Category | Colour | Meaning |
|---|---|---|
| `productive` | Green | Work-related apps (IDE, Office, project tools) |
| `communication` | Blue | Messaging, email, video calls |
| `entertainment` | Purple | Games, streaming, media players |
| `social` | Pink | Social networks, forums |
| `system` | Gray | OS utilities, updaters, antivirus |
| `neutral` | Teal | Browsers (URL rules determine the real category) |
| `unproductive` | Red | Distracting or unclassified apps |
| `other` | Default | Fallback for unknown executables |

### Structure

```jsonc
{
  "apps": {
    // exe name (case-insensitive) → categories
    "code.exe":        { "main": "productive",    "sub": "development"  },
    "chrome.exe":      { "main": "neutral",        "sub": "browser"      },
    "discord.exe":     { "main": "communication",  "sub": "chat"         },
    "spotify.exe":     { "main": "entertainment",  "sub": "music"        },
    "notepad.exe":     { "main": "productive",     "sub": "text_editor"  },
    "vlc.exe":         { "main": "entertainment",  "sub": "video"        }
  },
  "url_rules": {
    // domain or path pattern → categories (overrides app rule when a browser is active)
    "github.com":           { "main": "productive",    "sub": "development"  },
    "stackoverflow.com":    { "main": "productive",    "sub": "development"  },
    "youtube.com/watch":    { "main": "entertainment", "sub": "video"        },
    "mail.google.com":      { "main": "communication", "sub": "email"        },
    "twitter.com":          { "main": "social",        "sub": "social_media" },
    "*.twitch.tv":          { "main": "entertainment", "sub": "streaming"    }
  }
}
```

### URL rule priority

1. **URL rules** are evaluated first when a browser process is active.
2. Wildcards are supported: `*.github.com` matches any subdomain.
3. Path-prefix matching: `youtube.com/watch` matches URLs that include that path.
4. If no URL rule matches, the app rule is used.
5. If no app rule exists either, the category falls back to `"other"`.

### Adding a new category

1. Add the exe name and categories to `app_categories.json`.
2. In the React frontend, add a matching entry to `CATEGORY_COLORS` in `frontend/src/shared/constants.js`.
3. Reload the backend (or wait for the next auto-reload triggered by the settings watchdog).

---

## Ignored processes (`src/config/ignored_apps.json`)

Processes in this list are silently filtered from **all** activity reports, heatmaps, and category breakdowns. It is pre-populated with Windows system processes that you would never want to count as screen time.

```json
{
  "ignore_processes": [
    "LockApp.exe",
    "LogonUI.exe",
    "ShellExperienceHost.exe",
    "StartMenuExperienceHost.exe",
    "SearchHost.exe",
    "dwm.exe",
    "svchost.exe",
    "services.exe",
    "wininit.exe",
    "winlogon.exe",
    "csrss.exe",
    "lsass.exe",
    "MsMpEng.exe",
    "RuntimeBroker.exe",
    "dllhost.exe",
    "rundll32.exe",
    "explorer.exe"
  ]
}
```

Add any executable name (case-insensitive, with or without `.exe`) to exclude it from tracking.

---

## Startup configuration (`installer/config.template.json`)

This file is copied to the installation directory as `config.json` by the installer.

```json
{
  "ui_mode": "normal",
  "startup_delay": 15,
  "logging": {
    "level": "info"
  }
}
```

| Key | Description |
|---|---|
| `ui_mode` | Reserved for future use (`"normal"` only). |
| `startup_delay` | Seconds the backend waits after Windows boot before beginning to log. Increase this on slow machines to avoid delaying the boot experience. |
| `logging.level` | Log verbosity: `debug`, `info`, `warning`, `error`. Log files are written to `%LOCALAPPDATA%\Stasis\logs\`. |

---

## Encryption

Telegram credentials (bot token and chat ID) are encrypted before being written to the `settings` table.

- **Algorithm:** Fernet symmetric encryption (AES-128-CBC for confidentiality, HMAC-SHA256 for authentication).
- **Key location:** `%LOCALAPPDATA%\Stasis\secret.key` — auto-generated on first run.
- **Key management:** If `secret.key` is deleted, all stored credentials become unreadable and will need to be re-entered.

The key is never transmitted or backed up. If you transfer the database to another machine without the key, credentials will not decrypt.

---

## Data storage paths

| Path | Contents |
|---|---|
| `%LOCALAPPDATA%\Stasis\data\stasis.db` | All tracking data, limits, settings, encrypted credentials |
| `%LOCALAPPDATA%\Stasis\logs\stasis_YYYY-MM-DD.log` | Daily rotating application log (last 7 days) |
| `%LOCALAPPDATA%\Stasis\icons\<app_name>.png` | Cached app icons extracted from EXEs |
| `%LOCALAPPDATA%\Stasis\secret.key` | Fernet key file for credential encryption |

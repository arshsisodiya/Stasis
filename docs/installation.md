# Installation

## System Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10 (64-bit) | Windows 11 (64-bit) |
| **RAM** | 150 MB available | 256 MB available |
| **Disk** | 250 MB | 500 MB |
| **WebView2 Runtime** | Required | Pre-installed on Windows 11 |
| **Admin rights** | Required for install | — |

---

## Installing the pre-built release

1. Go to the [latest release](https://github.com/arshsisodiya/Stasis/releases/latest) page.
2. Download **`Stasis-<version>-setup.exe`**.
3. Run the installer. Administrator privileges are required because Stasis performs a **per-machine install**.
4. If WebView2 Runtime is not present, the installer silently downloads and installs it before continuing.
5. Stasis starts automatically after installation and registers itself in the Windows startup registry so it runs on every boot.

> **Antivirus false positives:** Because the backend is a PyInstaller-compiled executable that uses Win32 APIs and pynput, some AV products may flag it. Add `%LOCALAPPDATA%\Stasis\` to your AV exclusions if you encounter issues.

---

## First-run setup

On the very first launch, Stasis will:

1. Initialize the SQLite database at `%LOCALAPPDATA%\Stasis\data\stasis.db`.
2. Set default settings (all toggles to their defaults, see [Configuration](configuration.md)).
3. Begin tracking the active foreground application immediately.
4. Show the **Loading Screen** while the Flask API warms up (usually < 2 seconds).

The UI opens to the **Dashboard** tab. If no activity has been recorded yet, a "No data" state is shown — this will populate within a minute of normal use.

### Optional: Telegram setup

To enable remote control from your phone:

1. Open **Settings** (gear icon, top-right).
2. Scroll to **Telegram Integration**.
3. Enter your **Bot Token** (from [@BotFather](https://t.me/BotFather)) and your **Chat ID** (from [@userinfobot](https://t.me/userinfobot)).
4. Click **Validate** to confirm the credentials are correct.
5. Click **Enable**. Stasis will start the bot service immediately and on every subsequent boot.

See [Telegram Integration](telegram.md) for the full commands reference.

---

## Uninstalling

Use **Windows Settings → Apps → Stasis → Uninstall**, or run the uninstaller from the install directory.

The uninstaller removes the application binaries and the startup registry entry. It does **not** delete `%LOCALAPPDATA%\Stasis\` (your database, logs, and encryption key). Delete that folder manually if you want a full clean removal.

---

## Storage locations

| Path | Contents |
|---|---|
| `%LOCALAPPDATA%\Stasis\data\stasis.db` | SQLite database (all tracking data, settings, limits) |
| `%LOCALAPPDATA%\Stasis\logs\stasis_YYYY-MM-DD.log` | Daily application logs (last 7 days) |
| `%LOCALAPPDATA%\Stasis\icons\` | Cached app icons (PNG, named by exe) |
| `%LOCALAPPDATA%\Stasis\secret.key` | Fernet encryption key for Telegram credentials |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\` | (Not used) Startup via registry instead |

# API Reference

The Python backend exposes a local REST API on **`http://127.0.0.1:7432`**.

- All responses are **JSON**.
- The optional `?date=YYYY-MM-DD` query parameter selects a historical day; omitting it defaults to **today**.
- No authentication is required — the server only accepts connections from `127.0.0.1`.
- The API includes daily analytics, goals, weekly reporting, notifications, limits, Telegram control, and updater endpoints.

---

## Health

### `GET /api/health`

Simple liveness check.

**Response**
```json
{ "status": "running" }
```

---

## Dashboard & Analytics

### `GET /api/dashboard`

Daily summary combining per-app screen time, hourly chart, category totals, and top app.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
{
  "date": "2024-01-15",
  "totalActiveSeconds": 28800,
  "totalIdleSeconds": 3600,
  "topApp": "code.exe",
  "apps": [
    {
      "app_name": "code.exe",
      "main_category": "productive",
      "sub_category": "development",
      "active_seconds": 14400,
      "idle_seconds": 600,
      "sessions": 12,
      "keystrokes": 4500,
      "clicks": 320
    }
  ],
  "hourly": [0, 0, 0, 0, 0, 0, 30, 55, 60, 58, ...]
}
```

---

### `GET /api/dashboard-bundle`

Single-request convenience payload used by the frontend for faster first paint. Includes dashboard, wellbeing, focus, hourly, and related slices for the selected date.

**Query params:** `?date=YYYY-MM-DD`

---

### `GET /api/wellbeing`

Productivity percentage and aggregate daily metrics.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
{
  "productivityPct": 72,
  "totalActiveSeconds": 28800,
  "productiveSeconds": 20736,
  "totalKeystrokes": 8200,
  "totalClicks": 650
}
```

---

### `GET /api/focus`

Focus score (0–100) with a full breakdown of the contributing factors.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
{
  "score": 78,
  "deepWorkSeconds": 18000,
  "flowBonus": 10,
  "engagementScore": 12,
  "switchPenalty": 4,
  "idlePenalty": 6
}
```

| Field | Description |
|---|---|
| `score` | Final clamped score 0–100 |
| `deepWorkSeconds` | Seconds in productive apps with above-baseline engagement |
| `flowBonus` | Bonus for unbroken ≥20-min productive streaks (max 20 pts) |
| `engagementScore` | Up to 15 pts based on KPM vs 35 KPM baseline |
| `switchPenalty` | Deducted for excessive task-switching (>10 switches) |
| `idlePenalty` | Deducted for high idle ratio |

---

### `GET /api/daily-stats`

Per-app daily breakdown including category, time, and input metrics.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
[
  {
    "app_name": "chrome.exe",
    "main_category": "entertainment",
    "sub_category": "browser",
    "active_seconds": 5400,
    "idle_seconds": 900,
    "sessions": 8,
    "keystrokes": 720,
    "clicks": 210
  }
]
```

---

### `GET /api/available-dates`

List of all dates that have at least one recorded activity row (most recent first).

**Response**
```json
["2024-01-15", "2024-01-14", "2024-01-13"]
```

---

### `GET /api/heatmap`

Last 60 days of screen time and productivity percentage, keyed by date. Used to render the calendar heatmap.

**Response**
```json
{
  "2024-01-15": { "screenTime": 28800, "productivityPct": 72 },
  "2024-01-14": { "screenTime": 21600, "productivityPct": 58 }
}
```

---

### `GET /api/sessions`

Chronological list of activity log entries for the selected day.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
[
  {
    "ts": "2024-01-15 09:04:22",
    "app": "code.exe",
    "active": 300,
    "idle": 0,
    "keys": 412,
    "clicks": 18,
    "cat": "productive"
  }
]
```

---

### `GET /api/weekly-trend`

Last 14 days of screen time and productivity, oldest first. Used for the trend line chart.

**Response**
```json
[
  { "date": "2024-01-02", "screenTime": 25200, "productivityPct": 65 },
  { "date": "2024-01-03", "screenTime": 30600, "productivityPct": 74 }
]
```

---

### `GET /api/hourly`

24-element array of active **minutes** per clock hour for the selected day.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
[0, 0, 0, 0, 0, 0, 5, 52, 58, 60, 55, 48, 30, 60, 58, 45, 40, 35, 20, 10, 5, 0, 0, 0]
```

---

### `GET /api/hourly-stats`

Top 3 apps per hour for the selected day.

**Query params:** `?date=YYYY-MM-DD`

**Response**
```json
{
  "09": [
    { "app": "code",   "active": 2800 },
    { "app": "chrome", "active": 800  },
    { "app": "slack",  "active": 200  }
  ],
  "10": [...]
}
```

---

### `GET /api/site-stats`

Top 50 domains by active time for the selected day, filterable by browser application.

**Query params:** `?date=YYYY-MM-DD&app=chrome.exe`

**Response**
```json
[
  { "domain": "github.com",  "seconds": 3600, "minutes": 60.0 },
  { "domain": "youtube.com", "seconds": 1800, "minutes": 30.0 }
]
```

---

### `GET /api/spark-series`

Lightweight last-N-days aggregate used for sparkline mini charts.

**Query params:** `?days=7` (default 7, max 30)

**Response**
```json
[
  {
    "date": "2024-01-09",
    "screenTime": 28800,
    "productivityPct": 70,
    "focusScore": 75,
    "keystrokes": 7200,
    "clicks": 540,
    "inputActivity": 7740
  }
]
```

---

## System & Apps

### `GET /api/init-bundle`

Startup helper endpoint returning initial bootstrap data used by the shell.

---

### `GET /api/ignored-apps`

List of process names that are excluded from all activity reports.

**Response**
```json
["dwm.exe", "explorer.exe", "svchost.exe", ...]
```

---

### `GET /api/app-icon/<app_name>`

Returns a PNG icon for the given executable name.

- Icon is extracted from the EXE on first request and cached in `%LOCALAPPDATA%\Stasis\icons\`.
- Returns `404` if the EXE is not found or has no embedded icon.

**Example:** `GET /api/app-icon/code.exe`

---

### `GET /api/system/apps`

Combined list of applications from activity history (>5 s recorded) and the Windows Uninstall registry.

**Response**
```json
[
  { "name": "Visual Studio Code", "exe": "code.exe", "source": "history" },
  { "name": "Spotify",            "exe": "Spotify.exe", "source": "registry" }
]
```

---

## Settings

### `GET /api/settings`

Returns the current values of key UI-relevant settings.

**Response**
```json
{
  "file_logging_enabled": false,
  "essential_only": false,
  "show_yesterday_comparison": true,
  "hardware_acceleration": true
}
```

---

### `POST /api/settings/update`

Update one or more settings. The FileMonitor is notified instantly if file-logging settings change (no restart required).

**Body**
```json
{ "show_yesterday_comparison": false }
```

**Response**
```json
{ "status": "ok" }
```

---

### `POST /api/settings/data-retention`

Set the number of days after which activity records are automatically deleted.

**Body**
```json
{ "days": 30 }
```

Send `"days": 0` to keep data forever (default).

---

### `POST /api/settings/data-retention/cleanup`

Trigger an immediate deletion of all records older than the configured retention threshold.

---

### `POST /api/settings/browser-tracking`

Enable or disable URL tracking inside browser windows.

**Body**
```json
{ "enabled": true }
```

---

### `POST /api/settings/idle-detection`

Enable or disable idle-time subtraction from screen time totals.

**Body**
```json
{ "enabled": true }
```

---

### `POST /api/settings/notifications/test`

Sends a generic Windows notification test event.

---

### `POST /api/settings/notifications/test-goal`

Sends a sample goal-threshold notification.

---

### `POST /api/settings/notifications/test-limit`

Sends a sample limit notification with actions (snooze/extend/keep blocked).

---

### `GET /api/settings/notifications/history`

Returns recent in-app notification history.

**Query params:** `?limit=20`

---

### `GET /api/settings/notifications/action/<action>`

Action handler endpoint used by Windows notification buttons.

Supported actions include:

- `open-limits`
- `open-goals`
- `open-review-day`
- `snooze-limit`
- `extend-limit`
- `keep-blocked`

---

## App Limits & Blocking

### `GET /limits/all`

All configured app limits with current status.

**Response**
```json
[
  {
    "app_name": "chrome.exe",
    "daily_limit_seconds": 7200,
    "is_enabled": 1,
    "unblock_until": null
  }
]
```

---

### `POST /limits/set`

Create or update a daily time limit for an application.

**Body**
```json
{ "app_name": "chrome.exe", "daily_limit_seconds": 7200 }
```

---

### `POST /limits/toggle`

Enable or disable an existing limit without deleting it.

**Body**
```json
{ "app_name": "chrome.exe" }
```

---

### `POST /limits/unblock`

Temporarily override a block for a configurable number of minutes.

**Body**
```json
{ "app_name": "chrome.exe", "minutes": 30 }
```

Sets `unblock_until = now + 30 minutes`. The blocking service respects this until it expires.

---

### `POST /limits/reblock`

Immediately removes temporary unblock and forces the app back into blocked state.

**Body**
```json
{ "app_name": "chrome.exe" }
```

---

### `POST /limits/delete`

Remove a limit entirely.

**Body**
```json
{ "app_name": "chrome.exe" }
```

---

### `GET /limits/blocked`

List of currently blocked apps (those over their limit and not temporarily unblocked).

**Response**
```json
[
  { "app_name": "chrome.exe", "blocked_at": "2024-01-15 18:32:00" }
]
```

---

## Goals

### `GET /api/goals`

List all configured goals.

---

### `POST /api/goals`

Create a goal.

**Body**
```json
{
  "goal_type": "screen_time",
  "target_value": 14400,
  "target_unit": "seconds",
  "direction": "under",
  "label": "Daily screen time"
}
```

---

### `PUT /api/goals/<goal_id>`

Update goal target/label/active state.

---

### `DELETE /api/goals/<goal_id>`

Delete a goal and its associated logs.

---

### `GET /api/goals/progress`

Returns daily progress against all active goals.

**Query params:** `?date=YYYY-MM-DD`

---

### `GET /api/goals/history`

Goal trend/history API for recent days.

**Query params:** `?days=30`

---

## Weekly Reports

### `GET /api/weekly-report`

Main weekly report endpoint used by the Reports tab.

**Query params:** `?week_of=YYYY-MM-DD&verbosity=compact|standard|detailed`

Returns period summary, daily breakdown, category and app insights, limits, goals, and week trend slices.

---

### `GET /api/weekly-report/compare`

Compare two weeks and return deltas.

**Query params:** `?week_a=YYYY-MM-DD&week_b=YYYY-MM-DD`

---

### `GET /api/weekly-report/available-weeks`

Returns selectable Monday-start week options.

---

### `POST /api/weekly-report/send-telegram`

Send rendered weekly report to configured Telegram chat.

**Body**
```json
{ "week_of": "2026-03-09" }
```

---

### `GET /api/hourly-activity`

Weekly 7x24 activity grid with productivity percentage per hour bucket.

**Query params:** `?week_of=YYYY-MM-DD`

---

### `GET /api/limit-events`

Range query for limit edits/hits used in weekly reporting.

**Query params:** `?start=YYYY-MM-DD&end=YYYY-MM-DD`

---

## Telegram

### `GET /api/telegram/status`

Lightweight status check (no credential data).

**Response**
```json
{ "enabled": true, "running": true, "state": "running" }
```

`state` is one of: `running`, `paused`, `degraded`, `disabled`.

---

### `GET /api/telegram/config`

Masked credentials and the last 10 commands received.

**Response**
```json
{
  "token":    "123456:ABC***",
  "chat_id":  "98765***",
  "commands": [
    { "text": "/screenshot", "ts": "2024-01-15 10:22:00" }
  ]
}
```

---

### `GET /api/telegram/full-status`

Combined response of `/api/telegram/status` and `/api/telegram/config`.

---

### `POST /api/telegram/update-permissions`

Update allowed Telegram command permissions.

---

### `GET /api/dependencies/check`

Check optional dependency availability for media-related Telegram features.

---

### `GET /api/dependencies/progress`

Track dependency installation progress.

---

### `POST /api/dependencies/install`

Trigger dependency installation workflow.

---

### `POST /api/telegram/validate`

Validate a bot token against the Telegram API without storing it.

**Body**
```json
{ "token": "123456:ABCDEF..." }
```

**Response**
```json
{ "valid": true, "bot_name": "MyStasisBot" }
```

---

### `POST /api/telegram/enable`

First-time setup **or** re-enable with existing credentials.

**First-time setup body:**
```json
{ "token": "123456:ABCDEF...", "chat_id": "987654321" }
```

**Re-enable (no body or empty body):** Uses stored encrypted credentials.

---

### `POST /api/telegram/disable`

Stop the bot service. Credentials are preserved in the database.

---

### `POST /api/telegram/restart`

Stop and restart the bot service using the stored credentials.

---

### `POST /api/telegram/reset`

Permanently delete all stored credentials and stop the service.

---

## Danger Zone

!!! danger "Irreversible operations"
    These endpoints permanently delete data. They require custom confirmation headers.

### `DELETE /api/clear-data`

Delete all rows from `activity_logs` and `daily_stats`.

**Required header:** `X-Confirm-Clear: yes`

---

### `DELETE /api/factory-reset`

Wipe the entire database, reset all settings to defaults, and restart the application process.

**Required header:** `X-Confirm-Reset: RESET_ALL`

---

## Updates

### `GET /api/update/status`

Current state of the update manager.

**Response**
```json
{
  "state": "idle",
  "current_version": "1.2.0",
  "latest_version": "1.3.0",
  "download_progress": 0
}
```

`state` is one of: `idle`, `checking`, `update_available`, `downloading`, `ready`, `error`.

---

### `POST /api/update/check`

Start an asynchronous check against GitHub Releases. Poll `/api/update/status` to see the result.

---

### `POST /api/update/install`

Start an asynchronous download and install of the latest release. The application will restart automatically when the install completes.

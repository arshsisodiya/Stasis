# Architecture

Stasis uses a **dual-process architecture**: a compiled Python telemetry engine that runs headlessly in the background, and a React/Tauri desktop shell that provides the user interface.

---

## High-level overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri Shell  (Rust + WebView2)                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React 19 Frontend  (Vite)                               │   │
│  │  WellbeingDashboard → Overview / Activity / Apps /       │   │
│  │                        Insights (Goals, Limits, Reports)  │   │
│  └─────────────────────┬────────────────────────────────────┘   │
│                         │  HTTP  localhost:7432                  │
└─────────────────────────┼───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  Python Backend  (Flask / Werkzeug)  stasis-backend.exe          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ ActivityLogger│  │BlockingService│  │  TelegramService     │   │
│  │  (pynput)    │  │  (psutil)    │  │  (long-polling)      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘   │
│         │                  │                                      │
│  ┌──────▼──────────────────▼──────────────────────────────────┐  │
│  │             SQLite  (WAL mode)   stasis.db                 │  │
│  │  activity_logs · daily_stats · app_limits · blocked_apps   │  │
│  │  file_logs · settings                                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  FileMonitorController (watchdog)  ─── optional, toggled         │
│  UpdateManager (GitHub Releases)   ─── background, silent        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Python backend

The backend is a compiled directory (PyInstaller `--onedir`) that spawns several daemon threads on startup.

### Entry point (`src/main.py`)

`main()` performs the following in order:

1. Registers SIGINT / SIGTERM signal handlers for graceful shutdown.
2. Creates a **Win32 named mutex** (`Local\StasisSingleInstance`) to prevent duplicate instances.
3. Instantiates `AppController`, which initialises the Telegram service if `telegram_enabled = true`.
4. Calls `init_db()` to create / migrate the SQLite schema.
5. Registers the executable in the Windows startup registry (compiled mode only).
6. Starts `BlockingService` if any app limits exist.
7. Launches three daemon threads: `APIServerThread`, `ActivityLoggerThread`, `DataRetentionThread`.
8. Starts `FileMonitorController` (Observer thread only if file-logging is enabled).
9. Enters the main wait loop (`shutdown_event.wait()`).
10. On shutdown: stops the input listener, joins all threads with a 3-second timeout.

### Thread inventory

| Thread name | Class / function | Restart policy |
|---|---|---|
| `ActivityLoggerThread` | `start_logging()` in `src/core/activity_logger.py` (external) | Daemon — restarted by watchdog if crashed |
| `APIServerThread` | `APIServer.start()` — Flask/Werkzeug (threaded) | Daemon |
| `DataRetentionThread` | `retention_worker()` | Daemon, sleeps 6 h between runs |
| `WeeklyReportSchedulerThread` | Weekly Telegram report scheduler | Daemon |
| `FileMonitorController` | `watchdog.Observer` | Managed separately, starts/stops on settings change |
| `BlockingService._limit_monitor` | Checks limits every 15 s | Non-daemon (runs until `.stop()`) |
| `BlockingService._process_guard` | Terminates blocked processes every 0.5 s | Non-daemon |
| `TelegramService` | Long-poll loop | Managed by `AppController` |

### API layer (`src/api/`)

Flask is used with CORS enabled. All routes are registered as **Blueprints** via `create_app(app_controller)`:

```
wellbeing_bp  ←  activity_routes, dashboard_routes, focus_routes,
                  limits_routes, goals_routes, report_routes,
                  settings_routes, system_routes, stats_routes,
                  health_routes, danger_routes, spark_routes
telegram_bp   ←  telegram_routes
update_bp     ←  update_routes
```

The server binds to `127.0.0.1:7432` using Werkzeug's `make_server(..., threaded=True)`. All responses are JSON.

### Data pipeline

```
pynput keyboard/mouse listener
        │
        ▼
ActivityLogger  ─── window focus hook (Win32 GetForegroundWindow)
        │           URL sniffer (accessibility API for browsers)
        │           idle detector (Win32 GetLastInputInfo)
        ▼
 activity_logs table  (one row per ~5-second focus window)
        │
        ▼
 daily_stats table  (aggregated by app + category per day)
        │
        ▼
  Flask REST API  ──► React Dashboard
```

### Security model

- **Credentials** — Telegram token and chat ID are stored encrypted with Fernet (AES-128-CBC + HMAC-SHA256). The symmetric key is saved at `%LOCALAPPDATA%\Stasis\secret.key`.
- **Network exposure** — Flask binds only to `127.0.0.1`. No listener is opened on external interfaces.
- **Single instance** — Win32 named mutex prevents running two instances simultaneously.
- **Danger operations** — `/api/clear-data` and `/api/factory-reset` require custom HTTP headers (`X-Confirm-Clear: yes`, `X-Confirm-Reset: RESET_ALL`) as an accidental-trigger guard.

---

## React/Tauri frontend

### Technology stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2.x (Rust + WebView2) |
| UI framework | React 19 |
| Build tool | Vite 7 |
| Language | JavaScript (JSX) |
| Styling | Inline React styles + custom CSS (`index.css`) |
| Linter | ESLint 9 |

### State management

`WellbeingDashboard.jsx` uses a **`useReducer`** pattern (`dashReducer`) for atomic state updates. The dashboard state object contains:

```js
{
  data,          // Wellbeing metrics from /api/wellbeing
  stats,         // Daily stats from /api/daily-stats
  prevStats,     // Yesterday's stats (if comparison enabled)
  prevWellbeing, // Yesterday's wellbeing
  hourly,        // 24-element array from /api/hourly
  focusData,     // Focus score + breakdown from /api/focus
  limits,        // App limits from /limits/all
  trackedSeconds,// Live counter (polled every 30 s)
  loading,       // Boolean
  noData,        // Boolean — no activity for selected date
  mounted,       // Boolean — initial load complete
}
```

### Data-fetching pattern

1. On **mount** (or date change), the dashboard fetches all API endpoints in parallel using `Promise.all`.
2. A **30-second polling interval** re-fetches data to keep the UI live without a persistent WebSocket connection.
3. The `LoadingScreen` pre-fetches `initialData` while the dashboard component mounts beneath it, so there is no white-screen flash on app open.

### Tab structure

| Tab | Component | Data sources |
|---|---|---|
| Overview | `OverviewPage.jsx` | `/api/wellbeing`, `/api/focus`, `/api/daily-stats`, `/api/spark-series` |
| Activity | `ActivityPage.jsx` | `/api/sessions`, `/api/hourly-stats`, `/api/site-stats` |
| Apps | `AppsPage.jsx` | `/api/daily-stats`, `/api/app-icon/<name>` |
| Insights → Goals | `GoalsPage.jsx` | `/api/goals`, `/api/goals/progress`, `/api/goals/history` |
| Insights → Limits | `LimitsPage.jsx` | `/limits/all`, `/limits/blocked`, `/api/system/apps`, `/api/limit-events` |
| Insights → Reports | `WeeklyReportPage.jsx` | `/api/weekly-report/*`, `/api/hourly-activity` |
| Settings | `SettingsPage.jsx` | `/api/settings`, `/api/settings/notifications/*`, `/api/telegram/*`, `/api/update/*` |

### Build output

```
frontend/src-tauri/target/release/bundle/
  nsis/
    Stasis-<version>-setup.exe      ← NSIS installer (~80 MB)
    Stasis-<version>-setup.nsis.zip ← Portable ZIP
```

---

## Process communication

The Tauri shell launches `stasis-backend.exe` (from `bin/stasis-backend/`) as a **sidecar process** (configured in `tauri.conf.json`). The React frontend communicates with the backend exclusively via HTTP requests to `http://127.0.0.1:7432`. There are no Tauri IPC commands used for data retrieval — the HTTP API is the single source of truth.

This design means the Python backend can be run and tested independently of the Tauri shell.

---

## Performance considerations

| Optimisation | Details |
|---|---|
| **ProcessCache** | Thread-safe LRU cache (TTL=300 s, max 1000 entries) maps `(pid, create_time)` → `(app_name, exe_path)`. Prevents repeated OS calls for the same process. |
| **AppDiscovery cache** | 10-minute TTL on the combined activity-history + registry app list. |
| **daily_stats table** | Pre-aggregated data so dashboard queries scan thousands of rows instead of millions. |
| **Sparkline endpoint** | Single aggregation SQL query — no per-log-entry iteration. |
| **SQLite WAL mode** | Allows concurrent reads during writes; critical since the logger thread writes while the API reads. |
| **BlockingService batching** | Fetches all limits in a single transaction per 15-second cycle to avoid repeated lock contention. |

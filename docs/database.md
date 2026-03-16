# Database Schema

Stasis uses **SQLite** with **WAL (Write-Ahead Logging)** mode, stored at `%LOCALAPPDATA%\Stasis\data\stasis.db`.

---

## Pragma settings

Applied on every connection open:

```sql
PRAGMA journal_mode = WAL;        -- concurrent reads during writes
PRAGMA synchronous  = NORMAL;     -- balanced speed / durability
PRAGMA busy_timeout = 10000;      -- wait up to 10 s if locked
```

WAL mode is critical because the `ActivityLoggerThread` writes continuously while the `APIServerThread` reads for each dashboard request.

---

## Tables

### `activity_logs`

Raw telemetry — one row is inserted for each tracked focus window (approximately every 5 seconds of activity).

```sql
CREATE TABLE IF NOT EXISTS activity_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT    NOT NULL,   -- YYYY-MM-DD HH:MM:SS
    app_name        TEXT,               -- e.g. "chrome.exe"
    exe_path        TEXT,               -- full path to executable
    pid             INTEGER,            -- process ID at capture time
    window_title    TEXT,               -- foreground window title
    url             TEXT,               -- active URL (browsers only; NULL otherwise)
    active_seconds  INTEGER DEFAULT 0,  -- seconds the user was active
    idle_seconds    INTEGER DEFAULT 0,  -- seconds the user was idle
    keystrokes      INTEGER DEFAULT 0,  -- keystrokes during this window
    clicks          INTEGER DEFAULT 0   -- mouse clicks during this window
);
```

**Indexes:**
```sql
CREATE INDEX idx_activity_time     ON activity_logs(timestamp);
CREATE INDEX idx_activity_app      ON activity_logs(app_name);
CREATE INDEX idx_activity_app_date ON activity_logs(app_name, timestamp);
```

**Notes:**
- `url` is populated only for known browsers (`chrome.exe`, `firefox.exe`, `msedge.exe`, `opera.exe`, `brave.exe`). It is `NULL` or `'N/A'` for all other apps.
- `pid` is stored with `create_time` in the `ProcessCache` to disambiguate PID reuse between rows.
- `active_seconds + idle_seconds` equals the total duration of the focus window.

---

### `daily_stats`

Aggregated data — one row per *(date, app_name, main_category)* combination. Updated by the analytics layer each time a session ends.

```sql
CREATE TABLE IF NOT EXISTS daily_stats (
    date            TEXT    NOT NULL,
    app_name        TEXT    NOT NULL,
    main_category   TEXT,
    sub_category    TEXT,
    active_seconds  INTEGER DEFAULT 0,
    idle_seconds    INTEGER DEFAULT 0,
    sessions        INTEGER DEFAULT 0,
    keystrokes      INTEGER DEFAULT 0,
    clicks          INTEGER DEFAULT 0,
    PRIMARY KEY (date, app_name, main_category)
);
```

**Index:**
```sql
CREATE INDEX idx_daily_date ON daily_stats(date);
```

**Notes:**
- The composite primary key `(date, app_name, main_category)` allows a single app to have multiple rows on the same day if it was categorised differently across sessions (e.g., Chrome as `neutral` and Chrome as `entertainment` when YouTube was active).
- On first run, Stasis migrates old `(date, app_name)` primary keys to the new 3-column key automatically.
- `sessions` counts the number of distinct `activity_logs` rows that were aggregated into this row.

---

### `app_limits`

User-defined daily time budgets per application.

```sql
CREATE TABLE IF NOT EXISTS app_limits (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name             TEXT    UNIQUE NOT NULL,
    daily_limit_seconds  INTEGER NOT NULL,
    is_enabled           INTEGER DEFAULT 1,    -- 1=enabled, 0=paused
    created_at           TEXT,                 -- ISO-8601 creation timestamp
    unblock_until        TEXT                  -- ISO-8601 expiry for temporary unblocks
);
```

**Index:**
```sql
CREATE INDEX idx_limit_app ON app_limits(app_name);
```

**Notes:**
- `UNIQUE` on `app_name` enforces one limit per application.
- `is_enabled = 0` means the limit is paused — `BlockingService` skips it.
- `unblock_until` is an ISO-8601 timestamp. When `now() < unblock_until`, the app is temporarily unblocked even if its usage has exceeded the limit.

---

### `blocked_apps`

Runtime cache of applications currently in a blocked state (usage exceeded limit).

```sql
CREATE TABLE IF NOT EXISTS blocked_apps (
    app_name    TEXT PRIMARY KEY,
    blocked_at  TEXT               -- ISO-8601 timestamp when it was blocked
);
```

**Index:**
```sql
CREATE INDEX idx_blocked_app ON blocked_apps(app_name);
```

**Notes:**
- Rows are inserted by `BlockingService._limit_monitor()` every 15 s when usage > limit.
- Rows are removed by `/limits/unblock` (temporary override) or `/limits/toggle` (disable the limit).
- Current blocked-state source of truth is `app_limits.is_blocked` (`blocked_apps` is maintained as a compatibility/runtime cache).
- `BlockingService._process_guard()` enforces from in-memory blocked snapshots synchronized from `app_limits` state.

---

### `settings`

Key-value store for all application settings and encrypted credentials.

```sql
CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT
);
```

See [Configuration → Settings reference](configuration.md#settings-reference) for all recognised keys and their meaning.

---

### `telegram_settings`

Separate key-value store dedicated to Telegram configuration.

```sql
CREATE TABLE IF NOT EXISTS telegram_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT
);
```

This table stores Telegram runtime values such as encrypted token/chat ID, enable flag, and recent command metadata.

---

### `file_logs`

Optional file system event log. Populated only when `file_logging_enabled = true`.

```sql
CREATE TABLE IF NOT EXISTS file_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  TEXT,
    action     TEXT,       -- created | modified | deleted | moved
    file_path  TEXT
);
```

**Notes:**
- When `file_logging_essential_only = true`, events are filtered to paths under `Documents`, `Desktop`, and `Downloads`.
- This table can grow large quickly on busy systems. Use **Settings → Data Retention** or **Clear File Logs** to manage its size.

---

### `goals`

Goal definitions used by the Goals and Weekly Reports experiences.

```sql
CREATE TABLE IF NOT EXISTS goals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_type     TEXT NOT NULL,
    label         TEXT,
    target_value  REAL NOT NULL,
    target_unit   TEXT NOT NULL DEFAULT 'seconds',
    direction     TEXT NOT NULL DEFAULT 'under',
    is_active     INTEGER DEFAULT 1,
    created_at    TEXT,
    updated_at    TEXT
);
```

---

### `goal_logs`

Per-day materialized goal performance snapshots.

```sql
CREATE TABLE IF NOT EXISTS goal_logs (
    goal_id       INTEGER NOT NULL,
    date          TEXT NOT NULL,
    actual_value  REAL,
    target_value  REAL,
    met           INTEGER DEFAULT 0,
    PRIMARY KEY (goal_id, date)
);
```

---

### `limit_events`

Audit-style event stream for app-limit hits and edits.

```sql
CREATE TABLE IF NOT EXISTS limit_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name   TEXT NOT NULL,
    event_type TEXT NOT NULL,
    old_value  INTEGER,
    new_value  INTEGER,
    timestamp  TEXT NOT NULL,
    date       TEXT NOT NULL
);
```

---

## Full index summary

| Index name | Table | Columns | Purpose |
|---|---|---|---|
| `idx_activity_time` | `activity_logs` | `timestamp` | Date-range filtering in most API queries |
| `idx_activity_app` | `activity_logs` | `app_name` | Per-app filtering |
| `idx_activity_app_date` | `activity_logs` | `app_name, timestamp` | Composite for limit usage checks |
| `idx_daily_date` | `daily_stats` | `date` | Dashboard / heatmap date lookups |
| `idx_limit_app` | `app_limits` | `app_name` | O(1) limit lookup by app name |
| `idx_limit_blocked` | `app_limits` | `is_blocked` | Fast blocked-limit scans |
| `idx_blocked_app` | `blocked_apps` | `app_name` | O(1) blocked-status check |
| `idx_goal_logs_date` | `goal_logs` | `date` | Goal progress history filtering |
| `idx_limit_events_date` | `limit_events` | `date` | Weekly limit-event reporting |
| `idx_limit_events_app` | `limit_events` | `app_name` | Per-app limit event analysis |

---

## Schema migration

Stasis performs a lightweight auto-migration on startup via `init_db()`:

1. If `daily_stats` has an old `(date, app_name)` primary key (no `main_category` column), the table is recreated with the correct 3-column PK and the existing data is preserved.
2. All `CREATE TABLE IF NOT EXISTS` statements are idempotent — safe to run on every launch.
3. Missing indexes are created automatically on first run.

---

## Useful queries

### Today's screen time by app
```sql
SELECT app_name, SUM(active_seconds) AS total
FROM daily_stats
WHERE date = date('now')
GROUP BY app_name
ORDER BY total DESC;
```

### Hourly usage for a specific date
```sql
SELECT strftime('%H', timestamp) AS hour, SUM(active_seconds)
FROM activity_logs
WHERE timestamp LIKE '2024-01-15%'
GROUP BY hour
ORDER BY hour;
```

### All blocked apps with time remaining until unblock
```sql
SELECT a.app_name,
       a.daily_limit_seconds,
       a.unblock_until,
       b.blocked_at
FROM app_limits  a
JOIN blocked_apps b USING (app_name)
WHERE a.unblock_until > datetime('now');
```

### Productivity trend (last 14 days)
```sql
SELECT
    date,
    SUM(CASE WHEN main_category = 'productive' THEN active_seconds ELSE 0 END) AS prod,
    SUM(active_seconds) AS total,
    ROUND(
        100.0 * SUM(CASE WHEN main_category = 'productive' THEN active_seconds ELSE 0 END)
             / MAX(SUM(active_seconds), 1),
        1
    ) AS productivity_pct
FROM daily_stats
GROUP BY date
ORDER BY date DESC
LIMIT 14;
```

# Developer Guide

This guide covers setting up a local development environment, understanding the build system, and making changes to both the Python backend and the React/Tauri frontend.

---

## Prerequisites

| Tool | Minimum version | Purpose |
|---|---|---|
| Python | 3.11 | Backend engine |
| pip + venv | (bundled with Python) | Python dependency management |
| PyInstaller | latest | Compile Python → standalone `.exe` |
| Node.js | 20 LTS | Frontend build |
| npm | 10+ | Package management |
| Rust (stable) | via [rustup](https://rustup.rs) | Tauri shell compilation |
| Rust target | `x86_64-pc-windows-msvc` | Windows 64-bit |
| NSIS | 3.x | Windows installer generation |
| Git | — | Version control |
| UPX *(optional)* | — | Compress the backend EXE |

> All tools must be in your system `PATH`.

---

## Repository layout

```
Stasis/
├── src/              # Python backend
├── frontend/         # React 19 + Tauri app
│   ├── src/          # React source (JSX)
│   ├── src-tauri/    # Rust Tauri shell
│   └── package.json
├── docs/             # MkDocs documentation source
├── stasis-backend.spec  # PyInstaller spec
├── build.ps1         # Full build automation script
├── requirements.txt  # Python dependencies
└── mkdocs.yml        # Documentation site config
```

---

## Running the backend in development

```powershell
# 1. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the backend
python src/main.py
```

The Flask API starts on `http://127.0.0.1:7432`. You can now query it with `curl`, a browser, or Postman:

```bash
curl http://127.0.0.1:7432/api/health
# {"status": "running"}

curl http://127.0.0.1:7432/api/dashboard
# {... daily summary ...}
```

> **Note:** Several features (icon extraction, app categorisation, blocking) use Win32 APIs and only work on Windows. Running on macOS/Linux will cause import errors.

---

## Running the frontend in development

The frontend talks to the backend over HTTP. Make sure the backend is already running on port 7432 before starting Vite.

```powershell
cd frontend
npm install       # first time only
npm run dev       # Vite dev server on http://localhost:5173
```

Open `http://localhost:5173` in your browser. Hot module replacement (HMR) is enabled — changes to `.jsx` files update the browser instantly.

> The Tauri shell is **not** needed for frontend development. A regular browser works fine since the frontend only needs the HTTP API.

---

## Building the full application

The `build.ps1` script automates the entire release pipeline.

```powershell
.\build.ps1 -Version 1.2.3
```

### What `build.ps1` does

| Step | Detail |
|---|---|
| **Version sync** | Updates the version string in `tauri.conf.json`, `package.json`, and `Cargo.toml` |
| **Win32 metadata** | Generates `file_version_info.txt` so the compiled EXE has correct version metadata in Windows Explorer |
| **PyInstaller** | Runs `pyinstaller stasis-backend.spec` → `dist/stasis-backend.exe` |
| **Copy sidecar** | Moves backend EXE to `frontend/src-tauri/bin/` so Tauri bundles it |
| **npm install** | Installs frontend dependencies (skipped if `node_modules` is up to date) |
| **Tauri build** | Runs `npm run tauri:build` inside `frontend/` — compiles Vite + Rust + generates NSIS installer |

### Output artifacts

```
dist/
  stasis-backend-v1.2.3.exe                          ← Standalone backend (~100 MB)
frontend/src-tauri/target/release/bundle/
  nsis/
    Stasis-1.2.3-setup.exe                            ← Full NSIS installer
    Stasis-1.2.3-setup.nsis.zip                       ← Portable ZIP
```

---

## PyInstaller spec (`stasis-backend.spec`)

Key settings in the spec file:

| Setting | Value | Reason |
|---|---|---|
| `console = False` | Windowed mode | No terminal window pops up |
| `upx = True` | Compress with UPX | Reduces EXE size (requires UPX in PATH) |
| `hidden_imports` | flask, psutil, win32api, … | Ensure PyInstaller bundles all dynamic imports |
| `excludes` | unittest, matplotlib, scipy, pandas, … | Strips unused heavy libraries |
| `datas` | `app_categories.json`, `ignored_apps.json` | Bundle config JSONs into the EXE |

---

## Frontend architecture

### Component hierarchy

```
App.jsx
└── (loading transition)
    ├── LoadingScreen.jsx          ← Splash/spinner, polls /api/health
    └── WellbeingDashboard.jsx     ← Main shell with tab navigation
        ├── OverviewPage.jsx       ← Summary cards + trend chart
        ├── ActivityPage.jsx       ← Session timeline + site stats
        ├── AppsPage.jsx           ← Per-app breakdown with icons
    ├── GoalsPage.jsx          ← Goal definitions and progress
    ├── LimitsPage.jsx         ← Limit management + blocking UI
    ├── WeeklyReportPage.jsx   ← Weekly summaries, compare, export
    └── SettingsPage.jsx       ← All configuration panels
```

### Shared utilities (`frontend/src/shared/`)

| File | Contents |
|---|---|
| `constants.js` | `CATEGORY_COLORS`, `KNOWN_APP_EMOJIS`, `BROWSER_EXES` |
| `utils.js` | `fmtTime()`, `localYMD()`, `yesterday()`, `fmtBytes()`, `timeAgo()` |
| `hooks.js` | `useCountUp()`, `useLiveClock()`, `useLocalStorage()`, `useDebounce()` |
| `components.jsx` | `Skeleton`, `AppIcon`, `Modal`, generic input/button/card primitives |

### Adding a new page / tab

1. Create `frontend/src/pages/MyPage.jsx`.
2. Import and render it inside `WellbeingDashboard.jsx` in the `AnimatedTabPanel` block.
3. Add a tab button in the `TopNav` component (search for the existing tab buttons).
4. If the page needs new API data, add the fetch call inside the `loadData` function and dispatch the result via `dashReducer`.

### Adding a new API endpoint (Python)

1. Add your route function in the appropriate file under `src/api/` (or create a new one).
2. If creating a new file, register the blueprint in `src/api/api_server.py` → `create_app()`.
3. Decorate your function with `@wellbeing_bp.route("/api/my-endpoint")` (or use `telegram_bp` / `update_bp` when appropriate).
4. Return `jsonify(your_data)`.

---

## Linting

### Frontend

```powershell
cd frontend
npm run lint
```

Uses **ESLint 9** with the React + Hooks ruleset. Fix issues with:

```powershell
npm run lint -- --fix
```

### Python

There is no Python linter configured in the project. You can run `flake8` or `ruff` manually:

```bash
pip install ruff
ruff check src/
```

---

## CI / CD

Two GitHub Actions workflows are defined in `.github/workflows/`:

### `build-and-release.yml`

Triggered by:
- A tag push matching `v*` (e.g., `v1.2.3`)
- Manual `workflow_dispatch` with a version input

**Steps:** Checks out the repo, sets up Python 3.11 + Node 20 + Rust stable, installs dependencies, runs `build.ps1`, then uploads the installer and backend EXE as a GitHub Release.

### `static.yml` (documentation)

Triggered by:
- Pushes to `master` that touch `docs/**`, `mkdocs.yml`, or `README.md`
- Manual `workflow_dispatch`

**Steps:** Installs MkDocs with the Material theme, builds the documentation site, and deploys it to GitHub Pages.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Make your changes and ensure the backend starts without errors (`python src/main.py`).
3. Run `npm run lint` in `frontend/` and fix any lint errors.
4. Open a pull request with a clear description of what changed and why.

Please follow the existing code style (no external type hints, inline React styles, Flask blueprints for new routes).

---

## Common issues

| Issue | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'win32api'` | Run `pip install pywin32` and then `python Scripts/pywin32_postinstall.py -install` |
| Tauri build fails with `MSVC not found` | Install Visual Studio Build Tools 2022 with the "Desktop development with C++" workload |
| PyInstaller produces an EXE that crashes on launch | Run `pyinstaller stasis-backend.spec --clean` to clear the cache and rebuild |
| `npm run dev` shows a blank white screen | Backend is not running on port 7432; start `python src/main.py` first |
| App icon not showing in the UI | The icon cache may be stale; delete `%LOCALAPPDATA%\Stasis\icons\` and restart |

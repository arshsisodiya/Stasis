<div align="center">
  <h1>🎨 Stasis Frontend</h1>
  <p><b>The beautiful, high-performance UI powering the Digital Wellbeing Dashboard.</b></p>
</div>

---

The **Stasis Frontend** is a modern, reactive native desktop UI built using **React**, **Vite**, and **Tauri**. It provides a real-time, aesthetically rich experience for visualizing background telemetry without compromising system performance.

## 🚀 Tech Stack

- **Framework:** React 18+
- **Build Tool:** Vite (for lightning-fast HMR and optimized builds)
- **Desktop Runtime:** Tauri (Rust-based, native OS windowing, tiny payload)
- **Styling:** Vanilla CSS (`index.css`) & Inline React Styles (Zero external UI libraries)

---

## 💎 Design Language & Aesthetics

Stasis is built to feel exclusively premium. The UI avoids traditional boxy layouts in favor of fluid, modern design paradigms.

1. **Intense Dark Mode & Glassmorphism:** Uses deep `radial-gradient` backgrounds (`#080b14`) paired with translucent `rgba(15,18,30,0.7)` cards and `backdrop-filter: blur(20px)` to create depth.
2. **Dynamic Micro-Animations:** Almost every state change, tab switch, and hover is animated:
   - Data charts slide in sequentially.
   - The primary Donut Chart dynamically resizes its segments with spring-like physics upon hovering.
   - Animated ambient "orbs" float in the background, subtly changing color based on the active tab.
3. **Typography:** Employs **DM Sans** for legibility and UI elements, and **DM Serif Display** for beautifully contrasting large metric numbers.
4. **Intelligent Iconography:** Automatically dynamically maps known executable names (like `code.exe` or `figma.exe`) to high-res corporate logos via Clearbit/Google Favison APIs, falling back to contextual emojis if offline or unmapped.

---

## 📂 Project Structure

```
frontend/
├── src/
│   ├── main.jsx                 # React DOM attachment
│   ├── App.jsx                  # Bootstrapper (handles Loading state)
│   ├── WellbeingDashboard.jsx   # 🔥 The core Dashboard application (Tabs, Charts, Tracking)
│   ├── SettingsPage.jsx         # The comprehensive config manager & Telegram binding UI
│   ├── LoadingScreen.jsx        # Backend connection checking screen
│   └── index.css                # Global styles, scrollbars, and CSS @keyframes
│
├── src-tauri/                   # The Rust-based Tauri configuration
│   ├── tauri.conf.json          # Native window configuration & NSIS Installer instructions
│   └── src/                     # Rust backend entry point (if expanding Tauri hooks)
│
├── vite.config.js               # Vite bundler configuration
└── package.json                 # Dependencies & Build Scripts
```

---

## 🧩 Core UI Components

The `WellbeingDashboard.jsx` file contains several heavily customized components:

- **`TopNav` / Header:** Shows the live tracking pulse and session timer. Let's you switch between Live and Historical tracking days.
- **`DateNavigator`:** A horizontal strip of dates. Days with recorded `.db` data glow green.
- **`DonutChart`:** A highly complex, dependency-free SVG Donut Chart that plots App Category times and gracefully handles layout shifts.
- **`HourlyBar`:** A 24-piece bar chart component that visualizes activity intensity, highlighting the peak focus hour of the day.
- **`StatPill` & `RadialProgress`:** Visual indicators for Key Performance Metrics, animating numbers up from 0 to their final value on mount using the `useCountUp()` custom hook.

---

## 🔌 API & Backend Communication

Because Tauri runs in a separate process from our Python telemetry watcher, the Frontend operates basically as a disconnected client that relies on a local API port.

- The Python backend exposes HTTP endpoints (e.g. `http://localhost:7432/api/wellbeing`).
- `WellbeingDashboard.jsx` uses `fetch()` inside `useEffect` hooks to poll this data.
- **Auto-Refresh:** On the active (current) day, the dashboard will silently poll the API every 60 seconds to inject live usage statistics across the charts without disrupting the user's hovering or scrolling.

## 🛠️ Developer Commands

Ensure you are inside the `frontend/` directory before running these commands. You must have **Node.js** and **Rust** installed on your system to use Tauri commands.

**Install Dependencies:**
```bash
npm install
```

**Run React (Web Only):**
*Useful for rapid UI prototyping, but it will fail to connect if the python backend isn't running.*
```bash
npm run dev
```

**Run Tauri (Desktop Native Test):**
*Compiles the Rust binary and launches the actual native Windows `.exe` frame.*
```bash
npm run tauri:dev
```

**Build Final Installer:**
*Produces the final `.exe` installer (found in `src-tauri\target\release\bundle\nsis`).* Note that deploying the full app is best handled via the root `build.ps1` script so the python engine is packaged and injected cleanly before Tauri compiles.
```bash
npm run tauri:build
```

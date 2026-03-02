// ─── CATEGORY COLORS ─────────────────────────────────────────────────────────
export const CATEGORY_COLORS = {
  productive: { primary: "#34d399", glow: "rgba(52,211,153,0.28)", bg: "rgba(52,211,153,0.09)", grad: "linear-gradient(135deg,#34d399,#059669)" },
  communication: { primary: "#38bdf8", glow: "rgba(56,189,248,0.28)", bg: "rgba(56,189,248,0.09)", grad: "linear-gradient(135deg,#38bdf8,#0284c7)" },
  entertainment: { primary: "#fb7185", glow: "rgba(251,113,133,0.28)", bg: "rgba(251,113,133,0.09)", grad: "linear-gradient(135deg,#fb7185,#e11d48)" },
  system: { primary: "#c084fc", glow: "rgba(192,132,252,0.28)", bg: "rgba(192,132,252,0.09)", grad: "linear-gradient(135deg,#c084fc,#7c3aed)" },
  other: { primary: "#94a3b8", glow: "rgba(148,163,184,0.22)", bg: "rgba(148,163,184,0.07)", grad: "linear-gradient(135deg,#94a3b8,#475569)" },
  neutral: { primary: "#22d3ee", glow: "rgba(34,211,238,0.26)", bg: "rgba(34,211,238,0.08)", grad: "linear-gradient(135deg,#22d3ee,#0891b2)" },
  social: { primary: "#fb923c", glow: "rgba(251,146,60,0.26)", bg: "rgba(251,146,60,0.08)", grad: "linear-gradient(135deg,#fb923c,#c2410c)" },
};

// ─── APP ICON RESOLVER ────────────────────────────────────────────────────────

export const KNOWN_APP_EMOJIS = {
  "notepad.exe": "📝", "wordpad.exe": "📝",
  "mpc-hc.exe": "🎬", "mpv.exe": "🎬",
  "explorer.exe": "📁", "totalcmd.exe": "📁",
  "winscp.exe": "🔒", "putty.exe": "🖥",
  "powershell.exe": "🖥", "cmd.exe": "🖥",
  "windowsterminal.exe": "🖥", "wt.exe": "🖥",
  "taskmgr.exe": "⚙️", "control.exe": "⚙️", "regedit.exe": "⚙️",
};

export const CATEGORY_EMOJIS = {
  productive: "💼", communication: "💬", entertainment: "🎮", system: "⚙️", other: "📦",
};

export const BROWSER_EXES = new Set([
  "chrome.exe", "firefox.exe", "msedge.exe", "opera.exe", "brave.exe",
  "vivaldi.exe", "arc.exe", "zen.exe", "chromium.exe", "iexplore.exe"
]);

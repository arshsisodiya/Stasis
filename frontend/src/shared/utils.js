// ─── TIME FORMATTING ─────────────────────────────────────────────────────────
export function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtTimeLong(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) {
    const hs = `${h} hour${h > 1 ? "s" : ""}`;
    if (m === 0) return hs;
    return `${hs} ${m} minute${m !== 1 ? "s" : ""}`;
  }
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

export function fmtTimeFull(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── DATE UTILITIES ───────────────────────────────────────────────────────────
export function localYMD(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function yesterday(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return localYMD(d);
}

export function trendPct(today, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((today - prev) / prev) * 100);
}

// ─── APP ICON RESOLVER ────────────────────────────────────────────────────────
import { KNOWN_APP_EMOJIS, CATEGORY_EMOJIS } from "./constants";

export function resolveAppIcon(appName, category) {
  const key = appName.toLowerCase();
  const BASE = "http://127.0.0.1:7432"; // Standard backend port

  return {
    type: "backend",
    url: `${BASE}/api/app-icon/${appName}`,
    value: KNOWN_APP_EMOJIS[key] || CATEGORY_EMOJIS[category] || "📦"
  };
}

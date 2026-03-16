import { useState, useEffect, useRef } from "react";
import { CATEGORY_COLORS, KNOWN_APP_EMOJIS, CATEGORY_EMOJIS } from "./constants";
import { fmtTime, resolveAppIcon, localYMD } from "./utils";

// ─── SKELETON ─────────────────────────────────────────────────────────────────
export function Skeleton({ w = "100%", h = 20, r = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.6s infinite"
    }} />
  );
}

export function SkeletonCard() {
  return (
    <div style={{
      background: "rgba(15,18,34,0.7)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 16
    }}>
      <Skeleton w="40%" h={11} />
      <Skeleton w="60%" h={48} r={6} />
      <div style={{ display: "flex", gap: 10 }}>
        <Skeleton h={52} r={10} />
        <Skeleton h={52} r={10} />
      </div>
    </div>
  );
}

// ─── APP ICON ─────────────────────────────────────────────────────────────────
const ICON_CACHE = {}; // Memory cache for icons to prevent re-fetching on tab switch

export function AppIcon({ appName, category, size = 36 }) {
  const icon = resolveAppIcon(appName, category);
  const col = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  const [imgState, setImgState] = useState(ICON_CACHE[appName] ? "cached" : "primary");

  useEffect(() => {
    if (!ICON_CACHE[appName]) setImgState("primary");
    else setImgState("cached");
  }, [appName]);

  const showEmoji = icon.type === "emoji" || imgState === "error";

  // If it's a backend icon, we can pre-fetch and cache it as a data URL
  // but for now, standard browser cache + our imgState check is enough 
  // to avoid flicker. To truly avoid "calling the api", we'd fetch as blob.

  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: col.glow, border: `1px solid ${col.primary}44`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      fontSize: showEmoji ? Math.round(size * 0.5) : undefined, overflow: "hidden"
    }}>
      {showEmoji
        ? <span>{icon.value || "📦"}</span>
        : <img
          src={imgState === "cached" ? ICON_CACHE[appName] : (imgState === "primary" ? icon.url : icon.fallbackUrl)}
          alt="" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)}
          style={{ objectFit: "contain" }}
          onLoad={(e) => {
            if (imgState === "primary" && icon.type === "backend") {
              const canvas = document.createElement("canvas");
              canvas.width = e.target.naturalWidth;
              canvas.height = e.target.naturalHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(e.target, 0, 0);
              ICON_CACHE[appName] = canvas.toDataURL();
            }
          }}
          onError={() => setImgState(prev => prev === "primary" && icon.fallbackUrl ? "fallback" : "error")}
        />
      }
    </div>
  );
}

// ─── RADIAL PROGRESS ─────────────────────────────────────────────────────────
export function RadialProgress({ value, max = 100, size = 140, stroke = 10, color = "#4ade80", sublabel }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const a = value; // already animated by parent via useCountUp
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${(a / max) * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#f8fafc", fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>
          {a}{sublabel || "%"}
        </span>
      </div>
    </div>
  );
}

// ─── GRADIENT RADIAL PROGRESS ────────────────────────────────────────────────
// Renders a ring whose color transitions through colorStops based on value.
// colorStops: [{ at: 0, color: "#94a3b8" }, { at: 50, color: "#4ade80" }, ...]
let _gradUID = 0;
export function GradientRadialProgress({ value, max = 100, size = 140, stroke = 10, colorStops = [], sublabel }) {
  const [uid] = useState(() => `grad-radial-${++_gradUID}`);
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const pct = Math.min(value, max);

  // Interpolate the current color from colorStops based on value
  const interpolateColor = (val) => {
    if (!colorStops.length) return "#4ade80";
    if (val <= colorStops[0].at) return colorStops[0].color;
    if (val >= colorStops[colorStops.length - 1].at) return colorStops[colorStops.length - 1].color;
    for (let i = 0; i < colorStops.length - 1; i++) {
      const a = colorStops[i], b = colorStops[i + 1];
      if (val >= a.at && val <= b.at) {
        const t = (val - a.at) / (b.at - a.at);
        const ha = a.color.replace("#", ""), hb = b.color.replace("#", "");
        const ra = parseInt(ha.substring(0, 2), 16), ga = parseInt(ha.substring(2, 4), 16), ba2 = parseInt(ha.substring(4, 6), 16);
        const rb = parseInt(hb.substring(0, 2), 16), gb = parseInt(hb.substring(2, 4), 16), bb = parseInt(hb.substring(4, 6), 16);
        const rc = Math.round(ra + (rb - ra) * t), gc = Math.round(ga + (gb - ga) * t), bc = Math.round(ba2 + (bb - ba2) * t);
        return `#${rc.toString(16).padStart(2, "0")}${gc.toString(16).padStart(2, "0")}${bc.toString(16).padStart(2, "0")}`;
      }
    }
    return colorStops[colorStops.length - 1].color;
  };

  const mainColor = interpolateColor(pct);
  const gradStartColor = interpolateColor(Math.max(0, pct - 30));

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <defs>
          <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradStartColor} />
            <stop offset="100%" stopColor={mainColor} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${uid})`} strokeWidth={stroke}
          strokeDasharray={`${(pct / max) * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${mainColor})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: mainColor, fontFamily: "'DM Serif Display',serif", lineHeight: 1, transition: "color 0.4s ease" }}>
          {Math.round(pct)}{sublabel || "%"}
        </span>
      </div>
    </div>
  );
}

// ─── TREND BADGE ─────────────────────────────────────────────────────────────
export function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 6,
      background: up ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
      border: `1px solid ${up ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
      fontSize: 11, fontWeight: 600, color: up ? "#4ade80" : "#f87171"
    }}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

// ─── TREND CHIP ──────────────────────────────────────────────────────────────
// Richer comparison pill — shows human-readable delta like "+30m vs yesterday"
// mode: "time" | "pct" | "count"
// isPositiveGood: false for screen time (less is better), true for productivity/focus
export function TrendChip({ current, previous, mode = "time", isPositiveGood = true, label = "vs yesterday" }) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const delta = current - previous;
  if (delta === 0) return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8,
      background: "rgba(148,163,184,0.07)", border: "1px solid rgba(148,163,184,0.15)",
      fontSize: 10, fontWeight: 500, color: "#64748b"
    }}>— same as {label}</span>
  );

  const isUp = delta > 0;
  const isGood = isPositiveGood === (delta >= 0);
  const color = isGood ? "#34d399" : "#f87171";
  const bg = isGood ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)";
  const border = isGood ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)";

  let label_text = "";
  if (mode === "time") {
    const absDelta = Math.round(Math.abs(delta));
    const h = Math.floor(absDelta / 3600);
    const m = Math.floor((absDelta % 3600) / 60);
    label_text = `${isUp ? "+" : "−"}${h > 0 ? `${h}h ` : ""}${m}m`;
  } else if (mode === "pct") {
    // Show 1 decimal place if the change is very small (<1%)
    const absDelta = Math.abs(delta);
    const text = absDelta < 1 && absDelta > 0 ? absDelta.toFixed(1) : Math.round(absDelta).toString();
    label_text = `${isUp ? "+" : "−"}${text}%`;
  } else {
    label_text = `${isUp ? "+" : ""}${delta.toLocaleString()}`;
  }

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3.5px 10px", borderRadius: 20,
      background: bg, border: `1px solid ${border}`,
      fontSize: 10, fontWeight: 700, color, letterSpacing: "-0.01em",
      transition: "background 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      animation: "legend-slide-in 0.4s ease forwards",
      cursor: "default", userSelect: "none"
    }}>
      <span style={{ fontSize: 9 }}>{isUp ? "▲" : "▼"}</span>
      {label_text} <span style={{ opacity: 0.75, fontWeight: 500 }}>{label}</span>
    </span>
  );
}

// ─── GOAL STATUS BLOCK ──────────────────────────────────────────────────────
export function GoalStatusBlock({
  hasGoal = false,
  goalMet = false,
  goalLabel = "",
  goalDelta = "",
  minHeight = 36,
  onEditGoal,
  streak7 = [],
  currentStreak = 0,
  emptyTitle = "",
  emptyHint = "",
  onCreateGoal,
}) {
  const containerStyle = {
    width: "100%",
    minHeight,
    marginTop: 5,
    display: "flex",
    alignItems: "stretch",
  };

  if (!hasGoal) {
    if (!emptyTitle || !onCreateGoal) return null;

    return (
      <div style={containerStyle}>
        <button
          onClick={onCreateGoal}
          style={{
            width: "100%",
            border: "1px dashed rgba(148,163,184,0.16)",
            background: "rgba(148,163,184,0.03)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 700, letterSpacing: "0.01em" }}>
            {emptyTitle}
          </span>
          <span style={{ fontSize: 10, color: "#64748b" }}>
            {emptyHint}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5 }}>
        <button
          onClick={onEditGoal}
          style={{
            border: `1px solid ${goalMet ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
            background: goalMet ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
            borderRadius: 10,
            width: "100%",
            minHeight,
            padding: "5px 9px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            {goalLabel}
          </span>
          <span style={{ fontSize: 10, color: goalMet ? "#4ade80" : "#f87171", fontWeight: 700 }}>
            {goalDelta}
          </span>
        </button>

        <div style={{
          width: "100%",
          borderRadius: 9,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}>
          <span style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, whiteSpace: "nowrap" }}>
            7-Day Streak
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1, justifyContent: "center" }}>
            {(Array.isArray(streak7) ? streak7 : []).slice(0, 7).map((s, idx) => {
              const dot = s === true ? "#4ade80" : s === false ? "#f87171" : "#334155";
              return (
                <div key={idx} style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: dot,
                  boxShadow: s === true ? "0 0 7px rgba(74,222,128,0.8)" : "none",
                  opacity: s === null ? 0.65 : 1,
                  flexShrink: 0,
                }} />
              );
            })}
          </div>
          <span style={{
            fontSize: 9,
            color: currentStreak > 0 ? "#fbbf24" : "#64748b",
            fontWeight: 700,
            fontFamily: "'DM Mono',monospace",
            whiteSpace: "nowrap",
          }}>
            {currentStreak > 0 ? `${currentStreak}d` : "0d"}
          </span>
        </div>
      </div>
    </div>
  );
}


// ─── SECTION CARD ─────────────────────────────────────────────────────────────
export function SectionCard({ title, children, style = {}, className = "", ...props }) {
  return (
    <div className={className} {...props} style={{
      background: "rgba(15,18,34,0.95)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24, padding: "24px", ...style
    }}>
      {title && <div style={{
        fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase",
        letterSpacing: "0.15em", marginBottom: 18
      }}>{title}</div>}
      {children}
    </div>
  );
}

// ─── STAT PILL ────────────────────────────────────────────────────────────────
export function StatPill({ icon, label, value, color = "#4ade80", trend }) {
  return (
    <div style={{
      background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}33`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", lineHeight: 1, fontFamily: "'DM Serif Display',serif" }}>{value}</div>
          {trend !== undefined && trend !== null && <TrendBadge pct={trend} />}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      </div>
    </div>
  );
}

// ─── TAB PANEL (animated) ─────────────────────────────────────────────────────
export function TabPanel({ active, children }) {
  const [render, setRender] = useState(active);
  const [visible, setVisible] = useState(active);
  useEffect(() => {
    if (active) { setRender(true); requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true))); }
    else { setVisible(false); const t = setTimeout(() => setRender(false), 300); return () => clearTimeout(t); }
  }, [active]);
  if (!render) return null;
  return (
    <div style={{
      opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)",
      transition: "opacity 0.28s ease, transform 0.28s ease"
    }}>
      {children}
    </div>
  );
}

// ─── CATEGORY CHIP ────────────────────────────────────────────────────────────
const CATEGORY_CHIP_EMOJI = {
  productive: "💼", communication: "💬", entertainment: "🎮",
  system: "⚙️", other: "📦", neutral: "🌐", social: "📣",
};
const fmtSub = (sub) =>
  (sub || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || null;
const SUB_EMOJI = {
  coding: "⌨️", learning: "📚", office: "📄", design: "🎨",
  video_editing: "🎬", content_creation: "🎙️", development_tools: "🔧",
  browser: "🌐", music: "🎵", video_player: "▶️", streaming: "📺",
  gaming: "🕹️", messaging: "💬", community: "👥", work_chat: "💼",
  video_calls: "📹", email: "📧", social_media: "📱",
  file_manager: "📁", system_tools: "⚙️", networking: "🤝",
  reading: "📖", ai_tools: "🤖", video: "📺",
};

export function CategoryChip({ main, sub }) {
  const [hov, setHov] = useState(false);
  const col = CATEGORY_COLORS[main] || CATEGORY_COLORS.other;
  const emoji = CATEGORY_CHIP_EMOJI[main] || "📦";
  const label = main || "other";
  const subLabel = fmtSub(sub);
  const subEmoji = SUB_EMOJI[sub] || "•";
  return (
    <span style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 10, fontWeight: 600, textTransform: "capitalize",
        padding: "2px 8px", borderRadius: 20,
        background: col.bg,
        border: `1px solid ${hov && subLabel ? col.primary + "60" : col.primary + "30"}`,
        color: col.primary, letterSpacing: "0.02em", flexShrink: 0,
        transition: "border-color 0.18s, box-shadow 0.18s",
        boxShadow: hov && subLabel ? `0 0 0 3px ${col.primary}14` : "none",
      }}>
        <span style={{ fontSize: 10 }}>{emoji}</span>
        {label}
      </span>
      {hov && subLabel && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 7px)", left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(8, 11, 20, 0.97)",
          border: `1px solid ${col.primary}40`,
          borderRadius: 8, padding: "5px 10px", zIndex: 200,
          whiteSpace: "nowrap", pointerEvents: "none",
          boxShadow: `0 6px 24px rgba(0,0,0,0.2), 0 0 0 1px ${col.primary}18`,
          animation: "center-fade-in 0.13s ease both",
        }}>
          <span style={{
            position: "absolute", top: "100%", left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: `5px solid ${col.primary}40`,
          }} />
          <span style={{ fontSize: 10, color: col.primary, fontWeight: 700 }}>
            {subEmoji}&nbsp;{subLabel}
          </span>
        </span>
      )}
    </span>
  );
}

// ─── HOURLY BAR ──────────────────────────────────────────────────────────────
export function HourlyBar({ data, peakHour, BASE, selectedDate }) {
  const max = Math.max(...data, 1);
  const [tip, setTip] = useState(null);
  const nowHour = new Date().getHours();
  const lbl = i => i === 0 ? "12 am" : i === 12 ? "12 pm" : i < 12 ? `${i} am` : `${i - 12} pm`;

  // Live clock — fractional hour position for "now" needle
  const isToday = selectedDate === localYMD();
  const [nowFrac, setNowFrac] = useState(() => {
    const n = new Date(); return n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600;
  });
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const n = new Date();
      setNowFrac(n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600);
    };
    const iv = setInterval(tick, 15000); // update every 15s — no flicker
    return () => clearInterval(iv);
  }, [isToday]);

  // Per-hour app breakdown from session data
  const [hourlyApps, setHourlyApps] = useState({});
  const fetchedRef = useRef(null);

  useEffect(() => {
    if (!BASE || !selectedDate) return;

    // Only use ref to prevent duplicate fetches on same render, 
    // but we WANT to re-fetch if it's the current day and data refreshed.
    const isToday = selectedDate === localYMD();
    if (fetchedRef.current === selectedDate && !isToday) return;

    fetchedRef.current = selectedDate;
    fetch(`${BASE}/api/hourly-stats?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => {
        setHourlyApps(d);
      })
      .catch(() => { });
  }, [BASE, selectedDate, data?.length]); // Add 'data.length' to re-fetch when hourly totals update (polling)

  return (
    <div style={{ position: "relative" }}>
      {tip !== null && (() => {
        const mins = data[tip];
        const idleMins = 60 - mins;
        const pctOfMax = max > 0 ? Math.round((mins / max) * 100) : 0;
        const tipStr = tip.toString().padStart(2, "0");
        const displayApps = (mins > 0 && hourlyApps[tipStr]) ? hourlyApps[tipStr] : [];
        return (
          <div style={{
            position: "absolute", bottom: 90,
            left: `clamp(60px,calc(${(tip / 24) * 100}% + ${100 / 24 / 2}%),calc(100% - ${displayApps.length > 0 ? 140 : 60}px))`,
            transform: "translateX(-50%)", background: "rgba(12,15,28,0.97)",
            border: "1px solid rgba(74,222,128,0.35)", borderRadius: 10, padding: "10px 16px",
            pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            display: "flex", gap: displayApps.length > 0 ? 14 : 0, alignItems: "flex-start"
          }}>
            <div style={{ minWidth: 110 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>{lbl(tip)}</div>
                <div style={{ fontSize: 9, color: "#475569", marginLeft: 10 }}>{lbl(tip)} → {lbl((tip + 1) % 24)}</div>
              </div>
              <div style={{ fontSize: 16, color: "#f8fafc", fontWeight: 700, marginBottom: 4 }}>
                {mins > 0 ? `${mins} min active` : "No activity"}
              </div>
              {mins > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      background: "linear-gradient(90deg, #4ade80, #22d3ee)",
                      width: `${pctOfMax}%`,
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 9, color: "#4ade8099" }}>{pctOfMax}% of peak</span>
                    <span style={{ fontSize: 9, color: "#475569" }}>{idleMins}m idle</span>
                  </div>
                </div>
              )}
              {tip === peakHour && <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 2 }}>⭐ Peak hour</div>}
              {tip === nowHour && tip !== peakHour && <div style={{ fontSize: 10, color: "#4ade80", marginTop: 2 }}>◉ Current hour</div>}
            </div>
            {displayApps.length > 0 && (
              <>
                <div style={{ width: 1, alignSelf: "stretch", background: "rgba(74,222,128,0.15)" }} />
                <div>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 600, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Top Apps</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {displayApps.map((app, idx) => (
                      <div key={app.app} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, width: 10, textAlign: "center", flexShrink: 0,
                          color: idx === 0 ? "#fbbf24" : idx === 1 ? "#94a3b8" : "#cd7f32"
                        }}>{idx + 1}</span>
                        <span style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 500, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {app.app.replace(".exe", "")}
                        </span>
                        <span style={{ fontSize: 9, color: "#475569", flexShrink: 0 }}>{fmtTime(app.active)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div style={{
              position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(45deg)",
              width: 10, height: 10, background: "rgba(12,15,28,0.97)",
              border: "1px solid rgba(74,222,128,0.35)", borderTop: "none", borderLeft: "none"
            }} />
          </div>
        );
      })()}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", zIndex: 1 }}>
          <span style={{ fontSize: 9, color: "#2d3f55", fontWeight: 500, whiteSpace: "nowrap", paddingRight: 4 }}>{max}m</span>
          <div style={{ flex: 1, height: 1, borderTop: "1px dashed rgba(255,255,255,0.07)" }} />
        </div>
        {/* ── Live "now" needle ── */}
        {isToday && (
          <div style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${(nowFrac / 24) * 100}%`,
            width: 1,
            background: "linear-gradient(180deg, rgba(74,222,128,0) 0%, #4ade80 35%, #4ade80 100%)",
            pointerEvents: "none", zIndex: 4,
          }}>
            <div style={{
              position: "absolute", top: 0, left: "50%",
              transform: "translate(-50%, -4px)",
              width: 7, height: 7, borderRadius: "50%",
              background: "#4ade80",
              boxShadow: "0 0 0 3px rgba(74,222,128,0.25)",
              animation: "now-pulse 2s ease-in-out infinite",
            }} />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72, padding: "0 2px" }}>
          {data.map((v, i) => {
            const h = max > 0 ? (v / max) * 68 : 2;
            const isNow = i === nowHour;
            const isPeak = i === peakHour && v > 0;
            const isHov = tip === i;
            return (
              <div key={i} onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  cursor: v > 0 ? "pointer" : "default", height: "100%", justifyContent: "flex-end"
                }}>
                {isPeak && !isHov && (
                  <div style={{
                    width: 4, height: 4, borderRadius: "50%", background: "#fbbf24",
                    boxShadow: "0 0 6px #fbbf24", marginBottom: 2, flexShrink: 0
                  }} />
                )}
                <div style={{
                  width: "100%", height: Math.max(h, 2), borderRadius: 3,
                  background: isHov ? "linear-gradient(180deg,#86efac,#4ade80)"
                    : isPeak ? "linear-gradient(180deg,#fcd34d,#f59e0b)"
                      : isNow ? "linear-gradient(180deg,#4ade80,#22c55e)"
                        : v > max * 0.6 ? "rgba(74,222,128,0.5)" : "rgba(255, 255, 255, 0.06)",
                  boxShadow: isHov ? "0 0 12px rgba(74,222,128,0.8)"
                    : isPeak ? "0 0 8px rgba(251,191,36,0.6)"
                      : isNow ? "0 0 8px rgba(74,222,128,0.6)" : "none",
                  transition: "height 0.8s cubic-bezier(0.34,1.56,0.64,1),background 0.15s",
                  transform: isHov ? "scaleY(1.06)" : "scaleY(1)", transformOrigin: "bottom"
                }} />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6 }}>
        {["12 am", "3 am", "6 am", "9 am", "12 pm", "3 pm", "6 pm", "9 pm"].map((l, i) => {
          const hourIdx = [0, 3, 6, 9, 12, 15, 18, 21][i];
          const isNowTick = nowHour >= hourIdx && nowHour < hourIdx + 3;
          return (
            <span key={i} style={{ fontSize: 10, color: isNowTick ? "#4ade8066" : "#e2e8f0", fontWeight: isNowTick ? 600 : 400 }}>{l}</span>
          );
        })}
      </div>
    </div>
  );
}

// ─── DONUT CSS ────────────────────────────────────────────────────────────────
export const DONUT_CSS = `
      @keyframes now-pulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(74,222,128,0.25); transform: translate(-50%, -4px) scale(1); }
        50%       { box-shadow: 0 0 0 6px rgba(74,222,128,0.08); transform: translate(-50%, -4px) scale(1.2); }
      }
      @keyframes center-fade-in {
        from {opacity: 0; transform: scale(0.88) translateY(4px); }
      to   {opacity: 1; transform: scale(1) translateY(0); }
  }
      @keyframes legend-slide-in {
        from {opacity: 0; transform: translateX(10px); }
      to   {opacity: 1; transform: translateX(0); }
  }
      @keyframes chip-pop-in {
        from {opacity: 0; transform: scale(0.85); }
      to   {opacity: 1; transform: scale(1); }
  }
      .donut-seg {
        transition: stroke-width 0.38s cubic-bezier(0.34,1.56,0.64,1), filter 0.38s ease, opacity 0.38s ease;
  }
      .donut-seg:not(.hov) {opacity: 0.88; }
      .donut-seg.hov       {opacity: 1; }
      .donut-seg.dimmed    {opacity: 0.38; }
      .cat-row {
        transition: background 0.28s cubic-bezier(0.4,0,0.2,1), border-color 0.28s cubic-bezier(0.4,0,0.2,1),
      transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease, opacity 0.28s ease;
  }
      .cat-row:hover {transform: translateX(4px) !important; }
      .cat-swatch {transition: box-shadow 0.28s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1); }
      .cat-row:hover .cat-swatch {transform: scale(1.35); }
      .cat-label, .cat-pct {transition: color 0.28s ease; }
      `;
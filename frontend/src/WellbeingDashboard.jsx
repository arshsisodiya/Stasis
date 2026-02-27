import { useState, useEffect, useRef, useCallback } from "react";
import SettingsPage from "./SettingsPage";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  productive: { primary: "#34d399", glow: "rgba(52,211,153,0.28)", bg: "rgba(52,211,153,0.09)", grad: "linear-gradient(135deg,#34d399,#059669)" },
  communication: { primary: "#38bdf8", glow: "rgba(56,189,248,0.28)", bg: "rgba(56,189,248,0.09)", grad: "linear-gradient(135deg,#38bdf8,#0284c7)" },
  entertainment: { primary: "#fb7185", glow: "rgba(251,113,133,0.28)", bg: "rgba(251,113,133,0.09)", grad: "linear-gradient(135deg,#fb7185,#e11d48)" },
  system: { primary: "#c084fc", glow: "rgba(192,132,252,0.28)", bg: "rgba(192,132,252,0.09)", grad: "linear-gradient(135deg,#c084fc,#7c3aed)" },
  other: { primary: "#94a3b8", glow: "rgba(148,163,184,0.22)", bg: "rgba(148,163,184,0.07)", grad: "linear-gradient(135deg,#94a3b8,#475569)" },
  neutral: { primary: "#22d3ee", glow: "rgba(34,211,238,0.26)", bg: "rgba(34,211,238,0.08)", grad: "linear-gradient(135deg,#22d3ee,#0891b2)" },
  social: { primary: "#fb923c", glow: "rgba(251,146,60,0.26)", bg: "rgba(251,146,60,0.08)", grad: "linear-gradient(135deg,#fb923c,#c2410c)" },
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtTimeFull(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function yesterday(dateStr) {
  const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
function trendPct(today, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((today - prev) / prev) * 100);
}

// ─── APP ICON RESOLVER (no backend needed) ───────────────────────────────────
// Maps known exe names → browser favicon URLs or emoji fallbacks
const KNOWN_APP_DOMAINS = {
  // Browsers
  "chrome.exe": "google.com", "firefox.exe": "mozilla.org", "msedge.exe": "microsoft.com",
  "opera.exe": "opera.com", "brave.exe": "brave.com", "vivaldi.exe": "vivaldi.com",
  "arc.exe": "arc.net", "zen.exe": "zen-browser.app", "chromium.exe": "chromium.org",
  "iexplore.exe": "microsoft.com",
  // Dev Tools
  "code.exe": "code.visualstudio.com", "cursor.exe": "cursor.sh",
  "pycharm64.exe": "jetbrains.com", "idea64.exe": "jetbrains.com",
  "webstorm64.exe": "jetbrains.com", "clion64.exe": "jetbrains.com",
  "rider64.exe": "jetbrains.com", "devenv.exe": "visualstudio.microsoft.com",
  "sublime_text.exe": "sublimetext.com", "notepad++.exe": "notepad-plus-plus.org",
  "androidstudio64.exe": "developer.android.com", "docker.exe": "docker.com",
  "docker desktop.exe": "docker.com", "postman.exe": "postman.com", "insomnia.exe": "insomnia.rest",
  "git-bash.exe": "git-scm.com", "git.exe": "git-scm.com", "gitkraken.exe": "gitkraken.com", "sourcetree.exe": "sourcetreeapp.com",
  // Office & Productivity
  "winword.exe": "office.com", "excel.exe": "office.com",
  "powerpnt.exe": "office.com", "onenote.exe": "onenote.com",
  "outlook.exe": "outlook.com", "teams.exe": "teams.microsoft.com",
  "notion.exe": "notion.so", "obsidian.exe": "obsidian.md",
  // Communication
  "slack.exe": "slack.com", "discord.exe": "discord.com", "telegram.exe": "telegram.org",
  "whatsapp.exe": "whatsapp.com", "signal.exe": "signal.org", "skype.exe": "skype.com",
  "zoom.exe": "zoom.us", "thunderbird.exe": "thunderbird.net",
  // Design & Media
  "figma.exe": "figma.com", "photoshop.exe": "adobe.com", "illustrator.exe": "adobe.com",
  "premiere.exe": "adobe.com", "xd.exe": "adobe.com", "obs64.exe": "obsproject.com", "obs32.exe": "obsproject.com",
  // Entertainment
  "spotify.exe": "spotify.com", "vlc.exe": "videolan.org", "steam.exe": "steampowered.com",
  "epicgameslauncher.exe": "epicgames.com", "battle.net.exe": "blizzard.com", "origin.exe": "origin.com",
  // Password Managers
  "1password.exe": "1password.com", "bitwarden.exe": "bitwarden.com",
  // Misc
  "github.exe": "github.com",
};

const KNOWN_APP_EMOJIS = {
  "notepad.exe": "📝", "wordpad.exe": "📝",
  "mpc-hc.exe": "🎬", "mpv.exe": "🎬",
  "explorer.exe": "📁", "totalcmd.exe": "📁",
  "winscp.exe": "🔒", "putty.exe": "🖥",
  "powershell.exe": "🖥", "cmd.exe": "🖥",
  "windowsterminal.exe": "🖥", "wt.exe": "🖥",
  "taskmgr.exe": "⚙️", "control.exe": "⚙️", "regedit.exe": "⚙️",
};

// Category fallback emojis
const CATEGORY_EMOJIS = {
  productive: "💼", communication: "💬", entertainment: "🎮", system: "⚙️", other: "📦",
};

function resolveAppIcon(appName, category) {
  const key = appName.toLowerCase();
  const domain = KNOWN_APP_DOMAINS[key];
  if (domain) return { type: "favicon", url: `https://logo.clearbit.com/${domain}?size=128`, fallbackUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` };
  const emoji = KNOWN_APP_EMOJIS[key];
  if (emoji) return { type: "emoji", value: emoji };
  return { type: "emoji", value: CATEGORY_EMOJIS[category] || "📦" };
}

function AppIcon({ appName, category, size = 36 }) {
  const icon = resolveAppIcon(appName, category);
  const col = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  const [imgState, setImgState] = useState("primary");

  useEffect(() => {
    setImgState("primary");
  }, [appName]);

  const showEmoji = icon.type === "emoji" || imgState === "error";

  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: col.glow, border: `1px solid ${col.primary}44`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      fontSize: showEmoji ? Math.round(size * 0.5) : undefined, overflow: "hidden"
    }}>
      {showEmoji
        ? <span>{icon.value || "📦"}</span>
        : <img src={imgState === "primary" ? icon.url : icon.fallbackUrl} alt="" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)}
          style={{ objectFit: "contain" }} onError={() => setImgState(prev => prev === "primary" && icon.fallbackUrl ? "fallback" : "error")} />
      }
    </div>
  );
}

// ─── HOOKS ───────────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1400, key = "") {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0); // reset immediately on key change
    let start = null;
    let raf;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      // spring-like easing: ease-out cubic
      setValue(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) { raf = requestAnimationFrame(step); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, key]);
  return value;
}

function useLiveClock(selectedDate) {
  const [elapsed, setElapsed] = useState(0);
  const isToday = selectedDate === new Date().toISOString().split("T")[0];
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const now = new Date();
      setElapsed(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [isToday]);
  return { elapsed, isToday };
}

// ─── SKELETON ────────────────────────────────────────────────────────────────
function Skeleton({ w = "100%", h = 20, r = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.6s infinite"
    }} />
  );
}

function SkeletonCard() {
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

// ─── RADIAL PROGRESS ─────────────────────────────────────────────────────────
function RadialProgress({ value, max = 100, size = 140, stroke = 10, color = "#4ade80", sublabel }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, a = useCountUp(value);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${(a / max) * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 0.1s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#f8fafc", fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>
          {a}{sublabel || "%"}
        </span>
      </div>
    </div>
  );
}

// ─── DONUT CHART ─────────────────────────────────────────────────────────────
const DONUT_CSS = `
  @keyframes center-fade-in {
    from { opacity: 0; transform: scale(0.88) translateY(4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes legend-slide-in {
    from { opacity: 0; transform: translateX(10px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes chip-pop-in {
    from { opacity: 0; transform: scale(0.85); }
    to   { opacity: 1; transform: scale(1); }
  }
  .donut-seg {
    transition:
      stroke-width 0.38s cubic-bezier(0.34,1.56,0.64,1),
      filter       0.38s ease,
      opacity      0.38s ease;
  }
  .donut-seg:not(.hov) { opacity: 0.88; }
  .donut-seg.hov       { opacity: 1; }
  .donut-seg.dimmed    { opacity: 0.38; }
  .cat-row {
    transition:
      background   0.28s cubic-bezier(0.4,0,0.2,1),
      border-color 0.28s cubic-bezier(0.4,0,0.2,1),
      transform    0.28s cubic-bezier(0.34,1.56,0.64,1),
      box-shadow   0.28s ease,
      opacity      0.28s ease;
  }
  .cat-row:hover { transform: translateX(4px) !important; }
  .cat-swatch {
    transition: box-shadow 0.28s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
  }
  .cat-row:hover .cat-swatch { transform: scale(1.35); }
  .cat-label, .cat-pct { transition: color 0.28s ease; }
`;

function DonutChart({ data, total, appsByCategory }) {
  const [hovered, setHovered] = useState(null);
  const clearTimer = useRef(null);

  const setHov = (cat) => {
    clearTimeout(clearTimer.current);
    setHovered(cat);
  };
  const clearHov = () => {
    clearTimer.current = setTimeout(() => setHovered(null), 80);
  };

  const size = 200, stroke = 30, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  const GAP = 3;
  // Filter out trivial categories (< 60s) — they clutter the chart with near-0% slices
  const MIN_SECS = 60;
  const segments = Object.entries(data)
    .filter(([, secs]) => secs >= MIN_SECS)
    .sort(([, a], [, b]) => b - a)          // largest slice first for visual clarity
    .map(([cat, secs]) => {
      const pct = total > 0 ? secs / total : 0;
      const dash = Math.max(pct * circ - GAP, 0);
      const seg = { cat, secs, pct, offset, dash };
      offset += pct * circ;
      return seg;
    });

  const active = hovered ? segments.find(s => s.cat === hovered) : null;
  const activeCol = active ? (CATEGORY_COLORS[active.cat] || CATEGORY_COLORS.other) : null;

  return (
    <>
      <style>{DONUT_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 36, flexWrap: "wrap" }}>

        {/* SVG Donut */}
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size}
            style={{ transform: "rotate(-90deg)", overflow: "visible" }}
            onMouseLeave={clearHov}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="rgba(255, 255, 255, 0.04)" strokeWidth={stroke} />
            {segments.map((seg, i) => {
              const col = CATEGORY_COLORS[seg.cat] || CATEGORY_COLORS.other;
              const isHov = hovered === seg.cat;
              const isDim = hovered && !isHov;
              return (
                <circle key={seg.cat}
                  cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke={col.primary}
                  strokeWidth={isHov ? stroke + 6 : stroke}
                  strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
                  strokeDashoffset={-seg.offset}
                  strokeLinecap="round"
                  className={`donut-seg${isHov ? " hov" : isDim ? " dimmed" : ""}`}
                  onMouseEnter={() => setHov(seg.cat)}
                  style={{
                    filter: isHov
                      ? `drop-shadow(0 0 10px ${col.primary}) drop-shadow(0 0 20px ${col.primary}66)`
                      : "none",
                    cursor: "pointer",
                  }} />
              );
            })}
          </svg>

          {/* Center label */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none"
          }}>
            {active ? (
              <div key={active.cat}
                style={{ textAlign: "center", animation: "center-fade-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: activeCol.primary, marginBottom: 3
                }}>{active.cat}</div>
                <div style={{
                  fontSize: 26, fontWeight: 700, color: "#f8fafc",
                  fontFamily: "'DM Serif Display',serif", lineHeight: 1
                }}>{Math.round(active.pct * 100)}%</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{fmtTime(active.secs)}</div>
              </div>
            ) : (
              <div key="total"
                style={{ textAlign: "center", animation: "center-fade-in 0.22s ease both" }}>
                <div style={{ fontSize: 10, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Total</div>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: "#f8fafc",
                  fontFamily: "'DM Serif Display',serif", lineHeight: 1
                }}>{fmtTime(total)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 170 }}>
          {segments.map((seg, i) => {
            const col = CATEGORY_COLORS[seg.cat] || CATEGORY_COLORS.other;
            const apps = appsByCategory[seg.cat] || [];
            const isHov = hovered === seg.cat;
            const isDim = hovered && !isHov;
            return (
              <div key={seg.cat}
                className="cat-row"
                onMouseEnter={() => setHov(seg.cat)}
                onMouseLeave={clearHov}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "9px 12px", borderRadius: 12, cursor: "pointer",
                  background: isHov ? col.bg : `${col.primary}08`,
                  border: `1px solid ${isHov ? col.primary + "50" : col.primary + "1a"}`,
                  boxShadow: isHov ? `0 4px 16px ${col.primary}20, inset 0 0 0 1px ${col.primary}28` : "none",
                  opacity: isDim ? 0.45 : 1,
                  animation: `legend-slide-in 0.32s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.06}s both`,
                }}>

                <div className="cat-swatch" style={{
                  width: 11, height: 11, borderRadius: 4, flexShrink: 0,
                  background: col.grad || col.primary,
                  boxShadow: isHov ? `0 0 12px ${col.primary}` : `0 0 5px ${col.primary}55`,
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="cat-label" style={{
                      fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                      color: isHov ? col.primary : `${col.primary}dd`,
                    }}>{seg.cat}</span>
                    <span className="cat-pct" style={{
                      fontSize: 13, fontWeight: 700, fontFamily: "'DM Serif Display',serif",
                      color: isHov ? col.primary : `${col.primary}aa`,
                    }}>{Math.round(seg.pct * 100)}%</span>
                  </div>

                  <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", marginTop: 5, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4, width: `${Math.round(seg.pct * 100)}%`,
                      background: col.grad || col.primary,
                      boxShadow: `0 0 6px ${col.primary}66`,
                      transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1)",
                    }} />
                  </div>

                  <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>{fmtTime(seg.secs)}</div>

                  {isHov && apps.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {apps.slice(0, 4).map((a, ci) => (
                        <span key={a.app} style={{
                          fontSize: 10, background: `${col.primary}14`, borderRadius: 5,
                          padding: "2px 8px", border: `1px solid ${col.primary}28`,
                          color: `${col.primary}cc`,
                          animation: `chip-pop-in 0.18s cubic-bezier(0.34,1.56,0.64,1) ${ci * 0.04}s both`,
                        }}>
                          {a.app.replace(".exe", "")} · {fmtTime(a.active)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}


// ─── HOURLY BAR ──────────────────────────────────────────────────────────────
function HourlyBar({ data, peakHour }) {
  const max = Math.max(...data, 1);
  const [tip, setTip] = useState(null);
  const nowHour = new Date().getHours();
  const lbl = i => i === 0 ? "12 AM" : i === 12 ? "12 PM" : i < 12 ? `${i} AM` : `${i - 12} PM`;
  return (
    <div style={{ position: "relative" }}>
      {tip !== null && (
        <div style={{
          position: "absolute", bottom: 90,
          left: `clamp(50px,calc(${(tip / 24) * 100}% + ${100 / 24 / 2}%),calc(100% - 50px))`,
          transform: "translateX(-50%)", background: "rgba(12,15,28,0.97)",
          border: "1px solid rgba(74,222,128,0.35)", borderRadius: 10, padding: "8px 14px",
          pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
        }}>
          <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 600, marginBottom: 2 }}>{lbl(tip)}</div>
          <div style={{ fontSize: 14, color: "#f8fafc", fontWeight: 700 }}>{data[tip]} min active</div>
          {tip === peakHour && <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 3 }}>⭐ Peak hour</div>}
          {tip === nowHour && tip !== peakHour && <div style={{ fontSize: 10, color: "#4ade80", marginTop: 3 }}>◉ Current hour</div>}
          <div style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(45deg)",
            width: 10, height: 10, background: "rgba(12,15,28,0.97)",
            border: "1px solid rgba(74,222,128,0.35)", borderTop: "none", borderLeft: "none"
          }} />
        </div>
      )}

      {/* Y-axis max reference line */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", zIndex: 1 }}>
          <span style={{ fontSize: 9, color: "#2d3f55", fontWeight: 500, whiteSpace: "nowrap", paddingRight: 4 }}>{max}m</span>
          <div style={{ flex: 1, height: 1, borderTop: "1px dashed rgba(255,255,255,0.07)" }} />
        </div>
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
        {["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"].map((l, i) => {
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

// ─── TREND BADGE ─────────────────────────────────────────────────────────────
function TrendBadge({ pct }) {
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

// ─── CATEGORY CHIP ────────────────────────────────────────────────────────────
const CATEGORY_CHIP_EMOJI = {
  productive: "💼",
  communication: "💬",
  entertainment: "🎮",
  system: "⚙️",
  other: "📦",
  neutral: "🌐",
  social: "📣",
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
function CategoryChip({ main, sub }) {
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

// ─── APP ROW ─────────────────────────────────────────────────────────────────
function AppRow({ app, active, maxActive, main, sub, index, prevActive }) {
  const pct = maxActive > 0 ? (active / maxActive) * 100 : 0;
  const col = CATEGORY_COLORS[main] || CATEGORY_COLORS.other;
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  const trend = trendPct(active, prevActive);
  useEffect(() => { const t = setTimeout(() => setVis(true), 80 + index * 60); return () => clearTimeout(t); }, [index]);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 12,
        opacity: vis ? 1 : 0, transform: vis ? "translateX(0)" : "translateX(-20px)",
        transition: `opacity 0.4s ease ${index * 0.04}s, transform 0.4s ease ${index * 0.04}s, background 0.15s`,
        background: hov ? "rgba(255, 255, 255, 0.04)" : "transparent"
      }}>
      <AppIcon appName={app} category={main} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {app.replace(".exe", "")}
            </span>
            <CategoryChip main={main} sub={sub} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
            <TrendBadge pct={trend} />
            <span style={{ fontSize: 12, color: "#64748b" }}>{fmtTime(active)}</span>
          </div>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4,
            background: `linear-gradient(90deg,${col.primary},${col.primary}99)`,
            boxShadow: `0 0 6px ${col.primary}80`, width: `${pct}%`,
            transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1)"
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── STAT PILL ───────────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color = "#4ade80", trend }) {
  return (
    <div style={{
      background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, backdropFilter: "blur(10px)"
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

// ─── SECTION CARD ─────────────────────────────────────────────────────────────
function SectionCard({ title, children, style = {}, className = "" }) {
  return (
    <div className={className} style={{
      background: "rgba(15,18,34,0.7)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24, padding: "24px", backdropFilter: "blur(20px)", ...style
    }}>
      {title && <div style={{
        fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase",
        letterSpacing: "0.15em", marginBottom: 18
      }}>{title}</div>}
      {children}
    </div>
  );
}

// ─── DATE NAVIGATOR ───────────────────────────────────────────────────────────
function DateNavigator({ selectedDate, onChange, availableDates, heatmap }) {
  const today = new Date().toISOString().split("T")[0];
  const dateSet = new Set(availableDates);
  const sorted = [...availableDates].sort();
  const days = Array.from({ length: 14 }, (_, i) => {
    const we = new Date(selectedDate + "T12:00:00"); we.setDate(we.getDate() + 6);
    const ce = we > new Date(today + "T12:00:00") ? new Date(today + "T12:00:00") : we;
    const s = new Date(ce); s.setDate(s.getDate() - 13 + i);
    return s.toISOString().split("T")[0];
  });
  const prev = () => { const e = sorted.filter(d => d < selectedDate); if (e.length) onChange(e[e.length - 1]); };
  const next = () => { const l = sorted.filter(d => d > selectedDate && d <= today); if (l.length) onChange(l[0]); };
  const canP = sorted.some(d => d < selectedDate), canN = sorted.some(d => d > selectedDate && d <= today);

  // Derive heatmap dot color from per-date stats
  const dotColor = (d) => {
    const entry = heatmap?.[d];
    if (!entry) return null; // no data → empty circle
    const { screenTime, productivityPct } = entry;
    // intensity based on screen time (bucketed: <30m=dim, <2h=mid, >=2h=full)
    const intensity = screenTime < 1800 ? 0.4 : screenTime < 7200 ? 0.7 : 1.0;
    if (productivityPct >= 50) return `rgba(52,211,153,${intensity})`;   // emerald — productive
    if (productivityPct >= 25) return `rgba(251,191,36,${intensity})`;   // amber — mixed
    return `rgba(148,163,184,${intensity})`;                              // slate — low/neutral
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, background: "rgba(15,18,30,0.6)",
      border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "8px 12px", backdropFilter: "blur(20px)"
    }}>
      <button onClick={prev} disabled={!canP} style={{
        width: 26, height: 26, borderRadius: 7, border: "none", fontSize: 15, flexShrink: 0,
        background: canP ? "rgba(255, 255, 255, 0.06)" : "transparent", color: canP ? "#475569" : "rgba(255, 255, 255, 0.12)",
        cursor: canP ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center"
      }}>‹</button>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
        {days.map(d => {
          const has = dateSet.has(d), isSel = d === selectedDate, isT = d === today;
          const p = new Date(d + "T12:00:00");
          const dc = dotColor(d);
          const isGlowing = isSel && dc;
          return (
            <button key={d} onClick={() => has && onChange(d)} disabled={!has}
              title={!has ? "No data tracked" : undefined}
              style={{
                flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                padding: "5px 7px", borderRadius: 8, minWidth: 36,
                border: isSel ? "1px solid rgba(74,222,128,0.4)" : isT ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                background: isSel ? "rgba(74,222,128,0.12)" : "transparent", cursor: has ? "pointer" : "default",
                opacity: has ? 1 : 0.35, transition: "all 0.2s"
              }}>
              <span style={{ fontSize: 8, color: isSel ? "#4ade80" : "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                {p.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? "#4ade80" : has ? "#e2e8f0" : "rgba(255, 255, 255, 0.12)", lineHeight: 1.2 }}>
                {p.toLocaleDateString("en-US", { day: "numeric" })}
              </span>
              <span style={{ fontSize: 8, color: isSel ? "#4ade8088" : "#e2e8f0", textTransform: "uppercase" }}>
                {p.toLocaleDateString("en-US", { month: "short" })}
              </span>
              {/* Heatmap dot — colored by productivity intensity */}
              {has
                ? <div style={{
                  width: 6, height: 6, borderRadius: "50%", marginTop: 2,
                  background: dc || "rgba(74,222,128,0.4)",
                  boxShadow: isGlowing ? `0 0 8px ${dc}` : dc ? `0 0 4px ${dc}88` : "none",
                  transition: "background 0.3s, box-shadow 0.3s",
                }} />
                : <div style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 2, border: "1px solid rgba(255,255,255,0.12)", background: "transparent" }} />
              }
            </button>
          );
        })}
      </div>
      <button onClick={next} disabled={!canN} style={{
        width: 30, height: 30, borderRadius: 8, border: "none", fontSize: 16, flexShrink: 0,
        background: canN ? "rgba(255, 255, 255, 0.06)" : "transparent", color: canN ? "#475569" : "rgba(255, 255, 255, 0.12)",
        cursor: canN ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center"
      }}>›</button >
    </div >
  );
}

// ─── LIMIT WARNING BANNER ─────────────────────────────────────────────────────
function LimitWarningBanner({ limits, usage, onGoToLimits }) {
  const blocked = limits.filter(l => (usage[l.app_name] || 0) >= l.daily_limit_seconds && l.is_enabled);
  const warning = limits.filter(l => { const u = usage[l.app_name] || 0; return u >= l.daily_limit_seconds * 0.8 && u < l.daily_limit_seconds && l.is_enabled; });
  if (!blocked.length && !warning.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
      {blocked.map(l => (
        <div key={l.app_name} onClick={onGoToLimits}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 18px", borderRadius: 14, cursor: "pointer",
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
            animation: "banner-in 0.4s ease"
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>⛔</span>
            <div>
              <span style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>
                {l.app_name.replace(".exe", "")} blocked
              </span>
              <span style={{ fontSize: 12, color: "#475569", marginLeft: 8 }}>
                — daily limit of {fmtTime(l.daily_limit_seconds)} reached
              </span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: "#f87171", opacity: 0.7 }}>Manage →</span>
        </div>
      ))}
      {warning.map(l => {
        const u = usage[l.app_name] || 0, pct = Math.round((u / l.daily_limit_seconds) * 100);
        return (
          <div key={l.app_name} onClick={onGoToLimits}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 18px", borderRadius: 14, cursor: "pointer",
              background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)",
              animation: "banner-in 0.4s ease"
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>
                  {l.app_name.replace(".exe", "")}
                </span>
                <span style={{ fontSize: 12, color: "#475569", marginLeft: 8 }}>
                  — {pct}% of {fmtTime(l.daily_limit_seconds)} limit used ({fmtTime(u)} so far)
                </span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#fbbf24", opacity: 0.7 }}>Manage →</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── LIMIT RING ───────────────────────────────────────────────────────────────
function LimitRing({ used, limit, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const color = pct >= 1 ? "#f87171" : pct >= 0.8 ? "#fbbf24" : "#4ade80";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "'DM Serif Display',serif" }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  );
}

// ─── LIMIT CARD ───────────────────────────────────────────────────────────────
function LimitCard({ limit, onToggle, onEdit, onDelete, onUnblock, todayUsage, isBlocked }) {
  const [hov, setHov] = useState(false);
  const used = todayUsage[limit.app_name] || 0;
  const isOver = isBlocked;
  const isWarn = !isOver && used >= limit.daily_limit_seconds * 0.8;
  const pct = limit.daily_limit_seconds > 0 ? Math.min(used / limit.daily_limit_seconds, 1) : 0;
  const sc = isOver ? "#f87171" : isWarn ? "#fbbf24" : limit.is_enabled ? "#4ade80" : "#475569";
  const sl = isOver ? "Blocked" : isWarn ? "Warning" : limit.is_enabled ? "Active" : "Paused";
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(20,25,45,0.9)" : "rgba(15,18,34,0.7)",
        border: `1px solid ${isOver ? "rgba(248,113,113,0.25)" : isWarn ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 20, padding: "20px 22px", backdropFilter: "blur(20px)",
        transition: "all 0.2s ease", transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 8px 32px rgba(0,0,0,0.3)" : "none"
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: isOver ? "rgba(248,113,113,0.1)" : isWarn ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.08)",
            border: `1px solid ${sc}33`, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: sc
          }}>
            {limit.app_name.replace(".exe", "").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f8fafc", lineHeight: 1 }}>{limit.app_name.replace(".exe", "")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}` }} />
              <span style={{ fontSize: 11, color: sc, fontWeight: 500 }}>{sl}</span>
            </div>
          </div>
        </div>
        <LimitRing used={used} limit={limit.daily_limit_seconds} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#475569" }}>{fmtTime(used)} used</span>
          <span style={{ fontSize: 11, color: "#475569" }}>limit: {fmtTime(limit.daily_limit_seconds)}</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4, width: `${pct * 100}%`,
            background: isOver ? "linear-gradient(90deg,#f87171,#ef4444)" : isWarn ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#4ade80,#22d3ee)",
            boxShadow: `0 0 6px ${sc}80`, transition: "width 1s cubic-bezier(0.34,1.56,0.64,1)"
          }} />
        </div>
        {isOver && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>⛔ Daily limit reached — app is blocked</div>}
        {isWarn && !isOver && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6 }}>⚠️ Approaching daily limit</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onToggle(limit.app_name, !limit.is_enabled)}
          style={{
            flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
            fontFamily: "'DM Sans',sans-serif", background: limit.is_enabled ? "rgba(74,222,128,0.1)" : "rgba(255, 255, 255, 0.05)",
            color: limit.is_enabled ? "#4ade80" : "#64748b"
          }}>
          {limit.is_enabled ? "⏸ Pause" : "▶ Enable"}
        </button>
        <button onClick={() => onEdit(limit)}
          style={{
            flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: "rgba(96,165,250,0.1)", color: "#60a5fa", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>
          ✏️ Edit
        </button>
        {isOver && (
          <button onClick={() => onUnblock(limit.app_name)}
            style={{
              flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
              background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
            }}>
            🔓 Unblock
          </button>
        )}
        <button onClick={() => onDelete(limit.app_name)}
          style={{
            width: 34, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 13, fontFamily: "'DM Sans',sans-serif"
          }}>✕</button>
      </div>
    </div>
  );
}

// ─── LIMIT MODAL ──────────────────────────────────────────────────────────────
function LimitModal({ onClose, onSave, knownApps, editTarget }) {
  const [app, setApp] = useState(editTarget?.app_name || "");
  const [h, setH] = useState(editTarget ? Math.floor(editTarget.daily_limit_seconds / 3600) : "");
  const [m, setM] = useState(editTarget ? Math.floor((editTarget.daily_limit_seconds % 3600) / 60) : "");
  const [saving, setSaving] = useState(false);
  const secs = (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60;
  const ok = app.trim().length > 0 && secs > 0;
  const save = async () => {
    if (!ok) return; setSaving(true);
    const name = app.trim().toLowerCase().endsWith(".exe") ? app.trim() : app.trim() + ".exe";
    await onSave(name, secs); setSaving(false); onClose();
  };
  const inp = {
    background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
    color: "#f8fafc", padding: "10px 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: "none", width: "100%"
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)"
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "rgba(12,15,28,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24,
        padding: "32px", width: 420, maxWidth: "90vw", boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        animation: "modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", lineHeight: 1 }}>
              {editTarget ? "Edit Limit" : "Set App Limit"}
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Define daily usage boundary</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: "none",
            background: "rgba(255, 255, 255, 0.06)", color: "#64748b", cursor: "pointer", fontSize: 16
          }}>✕</button>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>App Name</div>
          <input value={app} onChange={e => setApp(e.target.value)} placeholder="e.g. chrome.exe"
            disabled={!!editTarget} style={{ ...inp, opacity: editTarget ? 0.5 : 1, cursor: editTarget ? "not-allowed" : "text" }}
            onFocus={e => e.target.style.border = "1px solid rgba(74,222,128,0.4)"}
            onBlur={e => e.target.style.border = "1px solid rgba(255,255,255,0.1)"} />
          {!editTarget && knownApps.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {knownApps.slice(0, 6).map(a => (
                <button key={a} onClick={() => setApp(a)}
                  style={{
                    padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif", border: "1px solid rgba(255,255,255,0.08)",
                    background: app === a ? "rgba(74,222,128,0.12)" : "rgba(255, 255, 255, 0.04)",
                    color: app === a ? "#4ade80" : "#64748b", transition: "all 0.15s"
                  }}>
                  {a.replace(".exe", "")}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Daily Limit</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input type="number" min="0" max="23" value={h} onChange={e => setH(e.target.value)} placeholder="0"
                style={{ ...inp, paddingRight: 36 }}
                onFocus={e => e.target.style.border = "1px solid rgba(74,222,128,0.4)"}
                onBlur={e => e.target.style.border = "1px solid rgba(255,255,255,0.1)"} />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569" }}>h</span>
            </div>
            <span style={{ color: "#e2e8f0", fontSize: 18 }}>:</span>
            <div style={{ flex: 1, position: "relative" }}>
              <input type="number" min="0" max="59" value={m} onChange={e => setM(e.target.value)} placeholder="0"
                style={{ ...inp, paddingRight: 36 }}
                onFocus={e => e.target.style.border = "1px solid rgba(74,222,128,0.4)"}
                onBlur={e => e.target.style.border = "1px solid rgba(255,255,255,0.1)"} />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569" }}>m</span>
            </div>
          </div>
          {secs > 0 && <div style={{ fontSize: 12, color: "#4ade80", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            Limit set to {fmtTime(secs)}
          </div>}
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick presets</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[[0, 30, "30m"], [1, 0, "1h"], [2, 0, "2h"], [3, 0, "3h"]].map(([ph, pm, label]) => (
              <button key={label} onClick={() => { setH(ph); setM(pm); }}
                style={{
                  padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255, 255, 255, 0.04)", color: "#64748b", fontSize: 12, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif"
                }}>{label}</button>
            ))}
          </div>
        </div>
        <button onClick={save} disabled={!ok || saving}
          style={{
            width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: ok ? "pointer" : "not-allowed",
            background: ok ? "linear-gradient(135deg,#4ade80,#22d3ee)" : "rgba(255, 255, 255, 0.05)",
            color: ok ? "#080b14" : "#e2e8f0", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
            boxShadow: ok ? "0 0 20px rgba(74,222,128,0.3)" : "none", transition: "all 0.2s"
          }}>
          {saving ? "Saving..." : (editTarget ? "Update Limit" : "Set Limit")}
        </button>
      </div>
    </div>
  );
}

// ─── UNBLOCK MODAL ────────────────────────────────────────────────────────────
function UnblockModal({ appName, onClose, onUnblock }) {
  const [mins, setMins] = useState(30);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)"
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "rgba(12,15,28,0.98)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 24,
        padding: "32px", width: 360, maxWidth: "90vw", boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        animation: "modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔓</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", marginBottom: 6 }}>Temporary Unblock</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Allow <strong style={{ color: "#fbbf24" }}>{appName.replace(".exe", "")}</strong> for how long?</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {[15, 30, 60, 120].map(opt => (
            <button key={opt} onClick={() => setMins(opt)}
              style={{
                padding: "14px", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s",
                border: `1px solid ${mins === opt ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.07)"}`,
                background: mins === opt ? "rgba(251,191,36,0.1)" : "rgba(255, 255, 255, 0.04)",
                color: mins === opt ? "#fbbf24" : "#64748b"
              }}>
              {opt < 60 ? `${opt} min` : `${opt / 60} hr`}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255, 255, 255, 0.04)",
            color: "#64748b", fontSize: 14, fontFamily: "'DM Sans',sans-serif"
          }}>Cancel</button>
          <button onClick={() => { onUnblock(appName, mins); onClose(); }}
            style={{
              flex: 1, padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#080b14",
              fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
              boxShadow: "0 0 20px rgba(251,191,36,0.3)"
            }}>Unblock</button>
        </div>
      </div>
    </div>
  );
}

// ─── LIMITS TAB ───────────────────────────────────────────────────────────────
function LimitsTab({ BASE, stats }) {
  const [limits, setLimits] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [view, setView] = useState("limits");
  const [loadingL, setLoadingL] = useState(true);
  const [toast, setToast] = useState(null);
  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});
  const showT = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const fetchAll = useCallback(async () => {
    try {
      const [lr, br] = await Promise.all([
        fetch(`${BASE}/limits/all`).then(r => r.json()),
        fetch(`${BASE}/limits/blocked`).then(r => r.json()),
      ]);
      setLimits(Array.isArray(lr) ? lr : []); setBlocked(Array.isArray(br) ? br : []);
    } catch (e) { setLimits([]); setBlocked([]); }
    setLoadingL(false);
  }, [BASE]);
  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 30_000); return () => clearInterval(iv); }, [fetchAll]);
  const save = async (name, secs) => { await fetch(`${BASE}/limits/set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, limit_seconds: secs }) }); await fetchAll(); showT(`Limit set for ${name.replace(".exe", "")}`); };
  const toggle = async (name, en) => { await fetch(`${BASE}/limits/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, enabled: en }) }); await fetchAll(); showT(en ? `Enabled` : `Paused`); };
  const del = async (name) => { await fetch(`${BASE}/limits/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name }) }); await fetchAll(); showT(`Limit removed`, "warn"); };
  const unblock = async (name, minutes) => { await fetch(`${BASE}/limits/unblock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, minutes }) }); await fetchAll(); showT(`Unblocked for ${minutes}m`, "warn"); };
  const knownApps = Array.from(new Set(stats.map(s => s.app))).filter(a => !limits.find(l => l.app_name === a));
  const blockedNow = limits.filter(l => blocked.includes(l.app_name) && l.is_enabled);
  const nearLimit = limits.filter(l => { const u = usage[l.app_name] || 0; return u >= l.daily_limit_seconds * 0.8 && u < l.daily_limit_seconds; });
  const displayList = view === "blocked" ? blockedNow : limits;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 200,
          background: toast.type === "warn" ? "rgba(251,191,36,0.12)" : "rgba(74,222,128,0.1)",
          border: `1px solid ${toast.type === "warn" ? "rgba(251,191,36,0.35)" : "rgba(74,222,128,0.3)"}`,
          borderRadius: 12, padding: "12px 20px", color: toast.type === "warn" ? "#fbbf24" : "#4ade80",
          fontSize: 13, fontWeight: 500, backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "modal-in 0.3s ease"
        }}>
          {toast.type === "warn" ? "⚠️ " : "✓ "}{toast.msg}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 4 }}>
          {[["limits", `All (${limits.length})`], ["blocked", `Blocked (${blockedNow.length})`]].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)}
              style={{
                padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                fontSize: 12, fontWeight: 500, background: view === v ? "rgba(74,222,128,0.1)" : "transparent", color: view === v ? "#4ade80" : "#475569"
              }}>
              {lbl}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditTarget(null); setShowModal(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12,
            border: "1px solid rgba(74,222,128,0.25)", cursor: "pointer", background: "rgba(74,222,128,0.08)",
            color: "#4ade80", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Limit
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {[{ color: "#4ade80", bg: "rgba(74,222,128,0.06)", border: "rgba(74,222,128,0.15)", label: "Active Limits", val: limits.filter(l => l.is_enabled).length, sub: `${limits.length} total configured` },
        { color: "#f87171", bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.15)", label: "Blocked Now", val: blockedNow.length, sub: "apps hit their limit today" },
        { color: "#fbbf24", bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.15)", label: "Near Limit", val: nearLimit.length, sub: "apps above 80% of limit" }
        ].map(({ color, bg, border, label, val, sub }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{val}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>
      {loadingL ? <div style={{ textAlign: "center", padding: "60px", color: "#e2e8f0", fontSize: 14 }}>Loading limits...</div>
        : displayList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 24px", background: "rgba(15,18,30,0.5)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{view === "blocked" ? "✅" : "🛡️"}</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#475569", marginBottom: 8 }}>
              {view === "blocked" ? "No apps blocked right now" : "No limits configured yet"}
            </div>
            <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 24 }}>
              {view === "blocked" ? "All apps are within their daily limits" : "Set limits to take control of your screen time"}
            </div>
            {view === "limits" && (
              <button onClick={() => { setEditTarget(null); setShowModal(true); }}
                style={{
                  padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(74,222,128,0.25)",
                  background: "rgba(74,222,128,0.08)", color: "#4ade80", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
                }}>+ Set your first limit</button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
            {displayList.map(l => (
              <LimitCard key={l.app_name} limit={l} onToggle={toggle}
                onEdit={t => { setEditTarget(t); setShowModal(true); }} onDelete={del}
                onUnblock={n => setUnblockTarget(n)} todayUsage={usage} isBlocked={blocked.includes(l.app_name)} />
            ))}
          </div>
        )}
      {view === "blocked" && blocked.length > 0 && (
        <SectionCard title="System Block List">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {blocked.map((b, i) => {
              const name = b.app_name || b;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 12
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 6px #f87171" }} />
                    <span style={{ fontSize: 14, color: "#f8fafc", fontWeight: 500 }}>{name.replace(".exe", "")}</span>
                  </div>
                  <button onClick={() => setUnblockTarget(name)}
                    style={{
                      padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
                    }}>
                    🔓 Unblock
                  </button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
      {showModal && <LimitModal onClose={() => { setShowModal(false); setEditTarget(null); }} onSave={save} knownApps={knownApps} editTarget={editTarget} />}
      {unblockTarget && <UnblockModal appName={unblockTarget} onClose={() => setUnblockTarget(null)} onUnblock={unblock} />}
    </div>
  );
}

// ─── ACTIVITY TAB ─────────────────────────────────────────────────────────────
function WeeklyTrendGraph({ BASE, onDayClick, activeDrillDate }) {
  const [trend, setTrend] = useState([]);
  const [hovIdx, setHovIdx] = useState(null);
  useEffect(() => {
    fetch(`${BASE}/api/weekly-trend`).then(r => r.json()).then(setTrend).catch(() => { });
  }, [BASE]);

  if (!trend.length) return (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontSize: 13 }}>
      Loading trend data…
    </div>
  );

  const W = 700, H = 140, PAD = { l: 48, r: 16, t: 16, b: 36 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
  const maxST = Math.max(...trend.map(d => d.screenTime), 1);
  const pts = trend.map((d, i) => ({
    x: PAD.l + (i / Math.max(trend.length - 1, 1)) * iW,
    y: PAD.t + iH - (d.screenTime / maxST) * iH,
    ...d
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${PAD.t + iH} L${pts[0].x.toFixed(1)},${PAD.t + iH} Z`;

  const fmtDate = d => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const fmtHr = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = PAD.t + iH * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" strokeDasharray="3 4" />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                style={{ fontSize: 9, fill: "#e2e8f0", fontFamily: "'DM Sans',sans-serif" }}>
                {fmtHr(maxST * f)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={area} fill="url(#trendGrad)" />

        {/* Trend line */}
        <path d={line} fill="none" stroke="url(#trendLine)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Productivity pct bars (secondary, subtle) */}
        {pts.map((p, i) => {
          const barH = (trend[i].productivityPct / 100) * iH;
          return (
            <rect key={i}
              x={p.x - 3} y={PAD.t + iH - barH}
              width={6} height={barH > 0 ? barH : 0}
              rx={2}
              fill={`rgba(52,211,153,${hovIdx === i ? 0.4 : 0.15})`}
              style={{ transition: "fill 0.2s" }}
            />
          );
        })}

        {/* Dots + hit areas */}
        {pts.map((p, i) => {
          const isActive = activeDrillDate === p.date;
          const isHov = hovIdx === i;
          return (
            <g key={i} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovIdx(i)}
              onMouseLeave={() => setHovIdx(null)}
              onClick={() => onDayClick(p.date)}>
              <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={isHov || isActive ? 6 : 4}
                fill={isActive ? "#34d399" : isHov ? "#22d3ee" : "#0f1222"}
                stroke={isHov || isActive ? "#34d399" : "#22d3ee"}
                strokeWidth={isHov || isActive ? 2.5 : 1.5}
                style={{ transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)" }} />
              {isActive && (
                <circle cx={p.x} cy={p.y} r={10} fill="none"
                  stroke="#34d399" strokeWidth="1" strokeOpacity="0.35" />
              )}
            </g>
          );
        })}

        {/* Date labels — show every other one to avoid crowding */}
        {pts.map((p, i) => i % 2 === 0 && (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle"
            style={{
              fontSize: 9, fill: activeDrillDate === p.date ? "#34d399" : "#e2e8f0",
              fontFamily: "'DM Sans',sans-serif", transition: "fill 0.2s"
            }}>
            {fmtDate(p.date)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hovIdx !== null && (() => {
        const d = trend[hovIdx];
        const p = pts[hovIdx];
        return (
          <div style={{
            position: "absolute",
            left: `${(p.x / W) * 100}%`,
            top: `${(p.y / H) * 100}%`,
            transform: "translate(-50%,-130%)",
            pointerEvents: "none",
            background: "rgba(8, 11, 20, 0.97)", border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 10, padding: "8px 12px", minWidth: 130,
            boxShadow: "0 6px 28px rgba(0, 0, 0, 0.55)",
            animation: "center-fade-in 0.15s ease both",
            zIndex: 10,
          }}>
            <div style={{ fontSize: 10, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>
              {fmtDate(d.date)}
            </div>
            <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600 }}>{fmtHr(d.screenTime)} tracked</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {d.productivityPct}% productive
            </div>
            <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 4 }}>Click to drill in →</div>
          </div>
        );
      })()}
    </div>
  );
}

function SessionTimeline({ BASE, date }) {
  const [catBlocks, setCatBlocks] = useState({});   // { cat: [{start, end, apps, active, keys, clicks}] }
  const [allCats, setAllCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hovBlock, setHovBlock] = useState(null); // { cat, block }
  const [dayStart, setDayStart] = useState(0);
  const [dayEnd, setDayEnd] = useState(1440);

  const MIN_BLOCK_SECS = 60; // ignore blocks under this duration

  useEffect(() => {
    setLoading(true);
    setHovBlock(null);
    fetch(`${BASE}/api/sessions?date=${date}`)
      .then(r => r.json())
      .then(rows => {
        /*
         * Algorithm:
         * 1. Walk rows chronologically
         * 2. Group consecutive ticks into a "category run" — if the category
         *    changes OR there is a >5-minute gap, start a new block.
         * 3. Within a block accumulate per-app stats for the tooltip.
         * 4. Drop any block shorter than MIN_BLOCK_SECS.
         */
        const GAP_MINS = 5;
        const byCategory = {}; // cat → [block]

        let currentCat = null;
        let currentBlock = null;

        for (const row of rows) {
          const ts = new Date(row.ts);
          const min = ts.getHours() * 60 + ts.getMinutes();
          const cat = row.cat || "other";

          const isSameCat = cat === currentCat;
          const isSmallGap = currentBlock && (min - currentBlock.endMin) <= GAP_MINS;

          if (isSameCat && isSmallGap) {
            // Extend current block
            currentBlock.endMin = min + Math.max(Math.round(row.active / 60), 1);
            currentBlock.active += row.active;
            currentBlock.keys += row.keys;
            currentBlock.clicks += row.clicks;
            // Accumulate per-app stats
            const appName = row.app.replace(".exe", "");
            currentBlock.apps[appName] = (currentBlock.apps[appName] || 0) + row.active;
          } else {
            // New block
            if (currentBlock && currentBlock.active >= MIN_BLOCK_SECS) {
              if (!byCategory[currentCat]) byCategory[currentCat] = [];
              byCategory[currentCat].push(currentBlock);
            }
            currentCat = cat;
            currentBlock = {
              startMin: min,
              endMin: min + Math.max(Math.round(row.active / 60), 1),
              active: row.active,
              keys: row.keys,
              clicks: row.clicks,
              apps: { [row.app.replace(".exe", "")]: row.active },
              id: Math.random(),
            };
          }
        }
        // Flush last block
        if (currentBlock && currentBlock.active >= MIN_BLOCK_SECS) {
          if (!byCategory[currentCat]) byCategory[currentCat] = [];
          byCategory[currentCat].push(currentBlock);
        }

        setCatBlocks(byCategory);

        // Category order: productive first, then by total active time
        const CAT_ORDER = ["productive", "neutral", "communication", "entertainment", "system", "social", "other"];
        const cats = Object.keys(byCategory).sort((a, b) => {
          const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return 0;
        });
        setAllCats(cats);

        // Compute visible day range
        const allMins = Object.values(byCategory).flat();
        if (allMins.length) {
          setDayStart(Math.max(0, Math.min(...allMins.map(b => b.startMin)) - 20));
          setDayEnd(Math.min(1440, Math.max(...allMins.map(b => b.endMin)) + 20));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [BASE, date]);

  if (loading) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontSize: 13 }}>
      Loading sessions…
    </div>
  );
  if (!allCats.length) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "#e2e8f0", fontSize: 13 }}>
      No session data tracked for this day
    </div>
  );

  const totalMin = dayEnd - dayStart || 1;
  const toX = min => ((min - dayStart) / totalMin) * 100;
  const fmtMin = min => {
    const h = Math.floor(min / 60), m = min % 60;
    const suffix = h < 12 ? "a" : "p";
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}${suffix}`;
  };

  // Hour ticks
  const hourTicks = [];
  for (let h = Math.ceil(dayStart / 60); h <= Math.floor(dayEnd / 60); h++) {
    if (h * 60 >= dayStart && h * 60 <= dayEnd) hourTicks.push(h);
  }

  const LABEL_W = 90; // px reserved for the left label column

  return (
    <div>
      {/* Header ruler */}
      <div style={{ display: "flex" }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: "relative", height: 20, marginBottom: 6 }}>
          {hourTicks.map(h => (
            <div key={h} style={{
              position: "absolute",
              left: `${toX(h * 60)}%`,
              top: 0, display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <div style={{ width: 1, height: 7, background: "rgba(255, 255, 255, 0.06)" }} />
              <span style={{ fontSize: 9, color: "#475569", marginTop: 2, whiteSpace: "nowrap" }}>
                {fmtMin(h * 60)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* One row per category */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {allCats.map(cat => {
          const col = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
          const blocks = catBlocks[cat] || [];
          const emoji = {
            productive: "💼", communication: "💬", entertainment: "🎮",
            system: "⚙️", neutral: "🌐", social: "📣", other: "📦"
          }[cat] || "•";

          return (
            <div key={cat} style={{ display: "flex", alignItems: "center" }}>
              {/* Row label */}
              <div style={{
                width: LABEL_W, flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                paddingRight: 10,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: col.grad || col.primary, flexShrink: 0 }} />
                <span style={{
                  fontSize: 10, color: col.primary, fontWeight: 600,
                  textTransform: "capitalize", whiteSpace: "nowrap",
                }}>
                  {emoji} {cat}
                </span>
              </div>

              {/* Timeline track */}
              <div style={{
                flex: 1, position: "relative", height: 28,
                background: "rgba(255, 255, 255, 0.02)", borderRadius: 6,
              }}>
                {blocks.map(block => {
                  const left = toX(block.startMin);
                  const width = Math.max(toX(block.endMin) - left, 0.4);
                  const isHov = hovBlock?.block?.id === block.id;

                  return (
                    <div
                      key={block.id}
                      onMouseEnter={() => setHovBlock({ cat, block })}
                      onMouseLeave={() => setHovBlock(null)}
                      style={{
                        position: "absolute",
                        left: `${left}%`, width: `${width}%`,
                        top: 3, bottom: 3, borderRadius: 4,
                        background: isHov
                          ? (col.grad || col.primary)
                          : `${col.primary}bb`,
                        boxShadow: isHov ? `0 0 12px ${col.primary}88` : "none",
                        transition: "all 0.15s ease",
                        cursor: "pointer",
                        display: "flex", alignItems: "center", overflow: "hidden",
                      }}
                    >
                      {/* Label inside block only if wide enough */}
                      {width > 6 && (
                        <span style={{
                          fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                          paddingLeft: 5, whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(15,18,34,0.7)",
                          letterSpacing: "0.02em",
                        }}>
                          {fmtTime(block.active)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — fixed under the chart */}
      {hovBlock && (() => {
        const { cat, block } = hovBlock;
        const col = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
        // Sort contributing apps by time
        const topApps = Object.entries(block.apps)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);

        return (
          <div style={{
            marginTop: 14, padding: "12px 16px",
            background: "rgba(8, 11, 20, 0.97)",
            border: `1px solid ${col.primary}40`,
            borderRadius: 14,
            boxShadow: `0 6px 28px rgba(0,0,0,0.2), 0 0 0 1px ${col.primary}18`,
            animation: "center-fade-in 0.14s ease both",
            display: "flex", gap: 16, alignItems: "flex-start",
          }}>
            {/* Left — block summary */}
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 11, color: col.primary, fontWeight: 700, textTransform: "capitalize", marginBottom: 4 }}>
                {cat}
              </div>
              <div style={{ fontSize: 13, color: "#f8fafc", fontWeight: 600 }}>
                {fmtTime(block.active)}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>
                {fmtMin(block.startMin)} → {fmtMin(block.endMin)}
              </div>
              <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 2 }}>
                {block.keys.toLocaleString()} keys · {block.clicks} clicks
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, alignSelf: "stretch", background: `${col.primary}25` }} />

            {/* Right — top apps that contributed */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Top apps
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {topApps.map(([app, secs]) => {
                  const pct = Math.round((secs / block.active) * 100);
                  return (
                    <div key={app} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 500, minWidth: 80 }}>
                        {app}
                      </span>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255, 255, 255, 0.06)", overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%", borderRadius: 2,
                          background: col.grad || col.primary,
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: "#475569", minWidth: 32, textAlign: "right" }}>
                        {fmtTime(secs)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ActivityTab({ BASE, selectedDate, data, stats, prevData, hourly, peakHour, countKey }) {
  const [drillDate, setDrillDate] = useState(null);
  const [drillHourly, setDrillHourly] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const activeDate = selectedDate;

  const handleDayClick = (date) => {
    if (drillDate === date) { setDrillDate(null); setDrillHourly(null); return; }
    setDrillDate(date);
    setDrillLoading(true);
    fetch(`${BASE}/api/hourly?date=${date}`)
      .then(r => r.json())
      .then(h => { setDrillHourly(h); setDrillLoading(false); })
      .catch(() => setDrillLoading(false));
  };

  const drillPeak = drillHourly ? drillHourly.reduce((pi, v, i) => v > drillHourly[pi] ? i : pi, 0) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stat pills */}
      <div className="grid-4-sm" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        <StatPill icon="⏱" label="Screen Time" value={fmtTime(data.totalScreenTime)} color="#4ade80" />
        <StatPill icon="💬" label="Sessions" value={data.totalSessions} color="#60a5fa" />
        <StatPill icon="⌨️" label="Keystrokes" value={data.totalKeystrokes.toLocaleString()} color="#a78bfa"
          trend={trendPct(data.totalKeystrokes, prevData.totalKeystrokes)} />
        <StatPill icon="🖱️" label="Clicks" value={data.totalClicks.toLocaleString()} color="#f472b6"
          trend={trendPct(data.totalClicks, prevData.totalClicks)} />
      </div>

      {/* Weekly trend line graph */}
      <SectionCard title="14-Day Screen Time Trend">
        <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 12 }}>
          Click any point to see that day's hourly breakdown ↓
        </div>
        <WeeklyTrendGraph BASE={BASE} onDayClick={handleDayClick} activeDrillDate={drillDate} />

        {/* Drill-down hourly bar */}
        {drillDate && (
          <div style={{
            marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)",
            animation: "legend-slide-in 0.25s ease both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
              <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>
                {new Date(drillDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <button onClick={() => { setDrillDate(null); setDrillHourly(null); }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
            {drillLoading
              ? <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontSize: 13 }}>Loading…</div>
              : drillHourly
                ? <HourlyBar data={drillHourly} peakHour={drillPeak} />
                : null
            }
          </div>
        )}
      </SectionCard>

      {/* Session timeline */}
      <SectionCard title="Session Timeline">
        <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 12 }}>
          Each block = a continuous app session · hover for details
        </div>
        <SessionTimeline BASE={BASE} date={activeDate} />
      </SectionCard>
    </div>
  );
}

// ─── TAB PANEL (animated) ─────────────────────────────────────────────────────
function TabPanel({ active, children }) {
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

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      minHeight: "100vh", background: "#080b14", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans',sans-serif"
    }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 24, animation: "float 3s ease-in-out infinite" }}>🌱</div>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#f8fafc", marginBottom: 12, fontWeight: 400 }}>
          No data yet
        </h2>
        <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          The tracker hasn't recorded any activity yet. Make sure <strong style={{ color: "#475569" }}>main.py</strong> is running
          and <strong style={{ color: "#475569" }}>api_server.py</strong> is active on port 7432.
        </p>
        <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 16, padding: "16px 20px", textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Quick start</div>
          {["python main.py", "python api_server.py", "npm run dev"].map(cmd => (
            <div key={cmd} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#e2e8f0", fontSize: 12 }}>$</span>
              <code style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{cmd}</code>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.reload()}
          style={{
            marginTop: 20, padding: "10px 24px", borderRadius: 12, border: "1px solid rgba(74,222,128,0.25)",
            background: "rgba(74,222,128,0.08)", color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>
          Retry
        </button>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function WellbeingDashboard({ onDisconnect }) {
  const BASE = import.meta.env.VITE_API_URL || "http://localhost:7432";
  const [data, setData] = useState(null);
  const [stats, setStats] = useState([]);
  const [prevStats, setPrevStats] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [focusData, setFocusData] = useState(null);
  const [limits, setLimits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [availableDates, setAvailableDates] = useState([]);
  const { elapsed, isToday } = useLiveClock(selectedDate);
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [appFilter, setAppFilter] = useState("all");
  const [heatmapData, setHeatmapData] = useState({});
  // Keyboard shortcuts
  useEffect(() => {
    const TABS = ["overview", "apps", "activity", "limits"];
    const handler = e => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= TABS.length && !e.ctrlKey && !e.metaKey && !e.altKey
        && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        setActiveTab(TABS[n - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Per-date data cache: { [date]: { wb, ds, hr, fc, prev } }
  const cache = useRef({});
  // Track which dates are currently being fetched to avoid duplicate requests
  const inflight = useRef({});

  // Load available dates on mount
  useEffect(() => {
    fetch(`${BASE}/api/available-dates`).then(r => r.json()).then(d => setAvailableDates(d))
      .catch(() => setAvailableDates([new Date().toISOString().split("T")[0]]));
    // Load heatmap data once (lightweight — last 60 days of per-date summaries)
    fetch(`${BASE}/api/heatmap`).then(r => r.json()).then(d => setHeatmapData(d)).catch(() => { });
  }, []);

  // Apply cached data to state
  const applyData = useCallback((entry) => {
    const { wb, ds, hr, fc, prev, lim } = entry;
    if (!wb || wb.error || (!wb.totalScreenTime && !ds.length)) {
      setNoData(true); setLoading(false); return;
    }
    setNoData(false);
    setData(wb); setStats(ds); setHourly(hr); setFocusData(fc);
    setPrevStats(Array.isArray(prev) ? prev : []);
    setLimits(Array.isArray(lim) ? lim : []);
    setTrackedSeconds(wb.totalScreenTime || 0);
    setLoading(false);
    setTimeout(() => setMounted(true), 100);
  }, []);

  // Fetch one date (+ its yesterday for trends). Returns the cache entry.
  const fetchDate = useCallback(async (date) => {
    if (inflight.current[date]) return inflight.current[date];
    const yd = yesterday(date);
    const promise = Promise.all([
      fetch(`${BASE}/api/wellbeing?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/daily-stats?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/hourly?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/focus?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/daily-stats?date=${yd}`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/limits/all`).then(r => r.json()).catch(() => []),
    ]).then(([wb, ds, hr, fc, prev, lim]) => {
      const entry = { wb, ds, hr, fc, prev, lim, fetchedAt: Date.now() };
      cache.current[date] = entry;
      delete inflight.current[date];
      return entry;
    }).catch(err => {
      delete inflight.current[date];
      throw err;
    });
    inflight.current[date] = promise;
    return promise;
  }, [BASE]);

  // Prefetch adjacent available dates silently in the background
  const prefetchNeighbors = useCallback((date, allDates) => {
    const idx = allDates.indexOf(date);
    const neighbors = [allDates[idx - 1], allDates[idx + 1]].filter(Boolean);
    neighbors.forEach(d => {
      // Only prefetch if not already cached or in-flight
      if (!cache.current[d] && !inflight.current[d]) {
        fetchDate(d).catch(() => { }); // silent — don't surface errors
      }
    });
  }, [fetchDate]);

  // Main effect: runs when selectedDate changes
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const isToday = selectedDate === today;
    // Cache TTL: today refreshes every 60s, historical dates are immutable (cache forever)
    const CACHE_TTL = isToday ? 60_000 : Infinity;
    const cached = cache.current[selectedDate];
    const cacheValid = cached && (Date.now() - cached.fetchedAt) < CACHE_TTL;

    if (cacheValid) {
      // Instant — serve from cache, no loading flash
      applyData(cached);
    } else {
      // Show skeleton only on first load; on date switch keep showing old data while fetching
      if (!data) setLoading(true);
      fetchDate(selectedDate)
        .then(applyData)
        .catch(err => {
          if (err instanceof TypeError && onDisconnect) {
            onDisconnect();
          } else {
            setNoData(true);
            setLoading(false);
          }
        });
    }

    // Prefetch neighbors after a short delay so the current date loads first
    if (availableDates.length > 0) {
      const t = setTimeout(() => prefetchNeighbors(selectedDate, availableDates), 800);
      return () => clearTimeout(t);
    }
  }, [selectedDate, availableDates]);

  // Live refresh for today every 60s (update cache + re-apply)
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (selectedDate !== today) return; // Only run for today
    const iv = setInterval(async () => {
      try {
        delete cache.current[today]; // Invalidate so fetchDate re-fetches
        const entry = await fetchDate(today);
        if (selectedDate === today) applyData(entry); // Only apply if still on today
      } catch (err) {
        if (err instanceof TypeError && onDisconnect) {
          onDisconnect();
        }
      }
    }, 60_000);
    return () => clearInterval(iv);
  }, [selectedDate, fetchDate, applyData]);

  // Derived
  const sorted = [...stats].sort((a, b) => b.active - a.active);
  const maxA = sorted[0]?.active || 1;
  const cats = stats.reduce((a, s) => { a[s.main] = (a[s.main] || 0) + s.active; return a; }, {});
  const appsByCategory = stats.reduce((a, s) => { if (!a[s.main]) a[s.main] = []; a[s.main].push(s); return a; }, {});
  const totA = Object.values(cats).reduce((a, b) => a + b, 0);
  const prevMap = prevStats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});
  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});
  const peakHour = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);

  const countKey = `${selectedDate}-${activeTab}`;
  const sH = useCountUp(Math.floor((data?.totalScreenTime || 0) / 3600), 1400, countKey);
  const sM = useCountUp(Math.floor(((data?.totalScreenTime || 0) % 3600) / 60), 1200, countKey);
  const kC = useCountUp(data?.totalKeystrokes || 0, 1600, countKey);
  const clC = useCountUp(data?.totalClicks || 0, 1600, countKey);
  const prevData = prevStats.reduce((a, s) => {
    a.totalKeystrokes = (a.totalKeystrokes || 0) + s.keystrokes; a.totalClicks = (a.totalClicks || 0) + s.clicks; return a;
  }, {});

  const TABS = [{ id: "overview", label: "Overview" }, { id: "apps", label: "Apps" }, { id: "activity", label: "Activity" }, { id: "limits", label: "🛡️ Limits", accent: "#60a5fa" }];

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080b14", fontFamily: "'DM Sans',sans-serif", padding: "32px 24px" }}>
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <Skeleton w="200px" h={14} r={6} /><div style={{ height: 12 }} />
          <Skeleton w="320px" h={42} r={8} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  if (noData) return <EmptyState />;

  return (
    <div style={{
      minHeight: "100vh", width: "100%", background: "#080b14", fontFamily: "'DM Sans',sans-serif",
      color: "#e2e8f0", position: "relative", overflowX: "hidden", overflowY: "auto"
    }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{width:100%;min-height:100vh;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
        @keyframes pulse-glow{0%,100%{opacity:0.15;}50%{opacity:0.28;}}
        @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}
        @keyframes modal-in{from{opacity:0;transform:scale(0.92) translateY(16px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes banner-in{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
        @keyframes tick{from{opacity:0.6;}to{opacity:1;}}
        @keyframes drawer-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes drawer-slide-in { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes card-fade-in { from{opacity:0;transform:translateY(12px) scale(0.99);} to{opacity:1;transform:none;} }
        .orb-float{animation:float 8s ease-in-out infinite;}
        .orb-float-2{animation:float 11s ease-in-out infinite reverse;}
        .tab-btn{padding:8px 16px;border-radius:10px;border:1px solid transparent;background:transparent;
          color:#475569;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;
          transition:all 0.25s ease;letter-spacing:0.02em;}
        .tab-btn:hover{color:#94a3b8;background:rgba(255,255,255,0.04);}
        .tab-btn.active-green{color:#4ade80!important;background:rgba(74,222,128,0.1)!important;border-color:rgba(74,222,128,0.25)!important;}
        .tab-btn.active-blue{color:#60a5fa!important;background:rgba(96,165,250,0.1)!important;border-color:rgba(96,165,250,0.25)!important;}
        .kbd-hint{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:10px;color:#334155;margin-left:6px;}
        .metric-card{animation:card-fade-in 0.45s cubic-bezier(0.34,1.2,0.64,1) both;}
        @media(max-width:900px){
          .grid-4{grid-template-columns:1fr 1fr!important;}
          .grid-4-sm{grid-template-columns:1fr 1fr!important;}
        }
        @media(max-width:600px){
          .grid-4{grid-template-columns:1fr!important;}
          .grid-4-sm{grid-template-columns:1fr 1fr!important;}
          .header-row{flex-direction:column!important;gap:16px!important;}
          .tab-group{width:100%!important;justify-content:center!important;}
        }
      `}</style>

      {/* Ambient orbs — tinted by active tab */}
      <div className="orb-float" style={{
        position: "fixed", top: "-10%", left: "-5%", width: 500, height: 500,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0, transition: "background 1.2s ease",
        background: activeTab === "limits" ? "radial-gradient(circle,rgba(251,191,36,0.1) 0%,transparent 70%)" : activeTab === "apps" ? "radial-gradient(circle,rgba(96,165,250,0.12) 0%,transparent 70%)" : "radial-gradient(circle,rgba(74,222,128,0.12) 0%,transparent 70%)"
      }} />
      <div className="orb-float-2" style={{
        position: "fixed", bottom: "-10%", right: "-5%", width: 600, height: 600,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0, transition: "background 1.2s ease",
        background: activeTab === "activity" ? "radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)" : activeTab === "limits" ? "radial-gradient(circle,rgba(248,113,113,0.09) 0%,transparent 70%)" : "radial-gradient(circle,rgba(96,165,250,0.1) 0%,transparent 70%)"
      }} />
      <div style={{
        position: "fixed", top: "40%", right: "20%", width: 300, height: 300, borderRadius: "50%",
        pointerEvents: "none", zIndex: 0, animation: "pulse-glow 6s ease-in-out infinite", transition: "background 1.2s ease",
        background: activeTab === "activity" ? "radial-gradient(circle,rgba(244,114,182,0.1) 0%,transparent 70%)" : "radial-gradient(circle,rgba(244,114,182,0.07) 0%,transparent 70%)"
      }} />

      <div style={{
        position: "relative", zIndex: 1, maxWidth: 1200, width: "100%", margin: "0 auto", padding: "32px 24px",
        opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(20px)", transition: "opacity 0.7s ease,transform 0.7s ease"
      }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 36 }}>

          {/* Row 1: Brand left | Nav tabs + hamburger right */}
          <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            {/* Brand */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%", background: isToday ? "#4ade80" : "#60a5fa",
                  boxShadow: isToday ? "0 0 10px #4ade80" : "0 0 10px #60a5fa", animation: "pulse-glow 2s ease infinite", flexShrink: 0
                }} />
                <span style={{ fontSize: 11, color: isToday ? "#4ade80" : "#60a5fa", textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>
                  {isToday ? "Live Tracking" : "Historical View"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 0, lineHeight: 1 }}>
                <h1 style={{
                  fontFamily: "'DM Serif Display',serif", fontSize: 40, fontWeight: 400,
                  color: "#f8fafc", lineHeight: 1, letterSpacing: "-0.03em", margin: 0
                }}>
                  Sta<em style={{ color: "#4ade80", fontStyle: "italic" }}>sis</em>
                </h1>
                <span style={{
                  fontSize: 12, color: "#2d3e52", marginLeft: 10, fontWeight: 400,
                  fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.05em", alignSelf: "flex-end", paddingBottom: 3
                }}>
                  Your Focus Core
                </span>
              </div>
            </div>

            {/* Tabs + Hamburger */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="tab-group" style={{
                display: "flex", gap: 4, background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 4
              }}>
                {TABS.map((t, i) => (
                  <button key={t.id}
                    className={`tab-btn ${activeTab === t.id ? (t.accent ? "active-blue" : "active-green") : ""}`}
                    onClick={() => setActiveTab(t.id)}
                    title={`Press ${i + 1}`}>
                    {t.label}
                    <span className="kbd-hint">{i + 1}</span>
                  </button>
                ))}
              </div>
              {/* Hamburger button */}
              <button onClick={() => setShowSettings("drawer")}
                title="Menu"
                style={{
                  width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255, 255, 255, 0.04)", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 5, padding: 0, flexShrink: 0,
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}>
                {[18, 14, 18].map((w, i) => (
                  <span key={i} style={{ display: "block", borderRadius: 2, background: "#64748b", width: w, height: 2, transition: "all 0.2s" }} />
                ))}
              </button>
            </div>
          </div>

          {/* Row 2: Context line */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#475569" }}>
              {activeTab === "limits" ? "App time limits & blocking" :
                new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
            {isToday && activeTab !== "limits" && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
                color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
                borderRadius: 8, padding: "3px 10px", fontWeight: 500
              }}>
                tracked {fmtTime(trackedSeconds)} today
              </span>
            )}
            {isToday && (
              <span style={{
                fontSize: 12, color: "#475569", fontFamily: "monospace",
                animation: "tick 1s ease infinite alternate",
                background: "rgba(255, 255, 255, 0.05)", padding: "3px 10px", borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.09)", letterSpacing: "0.05em"
              }}>
                {fmtTimeFull(elapsed)}
              </span>
            )}
          </div>

          {activeTab !== "limits" && (
            <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} availableDates={availableDates} heatmap={heatmapData} />
          )}
        </div>

        {/* ── OVERVIEW ── */}
        <TabPanel active={activeTab === "overview"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Limit warnings */}
            <LimitWarningBanner limits={limits} usage={usage} onGoToLimits={() => setActiveTab("limits")} />

            {/* Metric cards */}
            <div key={selectedDate} className="grid-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
              {/* Screen time */}
              <SectionCard className="metric-card" style={{ borderLeft: "3px solid #4ade80", background: "linear-gradient(135deg,rgba(74,222,128,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "0ms" }}>
                <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16, fontWeight: 600 }}>Screen Time</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 52, fontWeight: 400, lineHeight: 1, color: "#f8fafc" }}>
                  {sH}<span style={{ fontSize: 24, color: "#475569" }}>h </span>
                  {sM}<span style={{ fontSize: 24, color: "#475569" }}>m</span>
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, background: "rgba(74,222,128,0.08)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase" }}>Active</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#f8fafc", marginTop: 2 }}>{fmtTime(data.totalScreenTime - data.totalIdleTime)}</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(148,163,184,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Idle</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginTop: 2 }}>{fmtTime(data.totalIdleTime)}</div>
                  </div>
                </div>
              </SectionCard>

              {/* Productivity */}
              <SectionCard className="metric-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, borderLeft: "3px solid #4ade80", background: "linear-gradient(135deg,rgba(74,222,128,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "60ms" }}>
                <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 }}>Productivity</div>
                <RadialProgress value={data.productivityPercent} size={150} stroke={12} color="#4ade80" sublabel="%" />
                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>of active time on<br />productive work</div>
              </SectionCard>

              {/* Focus */}
              <SectionCard className="metric-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, borderLeft: "3px solid #60a5fa", background: "linear-gradient(135deg,rgba(96,165,250,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "120ms" }}>
                <div style={{ fontSize: 11, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 }}>Focus</div>
                <RadialProgress value={focusData?.score ?? 0} size={150} stroke={12} color="#60a5fa" sublabel="%" />
                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
                  {focusData?.deepWorkSeconds
                    ? <><span>deep work</span><br /><span style={{ color: "#475569", fontWeight: 600 }}>{Math.round(focusData.deepWorkSeconds / 60)}m total</span></>
                    : "of time in deep focus"}
                </div>
              </SectionCard>

              {/* Input */}
              <SectionCard className="metric-card" style={{ borderLeft: "3px solid #a78bfa", background: "linear-gradient(135deg,rgba(167,139,250,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "180ms" }}>
                <div style={{ fontSize: 11, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16, fontWeight: 600 }}>Input Activity</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>⌨️ Keystrokes</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <TrendBadge pct={trendPct(data.totalKeystrokes, prevData.totalKeystrokes)} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{kC.toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)" }}>
                      <div style={{
                        height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4ade80,#22d3ee)",
                        width: `${Math.min(100, (data.totalKeystrokes / 20000) * 100)}%`, transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1)"
                      }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>🖱️ Clicks</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <TrendBadge pct={trendPct(data.totalClicks, prevData.totalClicks)} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{clC.toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)" }}>
                      <div style={{
                        height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#60a5fa,#a78bfa)",
                        width: `${Math.min(100, (data.totalClicks / 8000) * 100)}%`, transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1) 0.2s"
                      }} />
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 2 }}>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Most used app</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <AppIcon appName={data.mostUsedApp} category={stats.find(s => s.app === data.mostUsedApp)?.main || "other"} size={28} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#f8fafc" }}>{data.mostUsedApp.replace(".exe", "")}</span>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Hourly + Peak callout */}
            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                  Hourly Activity Pattern
                </div>
                {hourly[peakHour] > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "5px 12px"
                  }}>
                    <span style={{ fontSize: 12 }}>⭐</span>
                    <span style={{ fontSize: 12, color: "#fbbf24" }}>
                      Peak hour: {peakHour === 0 ? "12 AM" : peakHour === 12 ? "12 PM" : peakHour < 12 ? `${peakHour} AM` : `${peakHour - 12} PM`}
                      &nbsp;·&nbsp;{hourly[peakHour]}m active
                    </span>
                  </div>
                )}
              </div>
              <HourlyBar data={hourly} peakHour={peakHour} />
            </SectionCard>

            {/* Donut category breakdown */}
            <SectionCard title="Category Breakdown">
              <DonutChart data={cats} total={totA} appsByCategory={appsByCategory} />
            </SectionCard>
          </div>
        </TabPanel>

        {/* ── APPS ── */}
        <TabPanel active={activeTab === "apps"}>
          <SectionCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.15em" }}>Time by App</div>
              <div style={{ fontSize: 11, color: "#e2e8f0" }}>vs yesterday</div>
            </div>
            {/* Category filter chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {["all", "productive", "communication", "entertainment", "system", "other"].map(cat => {
                const col = cat === "all" ? { primary: "#475569", bg: "rgba(148,163,184,0.08)" } : (CATEGORY_COLORS[cat] || CATEGORY_COLORS.other);
                const isActive = appFilter === cat;
                const cnt = cat === "all" ? sorted.length : sorted.filter(s => s.main === cat).length;
                if (cat !== "all" && cnt === 0) return null;
                return (
                  <button key={cat} onClick={() => setAppFilter(cat)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20,
                      border: `1px solid ${isActive ? col.primary + "55" : "rgba(255,255,255,0.07)"}`,
                      background: isActive ? col.bg : "rgba(255, 255, 255, 0.04)",
                      color: isActive ? col.primary : "#475569", fontSize: 12, fontWeight: 500,
                      cursor: "pointer", transition: "all 0.18s", fontFamily: "'DM Sans',sans-serif"
                    }}>
                    {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{cnt}</span>
                  </button>
                );
              })}
            </div>
            {(appFilter === "all" ? sorted : sorted.filter(s => s.main === appFilter)).length === 0
              ? <div style={{ textAlign: "center", padding: "40px 0", color: "#e2e8f0", fontSize: 13 }}>No apps in this category</div>
              : (appFilter === "all" ? sorted : sorted.filter(s => s.main === appFilter)).map((s, i) => (
                <AppRow key={s.app} {...s} maxActive={maxA} index={i} prevActive={prevMap[s.app]} />
              ))
            }
          </SectionCard>
        </TabPanel>



        {/* ── ACTIVITY ── */}
        <TabPanel active={activeTab === "activity"}>
          <ActivityTab
            BASE={BASE}
            selectedDate={selectedDate}
            data={data}
            stats={stats}
            prevData={prevData}
            hourly={hourly}
            peakHour={peakHour}
            countKey={countKey}
          />
        </TabPanel>

        {/* ── LIMITS ── */}
        <TabPanel active={activeTab === "limits"}>
          <LimitsTab BASE={BASE} stats={stats} />
        </TabPanel>

        {/* Footer */}
        <div style={{
          textAlign: "center", marginTop: 40, fontSize: 11, color: "#1e293b", display: "flex",
          alignItems: "center", justifyContent: "center", gap: 16
        }}>
          <span style={{ letterSpacing: "0.04em" }}>Stasis · Your Focus Core</span>
          <span style={{ color: "#1a2035" }}>·</span>
          <span>Press 1–4 to switch tabs</span>
        </div>
      </div>

      {/* ── HAMBURGER DRAWER ── */}
      {
        showSettings === "drawer" && (
          <>
            {/* Backdrop */}
            <div onClick={() => setShowSettings(null)}
              style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", animation: "drawer-fade-in 0.22s ease" }} />
            {/* Slide-out panel */}
            <div style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 160, width: 280,
              background: "rgba(8, 11, 20, 0.97)", borderLeft: "1px solid rgba(255,255,255,0.08)",
              display: "flex", flexDirection: "column",
              boxShadow: "-24px 0 80px rgba(15,18,34,0.7)",
              animation: "drawer-slide-in 0.28s cubic-bezier(0.34,1.1,0.64,1)"
            }}>

              {/* Drawer header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", lineHeight: 1, letterSpacing: "-0.02em" }}>
                    Sta<span style={{ color: "#4ade80", fontStyle: "italic" }}>sis</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#2d3d52", marginTop: 4, letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 500 }}>Your Focus Core</div>
                </div>
                <button onClick={() => setShowSettings(null)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255, 255, 255, 0.04)", color: "#475569", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              {/* Drawer menu items */}
              <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                {[
                  { icon: "⚙️", label: "General Settings", sub: "Tracking & app preferences", section: "general" },
                  { icon: "✈️", label: "Telegram Integration", sub: "Remote control setup", section: "telegram" },
                  { icon: "🔐", label: "Security", sub: "Encryption & access control", section: "security" },
                  { icon: "ℹ️", label: "About & Privacy", sub: "Version, licenses, policy", section: "about" },
                ].map(({ icon, label, sub, section }) => (
                  <button key={section}
                    onClick={() => setShowSettings(section)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                      borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                      background: "transparent", color: "#475569", transition: "all 0.15s ease"
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; e.currentTarget.style.color = "#f8fafc"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#475569"; }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
                      <div style={{ fontSize: 11, color: "#e2e8f0", marginTop: 2 }}>{sub}</div>
                    </div>
                    <span style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.12)" }}>›</span>
                  </button>
                ))}
              </nav>

              {/* Drawer footer */}
              <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" }}>Stasis v2.1.0</div>
                  <div style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.1)", letterSpacing: "0.04em" }}>Wellbeing &amp; Remote Sync</div>
                </div>
              </div>
            </div>
          </>
        )
      }

      {/* ── SETTINGS PAGE (full modal) ── */}
      {
        showSettings && showSettings !== "drawer" && (
          <SettingsPage
            initialSection={showSettings}
            onClose={() => setShowSettings(null)}
          />
        )
      }
    </div >
  );
}

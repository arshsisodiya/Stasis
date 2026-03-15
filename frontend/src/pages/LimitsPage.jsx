import { useState, useEffect, useCallback, useRef } from "react";
import { fmtTime } from "../shared/utils";
import { SectionCard, AppIcon } from "../shared/components";
import { useVisibilityPolling } from "../shared/hooks";

// ─── STORAGE KEY ─────────────────────────────────────────────────────────────
const TEMP_UNBLOCK_KEY = "wellbeing_temp_unblocks";
const BREACH_LOG_KEY = "wellbeing_breach_log";
const MAX_BREACH_LOG = 100; // keep last 100 entries

function loadTempUnblocks() {
  try {
    const raw = localStorage.getItem(TEMP_UNBLOCK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Filter out expired ones on load
    const now = Date.now();
    const active = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v.expiresAt > now) active[k] = v;
    }
    return active;
  } catch { return {}; }
}

function saveTempUnblocks(obj) {
  try { localStorage.setItem(TEMP_UNBLOCK_KEY, JSON.stringify(obj)); } catch { }
}

function loadBreachLog() {
  try {
    const raw = localStorage.getItem(BREACH_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function appendBreachLog(entry) {
  try {
    const log = loadBreachLog();
    log.unshift(entry);                          // newest first
    if (log.length > MAX_BREACH_LOG) log.length = MAX_BREACH_LOG;
    localStorage.setItem(BREACH_LOG_KEY, JSON.stringify(log));
  } catch { }
}

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const injectStyles = () => {
  if (document.getElementById("limits-styles")) return;
  const s = document.createElement("style");
  s.id = "limits-styles";
  s.textContent = `
    @keyframes modal-in {
      from { opacity:0; transform:scale(0.93) translateY(14px); }
      to   { opacity:1; transform:scale(1) translateY(0); }
    }
    @keyframes overlay-in { from{opacity:0} to{opacity:1} }
    @keyframes toast-in {
      from { opacity:0; transform:translateX(28px) scale(0.94); }
      to   { opacity:1; transform:translateX(0) scale(1); }
    }
    @keyframes pulse-dot {
      0%,100% { opacity:1; transform:scale(1); }
      50%     { opacity:0.4; transform:scale(1.65); }
    }
    @keyframes card-in {
      from { opacity:0; transform:translateY(18px) scale(0.97); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes confirm-shake {
      0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)}
      40%{transform:translateX(5px)}   60%{transform:translateX(-3px)} 80%{transform:translateX(3px)}
    }
    @keyframes bounce-in {
      0%{transform:scale(0.7);opacity:0} 60%{transform:scale(1.1);opacity:1} 100%{transform:scale(1)}
    }
    @keyframes offline-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    @keyframes log-row-in {
      from { opacity:0; transform:translateX(-8px); }
      to   { opacity:1; transform:translateX(0); }
    }

    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
    input[type=number] { -moz-appearance:textfield; appearance:textfield; }

    .limit-card { animation:card-in 0.38s cubic-bezier(0.34,1.56,0.64,1) both; }

    .action-btn {
      flex:1; min-width:70px; padding:8px 0; border-radius:10px; border:none;
      cursor:pointer; font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif;
      transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1); position:relative; overflow:hidden;
    }
    .action-btn::after { content:''; position:absolute; inset:0; background:rgba(255,255,255,0.09); opacity:0; transition:opacity 0.15s; }
    .action-btn:hover::after { opacity:1; }
    .action-btn:active { transform:scale(0.95) !important; }

    .preset-btn {
      padding:7px 14px; border-radius:9px; cursor:pointer; font-size:12px;
      font-weight:600; font-family:'DM Sans',sans-serif;
      transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    }
    .preset-btn:hover  { transform:translateY(-2px); }
    .preset-btn:active { transform:scale(0.94) !important; }

    .save-btn {
      width:100%; padding:14px; border-radius:13px; border:none;
      font-size:14px; font-weight:700; font-family:'DM Sans',sans-serif;
      transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1);
      position:relative; overflow:hidden; cursor:pointer;
    }
    .save-btn:not(:disabled):hover { transform:translateY(-2px); filter:brightness(1.1); }
    .save-btn:not(:disabled):active { transform:scale(0.97); }
    .save-btn::before {
      content:''; position:absolute; inset:0;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
      transform:translateX(-100%); transition:transform 0.55s;
    }
    .save-btn:not(:disabled):hover::before { transform:translateX(100%); }

    .del-btn {
      width:34px; padding:8px 0; border-radius:10px; border:none; cursor:pointer;
      font-size:14px; transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
    }
    .del-btn:hover  { transform:scale(1.1); }
    .del-btn:active { transform:scale(0.91); }

    .add-limit-btn {
      display:flex; align-items:center; gap:8px; padding:10px 20px; border-radius:12px;
      border:1px solid rgba(74,222,128,0.3); cursor:pointer;
      background:rgba(74,222,128,0.08); color:#4ade80;
      font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif;
      transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);
    }
    .add-limit-btn:hover { background:rgba(74,222,128,0.15); border-color:rgba(74,222,128,0.5); transform:translateY(-2px); box-shadow:0 6px 24px rgba(74,222,128,0.2); }
    .add-limit-btn:active { transform:scale(0.96); }

    .confirm-modal { animation:modal-in 0.28s cubic-bezier(0.34,1.56,0.64,1); }
    .tab-btn { padding:7px 16px; border-radius:9px; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500; transition:all 0.2s ease; }

    .unblock-opt {
      padding:14px; border-radius:12px; cursor:pointer; font-size:14px;
      font-weight:600; font-family:'DM Sans',sans-serif;
      transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    }
    .unblock-opt:hover  { transform:scale(1.05); }
    .unblock-opt:active { transform:scale(0.95); }

    /* ── Clean time input fields ── */
    .time-field-wrap { flex:1; position:relative; }
    .time-field {
      width:100%; text-align:center; font-family:'DM Mono',monospace;
      font-size:20px; font-weight:700; color:#f1f5f9;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
      border-radius:12px; padding:12px 8px;
      outline:none; box-sizing:border-box;
      transition:border-color 0.2s, box-shadow 0.2s, background 0.2s;
    }
    .time-field:focus {
      border-color:rgba(74,222,128,0.5);
      box-shadow:0 0 0 3px rgba(74,222,128,0.1);
      background:rgba(74,222,128,0.05);
    }
    .time-field-label {
      position:absolute; bottom:-18px; left:50%; transform:translateX(-50%);
      font-size:10px; font-weight:700; text-transform:uppercase;
      letter-spacing:0.12em; color:#334155;
    }
    .time-colon {
      font-family:'DM Mono',monospace; font-size:24px; font-weight:300;
      color:#1e2d42; align-self:center; padding-bottom:4px; user-select:none;
    }

    .search-bar {
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
      border-radius:10px; color:#f1f5f9; padding:8px 12px 8px 34px;
      font-size:12px; font-family:'DM Sans',sans-serif; outline:none;
      transition:border-color 0.2s,box-shadow 0.2s; box-sizing:border-box;
    }
    .search-bar:focus { border-color:rgba(74,222,128,0.4); box-shadow:0 0 0 3px rgba(74,222,128,0.08); }
    .search-bar::placeholder { color:#2d3d55; }

    .sort-btn {
      padding:6px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);
      cursor:pointer; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif;
      background:rgba(255,255,255,0.04); color:#475569; transition:all 0.18s ease;
    }
    .sort-btn.active { background:rgba(74,222,128,0.1); border-color:rgba(74,222,128,0.3); color:#4ade80; }
    .sort-btn:hover:not(.active) { border-color:rgba(255,255,255,0.15); color:#94a3b8; }

    .offline-banner {
      display:flex; align-items:center; gap:10px; padding:10px 16px;
      background:rgba(248,113,113,0.07); border:1px solid rgba(248,113,113,0.2);
      border-radius:12px; animation:offline-pulse 2s ease-in-out infinite;
    }

    /* ── Temporarily Unblocked card ── */
    .temp-unblock-card {
      background:rgba(34,211,238,0.04); border:1px solid rgba(34,211,238,0.15);
      border-radius:16px; padding:14px 18px;
      transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);
    }
    .temp-unblock-card:hover { background:rgba(34,211,238,0.07); border-color:rgba(34,211,238,0.25); transform:translateY(-1px); }
    .temp-unblock-bar { height:3px; border-radius:3px; background:rgba(255,255,255,0.06); overflow:hidden; margin-top:10px; }
    .temp-unblock-bar-fill {
      height:100%; border-radius:3px;
      background:linear-gradient(90deg,#22d3ee,#4ade80);
      box-shadow:0 0 6px rgba(34,211,238,0.5);
      transition:width 1s linear;
    }

    /* ── Breach log ── */
    .breach-log-row { animation: log-row-in 0.28s ease both; }
    .breach-log-row:nth-child(1){animation-delay:0ms}
    .breach-log-row:nth-child(2){animation-delay:30ms}
    .breach-log-row:nth-child(3){animation-delay:60ms}
    .breach-log-row:nth-child(4){animation-delay:90ms}
    .breach-log-row:nth-child(5){animation-delay:120ms}

    .log-filter-btn {
      padding:5px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);
      cursor:pointer; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif;
      background:rgba(255,255,255,0.04); color:#475569; transition:all 0.15s ease;
    }
    .log-filter-btn.active { background:rgba(248,113,113,0.1); border-color:rgba(248,113,113,0.3); color:#f87171; }
    .log-filter-btn:hover:not(.active) { border-color:rgba(255,255,255,0.14); color:#94a3b8; }
  `;
  document.head.appendChild(s);
};

// ─── RESET COUNTDOWN ─────────────────────────────────────────────────────────
function useResetCountdown() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date(), midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = Math.floor((midnight - now) / 1000);
      const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60);
      setLabel(`Resets in ${h}h ${m}m`);
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, []);
  return label;
}

// ─── FORMAT TIMESTAMP ─────────────────────────────────────────────────────────
function fmtTs(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel = "Confirm", confirmColor = "#f87171", confirmBg = "rgba(248,113,113,0.15)", onConfirm, onCancel, icon = "⚠️" }) {
  const ref = useRef(null);
  const shake = () => {
    if (!ref.current) return;
    ref.current.style.animation = "none";
    requestAnimationFrame(() => { ref.current.style.animation = "confirm-shake 0.4s ease"; });
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", animation: "overlay-in 0.2s ease" }}
      onClick={e => { if (e.target === e.currentTarget) shake(); }}>
      <div ref={ref} className="confirm-modal" style={{
        background: "rgba(10,13,26,0.99)", border: `1px solid ${confirmColor}28`,
        borderRadius: 22, padding: "32px", width: 380, maxWidth: "90vw",
        boxShadow: `0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px ${confirmColor}12`,
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 58, height: 58, borderRadius: "50%", background: `radial-gradient(circle,${confirmBg} 0%,transparent 70%)`, border: `1px solid ${confirmColor}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26, animation: "bounce-in 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>{icon}</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#f1f5f9", marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>{message}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s" }}
            onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.09)"}
            onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.04)"}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer", border: `1px solid ${confirmColor}40`, background: confirmBg, color: confirmColor, fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s", boxShadow: `0 0 18px ${confirmColor}20` }}
            onMouseEnter={e => { e.target.style.filter = "brightness(1.15)"; e.target.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.target.style.filter = "none"; e.target.style.transform = "none"; }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── LIMIT RING ───────────────────────────────────────────────────────────────
function LimitRing({ used, limit, size = 64, stroke = 5 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const color = pct >= 1 ? "#f87171" : pct >= 0.8 ? "#fbbf24" : "#4ade80";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}aa)`, transition: "stroke-dasharray 1.1s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "'DM Mono',monospace", letterSpacing: "-0.5px" }}>{Math.round(pct * 100)}%</span>
      </div>
    </div>
  );
}

// ─── LIMIT CARD ───────────────────────────────────────────────────────────────
function LimitCard({ limit, onToggle, onEdit, onDelete, onUnblock, todayUsage, isBlocked, index, resetLabel }) {
  const [hov, setHov] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState(null);

  const used = todayUsage[limit.app_name] || 0;
  const isOver = isBlocked;
  const isWarn = !isOver && used >= limit.daily_limit_seconds * 0.8;
  const pct = limit.daily_limit_seconds > 0 ? Math.min(used / limit.daily_limit_seconds, 1) : 0;
  const isEnabled = optimisticEnabled !== null ? optimisticEnabled : limit.is_enabled;
  const sc = isOver ? "#f87171" : isWarn ? "#fbbf24" : isEnabled ? "#4ade80" : "#475569";
  const sl = isOver ? "Blocked" : isWarn ? "Warning" : isEnabled ? "Active" : "Paused";
  const remaining = Math.max(0, limit.daily_limit_seconds - used);
  const appName = limit.app_name.replace(".exe", "");

  return (
    <>
      <div className="limit-card" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          animationDelay: `${index * 55}ms`,
          background: hov ? "rgba(22,28,52,0.96)" : "rgba(14,18,36,0.78)",
          border: `1px solid ${isOver ? "rgba(248,113,113,0.22)" : isWarn ? "rgba(251,191,36,0.18)" : hov ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 20, padding: "20px 22px", backdropFilter: "blur(24px)",
          transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          transform: hov ? "translateY(-3px)" : "none",
          boxShadow: hov ? `0 14px 44px rgba(0,0,0,0.38),0 0 0 1px ${isOver ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.04)"}` : "0 2px 8px rgba(0,0,0,0.22)"
        }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AppIcon appName={limit.app_name} category="other" size={42} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", lineHeight: 1 }}>{appName}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}`, animation: isEnabled && !isOver ? "pulse-dot 2.2s ease-in-out infinite" : "none" }} />
                <span style={{ fontSize: 11, color: sc, fontWeight: 600, letterSpacing: "0.03em" }}>{sl}</span>
              </div>
            </div>
          </div>
          <LimitRing used={used} limit={limit.daily_limit_seconds} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "'DM Mono',monospace" }}>{fmtTime(used)} used</span>
          <span style={{ fontSize: 11, color: remaining < 300 ? "#f87171" : "#475569", fontFamily: "'DM Mono',monospace" }}>
            {remaining > 0 ? `${fmtTime(remaining)} left` : "Limit hit"}
          </span>
          <span style={{ fontSize: 11, color: "#334155", fontFamily: "'DM Mono',monospace" }}>{fmtTime(limit.daily_limit_seconds)}</span>
        </div>

        <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "visible", marginBottom: 10, position: "relative" }}>
          <div style={{
            height: "100%", borderRadius: 5, width: `${pct * 100}%`,
            background: isOver ? "linear-gradient(90deg,#f87171,#ef4444)" : isWarn ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#4ade80,#22d3ee)",
            boxShadow: `0 0 8px ${sc}60`, transition: "width 1.1s cubic-bezier(0.34,1.56,0.64,1)", position: "relative", overflow: "hidden"
          }}>
            {pct > 0.12 && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, borderRadius: "0 5px 5px 0", background: "rgba(255,255,255,0.45)", filter: "blur(1px)" }} />}
          </div>
          {/* 80% warning threshold marker */}
          <div style={{
            position: "absolute", top: -2, bottom: -2,
            left: "80%", width: 1.5,
            background: pct >= 0.8 ? "rgba(251,191,36,0.6)" : "rgba(255,255,255,0.12)",
            borderRadius: 1, pointerEvents: "none",
            transition: "background 0.4s ease",
          }} />
        </div>

        {isOver && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><span>⛔</span>Daily limit reached — app is blocked</div>}
        {isWarn && !isOver && <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><span>⚠️</span>Approaching daily limit</div>}

        {/* Burn rate insight — only show when active and under limit */}
        {!isOver && isEnabled && used > 0 && (() => {
          const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
          const hoursElapsed = Math.max(nowHour, 0.5);
          const burnPerHour = used / hoursElapsed;
          const hoursLeft = 24 - nowHour;
          const projectedTotal = used + burnPerHour * hoursLeft;
          const willExceed = projectedTotal >= limit.daily_limit_seconds;
          const hitsInSeconds = remaining / (burnPerHour / 3600);
          const hitsInHours = hitsInSeconds / 3600;
          if (burnPerHour < 60) return null; // less than 1 min/hr — not useful
          return (
            <div style={{ fontSize: 10, color: willExceed ? "#fbbf24" : "#334155", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <span>{willExceed ? "📈" : "📊"}</span>
              <span>~{Math.round(burnPerHour / 60)}m/hr avg
                {willExceed && hitsInHours < 12
                  ? <span style={{ color: "#fbbf24", fontWeight: 600 }}> · hits limit in ~{hitsInHours < 1 ? `${Math.round(hitsInHours * 60)}m` : `${hitsInHours.toFixed(1)}h`}</span>
                  : <span style={{ color: "#2d3d55" }}> · on track</span>
                }
              </span>
            </div>
          );
        })()}

        <div style={{ fontSize: 10, color: "#2d3d55", marginBottom: 12, display: "flex", alignItems: "center", gap: 5 }}>
          <span>🕛</span>{resetLabel}
        </div>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button className="action-btn" onClick={() => setConfirm({
            title: isEnabled ? "Pause this limit?" : "Enable this limit?",
            message: isEnabled ? `"${appName}" will no longer be monitored until re-enabled.` : `"${appName}" will resume being monitored.`,
            confirmLabel: isEnabled ? "Pause" : "Enable",
            confirmColor: isEnabled ? "#fbbf24" : "#4ade80",
            confirmBg: isEnabled ? "rgba(251,191,36,0.12)" : "rgba(74,222,128,0.12)",
            icon: isEnabled ? "⏸" : "▶",
            action: () => { setOptimisticEnabled(!isEnabled); onToggle(limit.app_name, !isEnabled).finally(() => setOptimisticEnabled(null)); }
          })} style={{ background: isEnabled ? "rgba(74,222,128,0.09)" : "rgba(255,255,255,0.04)", color: isEnabled ? "#4ade80" : "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
            {isEnabled ? "⏸ Pause" : "▶ Enable"}
          </button>
          <button className="action-btn" onClick={() => onEdit(limit)}
            style={{ background: "rgba(96,165,250,0.09)", color: "#60a5fa", fontFamily: "'DM Sans',sans-serif" }}>
            ✏️ Edit
          </button>
          {isOver && (
            <button className="action-btn" onClick={() => onUnblock(limit.app_name)}
              style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontFamily: "'DM Sans',sans-serif" }}>🔓 Unblock</button>
          )}
          <button className="del-btn" onClick={() => setConfirm({
            title: "Remove this limit?",
            message: `The daily limit for "${appName}" will be permanently removed.`,
            confirmLabel: "Remove Limit", confirmColor: "#f87171", confirmBg: "rgba(248,113,113,0.12)", icon: "🗑️",
            action: () => onDelete(limit.app_name)
          })} style={{ background: "rgba(248,113,113,0.07)", color: "#f87171" }}>✕</button>
        </div>
      </div>

      {confirm && (
        <ConfirmModal {...confirm}
          onConfirm={() => { confirm.action(); setConfirm(null); }}
          onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}

// ─── TEMP UNBLOCK CARD ────────────────────────────────────────────────────────
function TempUnblockCard({ appName, expiresAt, totalSeconds, onExpired, onReblock }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) onExpired(appName);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt, appName, onExpired]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const sec = remaining % 60;
  const pct = totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 0;

  return (
    <div className="temp-unblock-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🔓</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{appName.replace(".exe", "")}</div>
            <div style={{ fontSize: 11, color: "#22d3ee", marginTop: 2 }}>Temporarily unblocked</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: "#22d3ee", letterSpacing: "0.5px" }}>
            {h > 0 ? `${h}:` : ""}{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>remaining</div>
        </div>
      </div>
      <div className="temp-unblock-bar">
        <div className="temp-unblock-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {/* Re-block early button */}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => onReblock(appName)}
          style={{
            padding: "4px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)",
            background: "rgba(248,113,113,0.07)", color: "#f87171",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.07)"; e.currentTarget.style.transform = "none"; }}>
          ⛔ Re-block now
        </button>
      </div>
    </div>
  );
}

// ─── BREACH LOG PANEL ─────────────────────────────────────────────────────────
function BreachLogPanel({ onClose }) {
  const [log, setLog] = useState([]);
  const [filter, setFilter] = useState("all");
  const [appFilter, setAppFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [showAppDrop, setShowAppDrop] = useState(false);

  useEffect(() => { setLog(loadBreachLog()); }, []);

  const clearLog = () => {
    try { localStorage.removeItem(BREACH_LOG_KEY); } catch { }
    setLog([]);
    setConfirmClear(false);
  };

  const exportCSV = () => {
    const header = "timestamp,app,type,note";
    const rows = log.map(e => `"${new Date(e.ts).toISOString()}","${e.app}","${e.type}","${(e.note || "").replace(/"/g, '""')}"`);
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `breach-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const allApps = [...new Set(log.map(e => e.app))].sort();

  const shown = log.filter(e => {
    if (filter === "today") {
      const today = new Date().toDateString();
      return new Date(e.ts).toDateString() === today;
    }
    if (filter === "app" && appFilter) return e.app === appFilter;
    return true;
  });

  const typeIcon = t => t === "blocked" ? "🔴" : t === "unblocked" ? "🟡" : "🔵";
  const typeColor = t => t === "blocked" ? "#f87171" : t === "unblocked" ? "#fbbf24" : "#60a5fa";
  const typeLabel = t => t === "blocked" ? "Blocked" : t === "unblocked" ? "Unblocked" : t === "warning" ? "Warning" : t;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", animation: "overlay-in 0.2s ease", paddingTop: 20, paddingRight: 20, backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.4)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "linear-gradient(145deg,rgba(10,13,26,0.99),rgba(7,9,20,0.99))",
        border: "1px solid rgba(255,255,255,0.09)", borderRadius: 22,
        width: 420, maxWidth: "95vw", maxHeight: "85vh",
        boxShadow: "0 32px 80px rgba(0,0,0,0.9),0 0 0 1px rgba(248,113,113,0.06)",
        animation: "modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19, color: "#f1f5f9", lineHeight: 1 }}>Limit Breach Log</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{log.length} event{log.length !== 1 ? "s" : ""} recorded</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {log.length > 0 && (
                <>
                  <button onClick={exportCSV} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s" }}
                    onMouseEnter={e => e.target.style.background = "rgba(96,165,250,0.16)"}
                    onMouseLeave={e => e.target.style.background = "rgba(96,165,250,0.08)"}>↓ CSV</button>
                  <button onClick={() => setConfirmClear(true)} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s" }}
                    onMouseEnter={e => e.target.style.background = "rgba(248,113,113,0.16)"}
                    onMouseLeave={e => e.target.style.background = "rgba(248,113,113,0.08)"}>Clear</button>
                </>
              )}
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.06)", color: "#64748b", cursor: "pointer", fontSize: 15, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#64748b"; }}>✕</button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[["all", "All"], ["today", "Today"], ["app", "By App"]].map(([v, lbl]) => (
              <button key={v} className={`log-filter-btn${filter === v ? " active" : ""}`} onClick={() => setFilter(v)}>{lbl}</button>
            ))}
            {/* Custom app picker — consistent with rest of UI */}
            {filter === "app" && (
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowAppDrop(v => !v)}
                  style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${appFilter ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.1)"}`, background: appFilter ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.05)", color: appFilter ? "#f1f5f9" : "#475569", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                  {appFilter ? appFilter.replace(".exe", "") : "Pick app…"}
                  <span style={{ fontSize: 9, opacity: 0.5 }}>▾</span>
                </button>
                {showAppDrop && allApps.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 300, background: "rgba(10,14,28,0.99)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, overflow: "hidden", minWidth: 160, boxShadow: "0 12px 36px rgba(0,0,0,0.7)" }}>
                    {allApps.map(a => (
                      <div key={a} onClick={() => { setAppFilter(a); setShowAppDrop(false); }}
                        style={{ padding: "8px 14px", fontSize: 12, color: a === appFilter ? "#f1f5f9" : "#64748b", background: a === appFilter ? "rgba(248,113,113,0.1)" : "transparent", cursor: "pointer", transition: "all 0.12s", fontFamily: "'DM Sans',sans-serif" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                        onMouseLeave={e => e.currentTarget.style.background = a === appFilter ? "rgba(248,113,113,0.1)" : "transparent"}>
                        {a.replace(".exe", "")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Log entries */}
        <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
          {shown.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: "#334155", fontFamily: "'DM Serif Display',serif" }}>
                {log.length === 0 ? "No events recorded yet" : "No events match this filter"}
              </div>
              <div style={{ fontSize: 12, color: "#2d3d55", marginTop: 6 }}>
                {log.length === 0 ? "Events are logged automatically when apps hit their limits" : "Try a different filter"}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {shown.map((e, i) => (
                <div key={i} className="breach-log-row" style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                  borderRadius: 10, borderLeft: `2px solid ${typeColor(e.type)}30`,
                }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{typeIcon(e.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.app.replace(".exe", "")}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: typeColor(e.type), background: `${typeColor(e.type)}18`, padding: "2px 7px", borderRadius: 5, flexShrink: 0 }}>
                        {typeLabel(e.type)}
                      </span>
                    </div>
                    {e.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{e.note}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: "#334155", fontFamily: "'DM Mono',monospace", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {fmtTs(e.ts)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm clear modal */}
      {confirmClear && (
        <ConfirmModal
          title="Clear breach log?"
          message={`This will permanently delete all ${log.length} recorded events. This cannot be undone.`}
          confirmLabel="Clear All" confirmColor="#f87171" confirmBg="rgba(248,113,113,0.12)" icon="🗑️"
          onConfirm={clearLog}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

// ─── LIMIT MODAL ─────────────────────────────────────────────────────────────
function LimitModal({ onClose, onSave, knownApps, editTarget, BASE, stats = [] }) {
  const [app, setApp] = useState(editTarget?.app_name || "");
  const [h, setH] = useState(editTarget ? Math.floor(editTarget.daily_limit_seconds / 3600) : "");
  const [m, setM] = useState(editTarget ? Math.floor((editTarget.daily_limit_seconds % 3600) / 60) : "");
  const [saving, setSaving] = useState(false);
  const [systemApps, setSystemApps] = useState([]);
  const [showD, setShowD] = useState(false);
  const [query, setQuery] = useState(editTarget?.app_name?.replace(".exe", "") || "");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (editTarget || !BASE) return;
    fetch(`${BASE}/api/system/apps`).then(r => r.json()).then(d => setSystemApps(d.apps || [])).catch(() => setSystemApps([]));
  }, [BASE, editTarget]);

  const filtered = query.trim().length > 1
    ? systemApps.filter(a => (a.name && a.name.toLowerCase().includes(query.toLowerCase())) || (a.exe && a.exe.toLowerCase().includes(query.toLowerCase()))).slice(0, 8)
    : [];

  const hVal = parseInt(h) || 0;
  const mVal = parseInt(m) || 0;
  const secs = hVal * 3600 + mVal * 60;
  const targetApp = app || (query.trim().length > 0 ? (query.trim().toLowerCase().endsWith(".exe") ? query.trim() : query.trim() + ".exe") : "");
  const ok = targetApp.length > 0 && secs > 0;

  const doSave = async () => {
    if (!ok) return;
    setSaving(true);
    await onSave(targetApp.toLowerCase().replace(/\s+/g, ""), secs);
    setSaving(false);
    onClose();
  };

  // ── Only presets — no duplicate "Quick add" row ──
  const PRESETS = [[0, 15, "15m"], [0, 30, "30m"], [1, 0, "1h"], [2, 0, "2h"], [3, 0, "3h"], [4, 0, "4h"], [6, 0, "6h"], [8, 0, "8h"]];

  const inp = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 11,
    color: "#f1f5f9", padding: "11px 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif",
    outline: "none", width: "100%", transition: "border-color 0.2s,box-shadow 0.2s", boxSizing: "border-box"
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", animation: "overlay-in 0.15s ease" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{
          background: "linear-gradient(145deg,rgba(12,16,32,0.99),rgba(8,11,24,0.99))",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 26,
          padding: "32px", width: 460, maxWidth: "93vw",
          boxShadow: "0 40px 100px rgba(0,0,0,0.9),0 0 0 1px rgba(74,222,128,0.06),inset 0 1px 0 rgba(255,255,255,0.06)",
          animation: "modal-in 0.32s cubic-bezier(0.34,1.56,0.64,1)"
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f1f5f9", lineHeight: 1 }}>{editTarget ? "Edit Limit" : "Set App Limit"}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 5 }}>Define a daily usage boundary</div>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.06)", color: "#64748b", cursor: "pointer", fontSize: 16, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#94a3b8"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#64748b"; }}>✕</button>
          </div>

          {/* App Name */}
          <div style={{ marginBottom: 22, position: "relative" }}>
            <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>App Name</div>
            <div style={{ position: "relative" }}>
              <input value={query} onChange={e => { setQuery(e.target.value); setShowD(true); if (!editTarget) setApp(""); }}
                placeholder="Search app or type .exe name" disabled={!!editTarget}
                style={{ ...inp, opacity: editTarget ? 0.5 : 1, cursor: editTarget ? "not-allowed" : "text" }}
                onFocus={e => { e.target.style.border = "1px solid rgba(74,222,128,0.45)"; e.target.style.boxShadow = "0 0 0 3px rgba(74,222,128,0.09)"; setShowD(true); }}
                onBlur={e => { e.target.style.border = "1px solid rgba(255,255,255,0.09)"; e.target.style.boxShadow = "none"; setTimeout(() => setShowD(false), 200); }} />
              {showD && filtered.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 110, background: "rgba(10,14,28,0.99)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 13, overflow: "hidden", backdropFilter: "blur(28px)", boxShadow: "0 14px 52px rgba(0,0,0,0.7)" }}>
                  {filtered.map(a => (
                    <div key={a.appid + a.name} onClick={() => { setQuery(a.name); setApp(a.exe || a.name.toLowerCase().replace(/\s+/g, "") + ".exe"); setShowD(false); }}
                      style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(74,222,128,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: "#475569" }}>{a.exe || "auto-detect"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!editTarget && app && <div style={{ marginTop: 8, fontSize: 11, color: "#4ade80", display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />Target: <strong>{app}</strong></div>}
            {!editTarget && knownApps.length > 0 && !app && query.length === 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {knownApps.slice(0, 6).map(a => (
                  <button key={a} onClick={() => { setApp(a); setQuery(a.replace(".exe", "")); }}
                    style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", border: "1px solid rgba(255,255,255,0.08)", background: app === a ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.04)", color: app === a ? "#4ade80" : "#64748b", transition: "all 0.15s" }}>
                    {a.replace(".exe", "")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Daily Limit — time inputs + presets (one section only) */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Daily Limit</div>
              {secs > 0 && <span style={{ fontSize: 12, color: "#4ade80", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fmtTime(secs)}</span>}
            </div>

            {/* H : M inputs */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20 }}>
              <div className="time-field-wrap">
                <input type="number" min="0" max="23" value={h}
                  onChange={e => setH(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  onBlur={e => setH(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  placeholder="00" className="time-field" />
                <span className="time-field-label">Hours</span>
              </div>
              <span className="time-colon">:</span>
              <div className="time-field-wrap">
                <input type="number" min="0" max="59" value={m}
                  onChange={e => setM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  onBlur={e => setM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  placeholder="00" className="time-field" />
                <span className="time-field-label">Minutes</span>
              </div>
            </div>

            {/* Presets — single row, no duplicate "Quick add" */}
            <div style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 600 }}>Presets</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PRESETS.map(([ph, pm, lbl]) => {
                const ps = ph * 3600 + pm * 60, active = secs === ps;
                return (
                  <button key={lbl} className="preset-btn" onClick={() => { setH(ph); setM(pm); }}
                    style={{ border: active ? "1px solid rgba(74,222,128,0.42)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(74,222,128,0.13)" : "rgba(255,255,255,0.04)", color: active ? "#4ade80" : "#64748b", boxShadow: active ? "0 0 14px rgba(74,222,128,0.15)" : "none" }}>
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Warn if limit is below today's already-used time */}
          {(() => {
            const todayUsed = stats?.reduce((a, s) => s.app === targetApp ? a + s.active : a, 0) || 0;
            if (todayUsed > 0 && secs > 0 && todayUsed >= secs) {
              return (
                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.22)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 12, color: "#f87171", fontWeight: 600 }}>Will block immediately on save</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      You've already used <strong style={{ color: "#f1f5f9" }}>{fmtTime(todayUsed)}</strong> today — this limit will trigger the moment it's saved.
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <button className="save-btn"
            onClick={() => { if (!ok || saving) return; editTarget ? setConfirm(true) : doSave(); }}
            disabled={!ok || saving}
            style={{ cursor: ok ? "pointer" : "not-allowed", background: ok ? "linear-gradient(135deg,#4ade80 0%,#22d3ee 100%)" : "rgba(255,255,255,0.05)", color: ok ? "#060c14" : "#334155", boxShadow: ok ? "0 0 26px rgba(74,222,128,0.22),0 4px 16px rgba(0,0,0,0.3)" : "none" }}>
            {saving
              ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}><span style={{ display: "inline-block", width: 15, height: 15, border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "#060c14", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Saving…</span>
              : (editTarget ? "Update Limit" : "Set Limit")}
          </button>
        </div>
      </div>

      {confirm && (
        <ConfirmModal title="Update this limit?"
          message={`Updating daily limit for "${(app || editTarget?.app_name || "").replace(".exe", "")}" to ${fmtTime(secs)}.`}
          confirmLabel="Update Limit" confirmColor="#60a5fa" confirmBg="rgba(96,165,250,0.12)" icon="✏️"
          onConfirm={() => { setConfirm(false); doSave(); }}
          onCancel={() => setConfirm(false)} />
      )}
    </>
  );
}

// ─── UNBLOCK MODAL ────────────────────────────────────────────────────────────
function UnblockModal({ appName, onClose, onUnblock }) {
  const [mins, setMins] = useState(30);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", animation: "overlay-in 0.15s ease" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background: "linear-gradient(145deg,rgba(12,16,32,0.99),rgba(8,11,24,0.99))", border: "1px solid rgba(251,191,36,0.14)", borderRadius: 24, padding: "32px", width: 380, maxWidth: "93vw", boxShadow: "0 36px 88px rgba(0,0,0,0.9),0 0 0 1px rgba(251,191,36,0.06),inset 0 1px 0 rgba(255,255,255,0.05)", animation: "modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 58, height: 58, borderRadius: "50%", background: "radial-gradient(circle,rgba(251,191,36,0.16) 0%,transparent 70%)", border: "1px solid rgba(251,191,36,0.22)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26, animation: "bounce-in 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>🔓</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f1f5f9", marginBottom: 6 }}>Temporary Unblock</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Allow <strong style={{ color: "#fbbf24" }}>{appName.replace(".exe", "")}</strong> for how long?</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 24 }}>
            {[15, 30, 60, 120].map(opt => (
              <button key={opt} className="unblock-opt" onClick={() => setMins(opt)}
                style={{ border: `1px solid ${mins === opt ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.07)"}`, background: mins === opt ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)", color: mins === opt ? "#fbbf24" : "#64748b", boxShadow: mins === opt ? "0 0 18px rgba(251,191,36,0.16)" : "none" }}>
                {opt < 60 ? `${opt} min` : `${opt / 60} hr`}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#64748b", fontSize: 14, fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s" }}
              onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.09)"}
              onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.04)"}>Cancel</button>
            <button onClick={() => setConfirm(true)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#060c14", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 0 22px rgba(251,191,36,0.28)", transition: "all 0.2s" }}
              onMouseEnter={e => { e.target.style.transform = "translateY(-2px)"; e.target.style.filter = "brightness(1.1)"; }}
              onMouseLeave={e => { e.target.style.transform = "none"; e.target.style.filter = "none"; }}>Unblock</button>
          </div>
        </div>
      </div>
      {confirm && (
        <ConfirmModal title="Confirm Unblock?"
          message={`"${appName.replace(".exe", "")}" will be accessible for ${mins < 60 ? `${mins} minutes` : `${mins / 60} hour`}.`}
          confirmLabel={`Unblock for ${mins < 60 ? `${mins}m` : `${mins / 60}h`}`}
          confirmColor="#fbbf24" confirmBg="rgba(251,191,36,0.12)" icon="🔓"
          onConfirm={() => { onUnblock(appName, mins); onClose(); setConfirm(false); }}
          onCancel={() => setConfirm(false)} />
      )}
    </>
  );
}

// ─── LIMITS PAGE ─────────────────────────────────────────────────────────────
export default function LimitsPage({ BASE, stats }) {
  useEffect(() => { injectStyles(); }, []);

  const [limits, setLimits] = useState([]);
  const [blocked, setBlocked] = useState([]);
  // ── Persisted in localStorage — survives tab switches ──
  const [tempUnblocks, setTempUnblocks] = useState(() => loadTempUnblocks());
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [view, setView] = useState("limits");
  const [loadingL, setLoadingL] = useState(true);
  const [toast, setToast] = useState(null);
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const toastTimer = useRef(null);
  const resetLabel = useResetCountdown();

  // ── Track which apps were ALREADY blocked when the page first loaded.
  //    We never log a breach event for apps that were blocked on mount —
  //    only genuine NEW transitions (was unblocked → now blocked) get logged.
  const initialBlockedRef = useRef(null);   // Set<string> populated on first fetch
  const knownBlockedRef = useRef(new Set()); // tracks current known-blocked set across polls

  // Keep localStorage in sync whenever tempUnblocks changes
  useEffect(() => { saveTempUnblocks(tempUnblocks); }, [tempUnblocks]);

  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});

  const showT = useCallback((msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [lr, br] = await Promise.all([
        fetch(`${BASE}/limits/all`).then(r => r.json()),
        fetch(`${BASE}/limits/blocked`).then(r => r.json()),
      ]);
      const newLimits = Array.isArray(lr) ? lr : [];
      const newBlockedFromLimits = newLimits.filter(l => l.is_blocked && l.is_enabled).map(l => l.app_name);
      const legacyBlocked = Array.isArray(br) ? br.map(b => b.app_name || b) : [];
      const newBlockedNames = Array.from(new Set([...newBlockedFromLimits, ...legacyBlocked]));

      // ── BREACH LOG ONLY: track transitions for logging purposes.
      //    initialBlockedRef guards against logging apps that were ALREADY blocked
      //    when the page first opened (they'd spam the log on every poll otherwise).
      //    This does NOT affect which apps appear as blocked in the UI.
      if (initialBlockedRef.current === null) {
        // First fetch — snapshot the initial blocked set, don't log any of them
        initialBlockedRef.current = new Set(newBlockedNames);
        knownBlockedRef.current = new Set(newBlockedNames);
      } else {
        // Subsequent polls — log only NEWLY blocked apps (not in last poll AND not in initial snapshot)
        newBlockedNames.forEach(name => {
          if (!knownBlockedRef.current.has(name) && !initialBlockedRef.current.has(name)) {
            const limitObj = newLimits.find(l => l.app_name === name);
            appendBreachLog({
              ts: Date.now(),
              app: name,
              type: "blocked",
              note: limitObj ? `Daily limit of ${fmtTime(limitObj.daily_limit_seconds)} reached` : "Daily limit reached"
            });
          }
        });
        knownBlockedRef.current = new Set(newBlockedNames);
      }

      // ── ALWAYS update blocked state from the API response.
      //    But also preserve any apps that were optimistically re-blocked locally
      //    (they may not be in the API response yet if the backend hasn't caught up).
      setLimits(newLimits);
      setBlocked(prev => {
        const apiSet = new Set(newBlockedNames);
        // Keep any locally-added entries that aren't in the API yet
        const localOnly = prev.filter(n => !apiSet.has(n) && knownBlockedRef.current.has(n));
        return [...newBlockedNames, ...localOnly];
      });
      setOffline(false);
      setLastSync(new Date());
    } catch {
      setOffline(true);
    }
    setLoadingL(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BASE]);

  useVisibilityPolling(fetchAll, {
    visibleIntervalMs: 30_000,
    hiddenIntervalMs: 120_000,
    immediate: true,
  });

  // ── Optimistic mutations ──
  const save = async (name, secs) => {
    setLimits(prev => {
      const ex = prev.find(l => l.app_name === name);
      return ex ? prev.map(l => l.app_name === name ? { ...l, daily_limit_seconds: secs } : l) : [...prev, { app_name: name, daily_limit_seconds: secs, is_enabled: true }];
    });
    try {
      await fetch(`${BASE}/limits/set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, limit_seconds: secs }) });
      showT(`Limit set for ${name.replace(".exe", "")}`);
    } catch { showT("Failed to save", "warn"); }
    fetchAll();
  };

  const toggle = async (name, en) => {
    setLimits(prev => prev.map(l => l.app_name === name ? { ...l, is_enabled: en } : l));
    try {
      await fetch(`${BASE}/limits/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, enabled: en }) });
      showT(en ? "Limit enabled" : "Limit paused", en ? "success" : "warn");
    } catch { showT("Toggle failed", "warn"); }
    fetchAll();
    return Promise.resolve();
  };

  const del = async (name) => {
    setLimits(prev => prev.filter(l => l.app_name !== name));
    try {
      await fetch(`${BASE}/limits/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name }) });
      showT(`Limit removed for ${name.replace(".exe", "")}`, "warn");
    } catch { showT("Delete failed", "warn"); }
    fetchAll();
  };

  const unblock = async (name, minutes) => {
    const expiresAt = Date.now() + minutes * 60 * 1000;
    const totalSeconds = minutes * 60;

    // Persist immediately — survives tab switches
    setTempUnblocks(prev => ({ ...prev, [name]: { expiresAt, totalSeconds } }));
    setBlocked(prev => prev.filter(b => b !== name));
    // Remove from knownBlockedRef so that when the app re-hits its limit after the
    // temp unblock expires, that transition IS logged as a new breach.
    // Keep it in initialBlockedRef — we don't want to re-log on the next poll
    // if the backend still reports it as blocked before the unblock takes effect.
    knownBlockedRef.current.delete(name);

    // Log the unblock event
    appendBreachLog({
      ts: Date.now(),
      app: name,
      type: "unblocked",
      note: `Temporarily unblocked for ${minutes} min`
    });

    try {
      await fetch(`${BASE}/limits/unblock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, minutes }) });
      showT(`${name.replace(".exe", "")} unblocked for ${minutes}m`);
    } catch { showT("Unblock failed", "warn"); }
  };

  // Called when a temp-unblock timer hits zero
  const handleTempExpired = useCallback((name) => {
    setTempUnblocks(prev => { const n = { ...prev }; delete n[name]; return n; });
    fetchAll();
  }, [fetchAll]);

  // Called when user clicks "Re-block now" on a temp-unblock card
  const handleReblock = useCallback((name) => {
    // Remove from temp-unblocks so the temp card disappears
    setTempUnblocks(prev => { const n = { ...prev }; delete n[name]; return n; });
    // Optimistically add back to blocked state immediately — do NOT call fetchAll()
    // here because the async API response would overwrite this before the backend
    // has a chance to re-enforce the block.
    setBlocked(prev => prev.includes(name) ? prev : [...prev, name]);
    // Sync breach-log refs so the next scheduled poll doesn't log a spurious entry
    knownBlockedRef.current.add(name);
    if (initialBlockedRef.current) initialBlockedRef.current.add(name);
    showT(`${name.replace(".exe", "")} re-blocked`, "warn");
    // Persist to backend so block is immediately re-applied regardless of temp timer.
    fetch(`${BASE}/limits/reblock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_name: name })
    })
      .then(() => fetchAll())
      .catch(() => showT("Failed to re-block app", "warn"));
  }, [BASE, showT, fetchAll]);

  const knownApps = Array.from(new Set(stats.map(s => s.app))).filter(a => !limits.find(l => l.app_name === a));
  const blockedNow = limits.filter(l => blocked.includes(l.app_name) && l.is_enabled && !tempUnblocks[l.app_name]);
  const nearLimit = limits.filter(l => { const u = usage[l.app_name] || 0; return u >= l.daily_limit_seconds * 0.8 && u < l.daily_limit_seconds; });
  const tempUnblockEntries = Object.entries(tempUnblocks);
  const breachCount = loadBreachLog().filter(e => {
    const today = new Date().toDateString();
    return new Date(e.ts).toDateString() === today && e.type === "blocked";
  }).length;

  const baseList = view === "blocked" ? blockedNow : limits;
  const filteredList = baseList.filter(l => !search || l.app_name.toLowerCase().includes(search.toLowerCase()));
  const displayList = [...filteredList].sort((a, b) => {
    if (sort === "usage") return (usage[b.app_name] || 0) - (usage[a.app_name] || 0);
    if (sort === "status") { const r = l => blocked.includes(l.app_name) ? 0 : !l.is_enabled ? 2 : 1; return r(a) - r(b); }
    return a.app_name.localeCompare(b.app_name);
  });

  const syncAgo = lastSync ? (() => {
    const s = Math.floor((Date.now() - lastSync) / 1000);
    return s < 10 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  })() : null;

  const STATS = [
    { color: "#4ade80", bg: "rgba(74,222,128,0.05)", border: "rgba(74,222,128,0.12)", label: "Active Limits", val: limits.filter(l => l.is_enabled).length, sub: `${limits.length} total configured` },
    { color: "#f87171", bg: "rgba(248,113,113,0.05)", border: "rgba(248,113,113,0.12)", label: "Blocked Now", val: blockedNow.length, sub: "apps hit their limit today" },
    { color: "#fbbf24", bg: "rgba(251,191,36,0.05)", border: "rgba(251,191,36,0.12)", label: "Near Limit", val: nearLimit.length, sub: "apps above 80% usage" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 400, background: toast.type === "warn" ? "rgba(14,11,4,0.98)" : "rgba(4,11,8,0.98)", border: `1px solid ${toast.type === "warn" ? "rgba(251,191,36,0.3)" : "rgba(74,222,128,0.3)"}`, borderRadius: 14, padding: "13px 20px", color: toast.type === "warn" ? "#fbbf24" : "#4ade80", fontSize: 13, fontWeight: 500, backdropFilter: "blur(28px)", boxShadow: "0 14px 44px rgba(0,0,0,0.55)", display: "flex", alignItems: "center", gap: 10, animation: "toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
          <span style={{ fontSize: 15 }}>{toast.type === "warn" ? "⚠️" : "✓"}</span>{toast.msg}
        </div>
      )}

      {/* Offline banner */}
      {offline && (
        <div className="offline-banner">
          <span style={{ fontSize: 14 }}>📡</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>Can't reach backend</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Showing last known data — changes won't save until reconnected.</div>
          </div>
          <button onClick={fetchAll} style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.1)", color: "#f87171", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Retry</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 13, padding: 4 }}>
          {[["limits", `All (${limits.length})`], ["blocked", `Blocked (${blockedNow.length})`]].map(([v, lbl]) => (
            <button key={v} className="tab-btn" onClick={() => setView(v)}
              style={{ background: view === v ? "rgba(74,222,128,0.1)" : "transparent", color: view === v ? "#4ade80" : "#475569" }}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {syncAgo && <span style={{ fontSize: 10, color: "#2d3d55" }}>Updated {syncAgo}</span>}

          {/* Breach log button with today's count badge */}
          <button onClick={() => setShowLog(true)} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 11,
            border: "1px solid rgba(248,113,113,0.22)", cursor: "pointer",
            background: "rgba(248,113,113,0.07)", color: "#f87171",
            fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)"
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.14)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.07)"; e.currentTarget.style.transform = "none"; }}>
            📋 Breach Log
            {breachCount > 0 && (
              <span style={{ background: "#f87171", color: "#060c14", borderRadius: 6, fontSize: 10, fontWeight: 800, padding: "1px 6px", lineHeight: 1.5 }}>{breachCount}</span>
            )}
          </button>

          <button className="add-limit-btn" onClick={() => { setEditTarget(null); setShowModal(true); }}>
            <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 300 }}>+</span> Add Limit
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {STATS.map(({ color, bg, border, label, val, sub }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 7, fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#f1f5f9", fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Reset + Search + Sort row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#475569" }}>
          <span style={{ fontSize: 13 }}>🕛</span>
          <span>{resetLabel}</span>
          <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.08)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "#2d3d55" }}>Counters reset at midnight</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#334155", pointerEvents: "none" }}>🔍</span>
            <input className="search-bar" style={{ width: 168 }} placeholder="Search limits…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {[["name", "A–Z"], ["usage", "Most Used"], ["status", "Status"]].map(([s, lbl]) => (
              <button key={s} className={`sort-btn${sort === s ? " active" : ""}`} onClick={() => setSort(s)}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Temporarily Unblocked Section — persisted via localStorage ── */}
      {tempUnblockEntries.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.12em" }}>Temporarily Unblocked</div>
            <div style={{ flex: 1, height: 1, background: "rgba(34,211,238,0.15)" }} />
            <div style={{ fontSize: 11, color: "#334155" }}>{tempUnblockEntries.length} app{tempUnblockEntries.length > 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
            {tempUnblockEntries.map(([name, { expiresAt, totalSeconds }]) => (
              <TempUnblockCard key={name} appName={name} expiresAt={expiresAt} totalSeconds={totalSeconds} onExpired={handleTempExpired} onReblock={handleReblock} />
            ))}
          </div>
        </div>
      )}

      {/* Cards */}
      {loadingL ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#475569", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "#4ade80", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Loading limits…
        </div>
      ) : displayList.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", background: "rgba(12,15,28,0.5)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{search ? "🔍" : view === "blocked" ? "✅" : "🛡️"}</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#334155", marginBottom: 8 }}>
            {search ? "No limits match your search" : view === "blocked" ? "No apps blocked right now" : "No limits configured yet"}
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>
            {search ? "Try a different term" : view === "blocked" ? "All apps are within their daily limits" : "Set limits to take control of your screen time"}
          </div>
          {view === "limits" && !search && <button className="add-limit-btn" onClick={() => { setEditTarget(null); setShowModal(true); }} style={{ display: "inline-flex", margin: "0 auto" }}>+ Set your first limit</button>}
          {search && <button onClick={() => setSearch("")} style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#64748b", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Clear search</button>}
        </div>
      ) : (
        (() => {
          const blockedCards = displayList.filter(l => blocked.includes(l.app_name) && l.is_enabled && !tempUnblocks[l.app_name]);
          const warnCards = displayList.filter(l => { const u = usage[l.app_name] || 0; return !blocked.includes(l.app_name) && u >= l.daily_limit_seconds * 0.8 && l.is_enabled; });
          const healthyCards = displayList.filter(l => !blockedCards.includes(l) && !warnCards.includes(l));

          const renderGroup = (label, color, cards, startIdx) => {
            if (cards.length === 0) return null;
            return (
              <div key={label}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
                  <div style={{ flex: 1, height: 1, background: `${color}25` }} />
                  <div style={{ fontSize: 10, color: "#334155" }}>{cards.length}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 14 }}>
                  {cards.map((l, i) => (
                    <LimitCard key={l.app_name} limit={l} index={startIdx + i} onToggle={toggle}
                      onEdit={t => { setEditTarget(t); setShowModal(true); }}
                      onDelete={del} onUnblock={n => setUnblockTarget(n)}
                      todayUsage={usage} isBlocked={blocked.includes(l.app_name) && !tempUnblocks[l.app_name]}
                      resetLabel={resetLabel} />
                  ))}
                </div>
              </div>
            );
          };

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {renderGroup("⛔ Blocked", "#f87171", blockedCards, 0)}
              {renderGroup("⚠️ Near Limit", "#fbbf24", warnCards, blockedCards.length)}
              {renderGroup("✅ Within Limit", "#4ade80", healthyCards, blockedCards.length + warnCards.length)}
            </div>
          );
        })()
      )}

      {/* System block list (only apps not temp-unblocked) */}
      {view === "blocked" && blocked.filter(b => !tempUnblocks[b]).length > 0 && (
        <SectionCard title="System Block List">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {blocked.filter(b => !tempUnblocks[b]).map((name, i) => {
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.12)", borderRadius: 12, transition: "all 0.2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 6px #f87171", animation: "pulse-dot 2s ease-in-out infinite" }} />
                    <span style={{ fontSize: 14, color: "#f1f5f9", fontWeight: 500 }}>{name.replace(".exe", "")}</span>
                  </div>
                  <button onClick={() => setUnblockTarget(name)}
                    style={{ padding: "5px 14px", borderRadius: 9, border: "none", cursor: "pointer", background: "rgba(251,191,36,0.09)", color: "#fbbf24", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s" }}
                    onMouseEnter={e => { e.target.style.background = "rgba(251,191,36,0.18)"; e.target.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.target.style.background = "rgba(251,191,36,0.09)"; e.target.style.transform = "none"; }}>🔓 Unblock</button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {showModal && <LimitModal onClose={() => { setShowModal(false); setEditTarget(null); }} onSave={save} knownApps={knownApps} editTarget={editTarget} BASE={BASE} stats={stats} />}
      {unblockTarget && <UnblockModal appName={unblockTarget} onClose={() => setUnblockTarget(null)} onUnblock={unblock} />}
      {showLog && <BreachLogPanel onClose={() => setShowLog(false)} />}
    </div>
  );
}
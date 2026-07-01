import { useState, useEffect, useRef, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

const PRESETS = [
  { label: "15m", minutes: 15 },
  { label: "25m 🍅", minutes: 25 },
  { label: "50m", minutes: 50 },
  { label: "90m", minutes: 90 },
];

// Inject once to hide native number spinners globally for this component
const SPINNER_STYLE = `
  .focus-custom-input::-webkit-outer-spin-button,
  .focus-custom-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .focus-custom-input[type=number] { -moz-appearance: textfield; }
`;
if (typeof document !== "undefined" && !document.getElementById("focus-spinner-fix")) {
  const s = document.createElement("style");
  s.id = "focus-spinner-fix";
  s.textContent = SPINNER_STYLE;
  document.head.appendChild(s);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusWidget() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState({ strict_mode: false });
  const [loading, setLoading] = useState(false);
  const [selectedMins, setSelectedMins] = useState(25);
  const [customMins, setCustomMins] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/pomodoro/status`);
      const d = await r.json();
      setStatus(d);
    } catch {
      setStatus(prev => prev);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/pomodoro/settings`);
      const d = await r.json();
      setSettings(d);
    } catch { }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSettings();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  const startSession = async () => {
    if (!selectedMins || selectedMins <= 0) return;
    setLoading(true);
    try {
      await fetch(`${BASE}/api/pomodoro/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: selectedMins }),
      });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const stopSession = async () => {
    setLoading(true);
    try {
      await fetch(`${BASE}/api/pomodoro/stop`, { method: "POST" });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const toggleStrictMode = async (val) => {
    const next = { ...settings, strict_mode: val };
    setSettings(next);
    await fetch(`${BASE}/api/pomodoro/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strict_mode: val }),
    });
  };

  const isActive = status?.active;
  const remaining = status?.remaining_seconds ?? 0;
  const pct = status?.progress_pct ?? 0;
  const durationMins = status?.duration_minutes ?? 25;

  const RADIUS = 14;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);
  const ringColor = isActive
    ? (pct < 50 ? "#4ade80" : pct < 80 ? "#fbbf24" : "#f87171")
    : "#334155";

  // ── Idle / collapsed state ────────────────────────────────────────────────
  return (
    <div style={{
      background: "rgba(15,18,34,0.95)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, marginBottom: 14, overflow: "hidden",
    }}>
      {/* ── Main row ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
      }}>
        {/* Label */}
        <span style={{
          fontSize: 11, fontWeight: 600, color: "#475569",
          textTransform: "uppercase", letterSpacing: "0.12em", flexShrink: 0,
        }}>🎯 Focus</span>

        <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

        {isActive ? (
          // ── ACTIVE VIEW ─────────────────────────────────────────────
          <>
            {/* Mini circular timer */}
            <div style={{ position: "relative", flexShrink: 0, width: 34, height: 34 }}>
              <svg width={34} height={34} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={17} cy={17} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
                <circle
                  cx={17} cy={17} r={RADIUS} fill="none"
                  stroke={ringColor} strokeWidth={3}
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: ringColor, boxShadow: `0 0 6px ${ringColor}`,
                }} />
              </div>
            </div>

            {/* Countdown */}
            <span style={{
              fontSize: 18, fontWeight: 700, color: "#f8fafc",
              fontFamily: "'DM Mono', monospace", letterSpacing: -0.5, flexShrink: 0,
            }}>
              {formatTime(remaining)}
            </span>

            {/* Thin progress bar */}
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, background: ringColor,
                width: `${pct}%`, transition: "width 1s linear, background 0.5s ease",
                boxShadow: `0 0 6px ${ringColor}60`,
              }} />
            </div>

            {/* Info */}
            <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>
              {durationMins}m · {settings.strict_mode ? "🔴" : "🟡"}
            </span>

            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

            {/* Stop */}
            <button
              onClick={stopSession} disabled={loading}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                color: "#f87171", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => e.target.style.background = "rgba(248,113,113,0.2)"}
              onMouseLeave={e => e.target.style.background = "rgba(248,113,113,0.1)"}
            >
              ⏹ Stop
            </button>
          </>
        ) : (
          // ── IDLE VIEW ───────────────────────────────────────────────
          <>
            {/* Preset chips */}
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                onClick={() => { setSelectedMins(p.minutes); setShowCustom(false); }}
                style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                  background: selectedMins === p.minutes && !showCustom
                    ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.04)",
                  border: selectedMins === p.minutes && !showCustom
                    ? "1px solid rgba(74,222,128,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color: selectedMins === p.minutes && !showCustom ? "#4ade80" : "#475569",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {p.label}
              </button>
            ))}

            {/* Custom toggle */}
            <button
              onClick={() => setShowCustom(v => !v)}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                background: showCustom ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: showCustom ? "#cbd5e1" : "#334155", cursor: "pointer",
              }}
            >
              {showCustom ? `${selectedMins}m ✎` : "···"}
            </button>

            {showCustom && (
              <div style={{
                display: "flex", alignItems: "center", flexShrink: 0,
                background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, overflow: "hidden",
              }}>
                {/* Decrement */}
                <button
                  onClick={() => {
                    const next = Math.max(1, (selectedMins || 1) - 5);
                    setSelectedMins(next);
                    setCustomMins(String(next));
                  }}
                  style={{
                    width: 22, height: 26, border: "none", background: "transparent",
                    color: "#64748b", fontSize: 14, cursor: "pointer", lineHeight: 1,
                    transition: "color 0.15s", flexShrink: 0,
                  }}
                  onMouseEnter={e => e.target.style.color = "#cbd5e1"}
                  onMouseLeave={e => e.target.style.color = "#64748b"}
                >−</button>

                {/* Text value */}
                <input
                  className="focus-custom-input"
                  type="number" min={1} max={480}
                  value={customMins || selectedMins}
                  onChange={e => {
                    setCustomMins(e.target.value);
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 0) setSelectedMins(v);
                  }}
                  style={{
                    width: 38, background: "transparent", border: "none",
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    color: "#f8fafc", fontSize: 11, fontWeight: 700,
                    textAlign: "center", outline: "none", padding: "4px 2px",
                    fontFamily: "'DM Mono', monospace",
                  }}
                />

                {/* Increment */}
                <button
                  onClick={() => {
                    const next = Math.min(480, (selectedMins || 1) + 5);
                    setSelectedMins(next);
                    setCustomMins(String(next));
                  }}
                  style={{
                    width: 22, height: 26, border: "none", background: "transparent",
                    color: "#64748b", fontSize: 14, cursor: "pointer", lineHeight: 1,
                    transition: "color 0.15s", flexShrink: 0,
                  }}
                  onMouseEnter={e => e.target.style.color = "#cbd5e1"}
                  onMouseLeave={e => e.target.style.color = "#64748b"}
                >+</button>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* Strict mode micro-toggle */}
            <button
              onClick={() => toggleStrictMode(!settings.strict_mode)}
              title={settings.strict_mode ? "Strict (kills process)" : "Soft (minimises window)"}
              style={{
                flexShrink: 0,
                width: 28, height: 16, borderRadius: 8, cursor: "pointer",
                background: settings.strict_mode ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)",
                border: settings.strict_mode ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: settings.strict_mode ? 13 : 2,
                width: 11, height: 11, borderRadius: "50%",
                background: settings.strict_mode ? "#ef4444" : "#475569",
                transition: "left 0.2s, background 0.2s",
              }} />
            </button>

            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

            {/* Start */}
            <button
              onClick={startSession} disabled={loading}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "6px 16px", borderRadius: 8,
                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)",
                color: "#4ade80", cursor: "pointer", letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.target.style.background = "rgba(74,222,128,0.22)"; e.target.style.color = "#86efac"; }}
              onMouseLeave={e => { e.target.style.background = "rgba(74,222,128,0.12)"; e.target.style.color = "#4ade80"; }}
            >
              ▶ Start
            </button>
          </>
        )}
      </div>
    </div>
  );
}

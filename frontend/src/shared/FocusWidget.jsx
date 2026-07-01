import { useState, useEffect, useRef, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

const PRESETS = [
  { label: "15m", minutes: 15, color: "#60a5fa" },
  { label: "25m 🍅", minutes: 25, color: "#4ade80" },
  { label: "50m", minutes: 50, color: "#a78bfa" },
  { label: "90m 🔥", minutes: 90, color: "#f59e0b" },
];

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PresetButton({ p, loading, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8,
        background: hover && !loading ? `${p.color}25` : `${p.color}15`, 
        border: `1px solid ${p.color}40`,
        color: p.color, cursor: loading ? "default" : "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {p.label}
    </button>
  );
}

export default function FocusWidget() {
  const [status, setStatus] = useState(null); // null = not loaded yet
  const [settings, setSettings] = useState({ strict_mode: false });
  const [loading, setLoading] = useState(false);
  const [customMins, setCustomMins] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/pomodoro/status`);
      const d = await r.json();
      setStatus(d);
    } catch {
      setStatus(prev => prev); // keep stale on network error
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

  const startSession = async (minutes) => {
    setLoading(true);
    try {
      await fetch(`${BASE}/api/pomodoro/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
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

  // SVG circle ring
  const RADIUS = 42;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  const ringColor = isActive
    ? (pct < 50 ? "#4ade80" : pct < 80 ? "#fbbf24" : "#f87171")
    : "#334155";

  return (
    <div style={{
      background: "rgba(15,18,30,0.5)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 20, padding: "20px 20px 16px", marginBottom: 16,
      backdropFilter: "blur(12px)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>🍅 Focus Mode</span>
        {isActive && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#4ade80",
            background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)",
            borderRadius: 20, padding: "3px 10px", animation: "pulse-glow 2s infinite"
          }}>ACTIVE</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {/* SVG circular timer */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
            {/* Track */}
            <circle cx={50} cy={50} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
            {/* Progress */}
            <circle
              cx={50} cy={50} r={RADIUS} fill="none"
              stroke={ringColor} strokeWidth={7}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={isActive ? dashOffset : CIRCUMFERENCE}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center"
          }}>
            <span style={{
              fontSize: 20, fontWeight: 700, color: "#f8fafc",
              fontFamily: "'DM Mono', monospace", letterSpacing: -1,
            }}>
              {isActive ? formatTime(remaining) : formatTime(durationMins * 60)}
            </span>
            {isActive && (
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>remaining</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ flex: 1 }}>
          {!isActive ? (
            <>
              {/* Preset buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {PRESETS.map((p) => (
                  <PresetButton
                    key={p.minutes}
                    p={p}
                    loading={loading}
                    onClick={() => startSession(p.minutes)}
                  />
                ))}
                <button
                  onClick={() => setShowCustom(v => !v)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#94a3b8", cursor: "pointer",
                  }}
                >
                  Custom
                </button>
              </div>

              {/* Custom minutes input */}
              {showCustom && (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <input
                    type="number" min={1} max={480} placeholder="e.g. 45"
                    value={customMins}
                    onChange={e => setCustomMins(e.target.value)}
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8, padding: "5px 10px", color: "#f8fafc", fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => { 
                      const parsed = parseInt(customMins, 10);
                      if (!isNaN(parsed) && parsed > 0) { 
                        startSession(parsed); 
                        setShowCustom(false); 
                      } 
                    }}
                    disabled={!customMins || loading}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                      background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
                      color: "#4ade80", cursor: "pointer",
                    }}
                  >
                    Start
                  </button>
                </div>
              )}

              {/* Strict mode toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => toggleStrictMode(!settings.strict_mode)}
                  style={{
                    width: 34, height: 18, borderRadius: 9, cursor: "pointer",
                    background: settings.strict_mode ? "#ef4444" : "rgba(255,255,255,0.1)",
                    border: "none", position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: "absolute", top: 2, left: settings.strict_mode ? 18 : 2,
                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s",
                  }} />
                </button>
                <span style={{ fontSize: 10, color: "#64748b" }}>
                  {settings.strict_mode ? "🔴 Strict mode (kills process)" : "🟡 Soft mode (minimises window)"}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                  {durationMins}m session in progress
                </div>
                <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    background: ringColor,
                    width: `${pct}%`,
                    transition: "width 1s linear, background 0.5s ease",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: "#475569" }}>
                    {Math.round(pct)}% elapsed
                  </span>
                  <span style={{ fontSize: 9, color: "#475569" }}>
                    {settings.strict_mode ? "🔴 Strict" : "🟡 Soft"}
                  </span>
                </div>
              </div>
              <button
                onClick={stopSession}
                disabled={loading}
                style={{
                  width: "100%", fontSize: 11, fontWeight: 700, padding: "7px 0", borderRadius: 8,
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                  color: "#f87171", cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.target.style.background = "rgba(248,113,113,0.2)"; }}
                onMouseLeave={e => { e.target.style.background = "rgba(248,113,113,0.1)"; }}
              >
                🏳️ Give Up / Stop Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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

function PresetButton({ p, isSelected, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
        background: isSelected ? `${p.color}35` : (hover ? `${p.color}25` : `${p.color}10`), 
        border: `1px solid ${isSelected ? p.color : `${p.color}30`}`,
        color: isSelected ? "#fff" : p.color, 
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: isSelected ? `0 0 12px ${p.color}25` : "none",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {p.label}
    </button>
  );
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

  // SVG circle ring
  const RADIUS = 42;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  const ringColor = isActive
    ? (pct < 50 ? "#4ade80" : pct < 80 ? "#fbbf24" : "#f87171")
    : "#3b82f6";

  return (
    <div style={{
      background: "rgba(15,18,30,0.6)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 24, padding: "24px", marginBottom: 20,
      backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.3px" }}>
            Focus Mode
          </span>
        </div>
        {isActive && (
          <span style={{
            fontSize: 10, fontWeight: 800, color: "#4ade80", letterSpacing: "0.5px",
            background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)",
            borderRadius: 20, padding: "4px 12px", animation: "pulse-glow 2s infinite"
          }}>SESSION ACTIVE</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        {/* SVG circular timer */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg width={100} height={100} style={{ transform: "rotate(-90deg)", filter: isActive ? "drop-shadow(0 0 8px rgba(74,222,128,0.2))" : "none" }}>
            {/* Track */}
            <circle cx={50} cy={50} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={7} />
            {/* Progress */}
            <circle
              cx={50} cy={50} r={RADIUS} fill="none"
              stroke={ringColor} strokeWidth={7}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={isActive ? dashOffset : 0}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center"
          }}>
            <span style={{
              fontSize: 22, fontWeight: 700, color: "#f8fafc",
              fontFamily: "'DM Mono', monospace", letterSpacing: -1,
            }}>
              {isActive ? formatTime(remaining) : formatTime(selectedMins * 60)}
            </span>
            {isActive && (
              <span style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>remaining</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ flex: 1 }}>
          {!isActive ? (
            <>
              {/* Preset buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {PRESETS.map((p) => (
                  <PresetButton
                    key={p.minutes}
                    p={p}
                    isSelected={selectedMins === p.minutes && !showCustom}
                    onClick={() => {
                      setSelectedMins(p.minutes);
                      setShowCustom(false);
                    }}
                  />
                ))}
                <button
                  onClick={() => setShowCustom(true)}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                    background: showCustom ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                    border: showCustom ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
                    color: showCustom ? "#fff" : "#94a3b8", cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  Custom
                </button>
              </div>

              {/* Custom minutes input */}
              {showCustom && (
                <div style={{ marginBottom: 12 }}>
                  <input
                    type="number" min={1} max={480} placeholder="Enter minutes (e.g. 45)"
                    value={customMins}
                    onChange={e => {
                      setCustomMins(e.target.value);
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) setSelectedMins(val);
                    }}
                    style={{
                      width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 8, padding: "8px 12px", color: "#f8fafc", fontSize: 13,
                      outline: "none", transition: "border 0.2s"
                    }}
                    onFocus={e => e.target.style.border = "1px solid rgba(255,255,255,0.3)"}
                    onBlur={e => e.target.style.border = "1px solid rgba(255,255,255,0.15)"}
                  />
                </div>
              )}

              {/* Start Button & Settings row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <button
                  onClick={startSession}
                  disabled={loading || !selectedMins}
                  style={{
                    padding: "10px 24px", borderRadius: 10,
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                    border: "none", color: "#fff", fontSize: 13, fontWeight: 800,
                    letterSpacing: "0.5px",
                    cursor: (loading || !selectedMins) ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 12px rgba(59,130,246,0.3)",
                    transition: "transform 0.1s, filter 0.2s",
                  }}
                  onMouseEnter={e => e.target.style.filter = "brightness(1.1)"}
                  onMouseLeave={e => e.target.style.filter = "none"}
                  onMouseDown={e => e.target.style.transform = "scale(0.96)"}
                  onMouseUp={e => e.target.style.transform = "scale(1)"}
                >
                  START TIMER
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
                    {settings.strict_mode ? "Strict (Kill)" : "Soft (Minimise)"}
                  </span>
                  <button
                    onClick={() => toggleStrictMode(!settings.strict_mode)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                      background: settings.strict_mode ? "#ef4444" : "rgba(255,255,255,0.1)",
                      border: "none", position: "relative", transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 2, left: settings.strict_mode ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                    }} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
                    {durationMins}m session in progress
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                    {settings.strict_mode ? "🔴 Strict Mode" : "🟡 Soft Mode"}
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.3)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    background: ringColor,
                    width: `${pct}%`,
                    transition: "width 1s linear, background 0.5s ease",
                    boxShadow: `0 0 10px ${ringColor}80`
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "#64748b", fontWeight: 500 }}>
                    {Math.round(pct)}% elapsed
                  </span>
                </div>
              </div>
              <button
                onClick={stopSession}
                disabled={loading}
                style={{
                  width: "100%", fontSize: 12, fontWeight: 700, padding: "10px 0", borderRadius: 10,
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                  color: "#fca5a5", cursor: "pointer", transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { e.target.style.background = "rgba(248,113,113,0.2)"; e.target.style.color = "#fecaca"; }}
                onMouseLeave={e => { e.target.style.background = "rgba(248,113,113,0.1)"; e.target.style.color = "#fca5a5"; }}
              >
                ⏹ Stop Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * LoadingScreen.jsx — Stasis
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone branded splash shown while the Flask backend is starting up.
 *
 * HOW TO USE:
 *   import LoadingScreen from "./LoadingScreen";
 *
 *   function App() {
 *     const [ready, setReady] = useState(false);
 *     if (!ready) return <LoadingScreen onReady={() => setReady(true)} />;
 *     return <WellbeingDashboard />;
 *   }
 *
 * PROPS:
 *   onReady       — called once the backend health check succeeds
 *   healthUrl     — endpoint to poll (default: "http://127.0.0.1:7432/api/health")
 *   retryInterval — ms between polls (default: 1500)
 *   maxRetries    — give up and show error after N failures (default: 40 = 60s)
 */

import { useState, useEffect, useRef, useCallback } from "react";

const HEALTH_URL = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:7432'}/api/health`;
const RETRY_INTERVAL = 1500;
const MAX_RETRIES = 40;

// ─── DESIGN TOKENS (match WellbeingDashboard exactly) ────────────────────────
const C = {
  bg: "#080b14",
  surface: "rgba(14,17,30,0.9)",
  border: "rgba(255,255,255,0.07)",
  borderMed: "rgba(255,255,255,0.11)",
  text: "#f0f4f8",
  textSub: "#94a3b8",
  textMuted: "#475569",
  textDim: "#2d3748",
  textGhost: "#1e293b",
  green: "#4ade80",
  greenDim: "#22c55e",
  cyan: "#22d3ee",
  red: "#f87171",
  yellow: "#fbbf24",
};

// ─── STATUS MESSAGES — cycle through these while waiting ─────────────────────
const STATUS_MSGS = [
  "Initialising core services…",
  "Loading activity database…",
  "Waking up the tracker…",
  "Syncing Telegram bridge…",
  "Calibrating focus engine…",
  "Almost there…",
];

// ─── KEYFRAMES ────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@300;400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Core pulses & spins ── */
  @keyframes ls-spin       { to { transform: rotate(360deg); } }
  @keyframes ls-spin-rev   { to { transform: rotate(-360deg); } }
  @keyframes ls-pulse-glow {
    0%, 100% { opacity: 0.55; transform: scale(1);    }
    50%       { opacity: 1;    transform: scale(1.06); }
  }
  @keyframes ls-ping {
    0%   { transform: scale(0.95); opacity: 0.7; }
    70%  { transform: scale(1.9);  opacity: 0;   }
    100% { transform: scale(1.9);  opacity: 0;   }
  }
  @keyframes ls-ping-slow {
    0%   { transform: scale(0.95); opacity: 0.35; }
    70%  { transform: scale(2.6);  opacity: 0;    }
    100% { transform: scale(2.6);  opacity: 0;    }
  }

  /* ── Wordmark entrance ── */
  @keyframes ls-word-in {
    from { opacity: 0; transform: translateY(18px) scale(0.96); filter: blur(4px); }
    to   { opacity: 1; transform: translateY(0)     scale(1);    filter: blur(0);   }
  }
  @keyframes ls-tag-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes ls-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Grid lines ── */
  @keyframes ls-line-grow-h {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  @keyframes ls-line-grow-v {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }

  /* ── Status text swap ── */
  @keyframes ls-msg-in {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0);    }
  }
  @keyframes ls-msg-out {
    from { opacity: 1; transform: translateX(0);   }
    to   { opacity: 0; transform: translateX(8px); }
  }

  /* ── Progress bar fill ── */
  @keyframes ls-bar-pulse {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1;   }
  }

  /* ── Dot scanner ── */
  @keyframes ls-dot-scan {
    0%   { opacity: 0.2; transform: scale(0.7); }
    50%  { opacity: 1;   transform: scale(1);   }
    100% { opacity: 0.2; transform: scale(0.7); }
  }

  /* ── Particle drift ── */
  @keyframes ls-drift-1 { 0%,100% { transform:translate(0,0)   opacity:0.4; } 50%{ transform:translate(6px,-10px)  opacity:0.9; } }
  @keyframes ls-drift-2 { 0%,100% { transform:translate(0,0)   opacity:0.3; } 50%{ transform:translate(-8px,-6px) opacity:0.7; } }
  @keyframes ls-drift-3 { 0%,100% { transform:translate(0,0)   opacity:0.5; } 50%{ transform:translate(4px,-14px) opacity:1;   } }
  @keyframes ls-drift-4 { 0%,100% { transform:translate(0,0)   opacity:0.2; } 50%{ transform:translate(-5px,-8px) opacity:0.6; } }

  /* ── Retry shake ── */
  @keyframes ls-shake {
    0%,100% { transform: translateX(0); }
    20%,60% { transform: translateX(-5px); }
    40%,80% { transform: translateX(5px); }
  }

  /* ── Outro fade ── */
  @keyframes ls-outro {
    0%   { opacity: 1; transform: scale(1);    filter: blur(0);   }
    100% { opacity: 0; transform: scale(1.04); filter: blur(6px); }
  }

  /* ── Background grid ── */
  .ls-grid-line-h {
    transform-origin: left center;
    animation: ls-line-grow-h 1.8s cubic-bezier(0.16,1,0.3,1) forwards;
  }
  .ls-grid-line-v {
    transform-origin: center top;
    animation: ls-line-grow-v 1.8s cubic-bezier(0.16,1,0.3,1) forwards;
  }

  /* ── Scrollbar ── */
  .ls-root::-webkit-scrollbar { display: none; }
`;

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

/** Ambient grid — static SVG of faint crossing lines */
function GridBackground() {
  const cols = 10, rows = 7;
  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden",
      pointerEvents: "none", zIndex: 0,
    }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={C.green} stopOpacity="0" />
            <stop offset="50%" stopColor={C.green} stopOpacity="0.06" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="vg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.green} stopOpacity="0" />
            <stop offset="50%" stopColor={C.green} stopOpacity="0.05" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: rows }, (_, i) => (
          <line key={`h${i}`}
            x1="0" y1={`${(i + 1) * (100 / (rows + 1))}%`}
            x2="100%" y2={`${(i + 1) * (100 / (rows + 1))}%`}
            stroke="url(#hg)" strokeWidth="1"
            className="ls-grid-line-h"
            style={{ animationDelay: `${i * 0.08}s` }}
          />
        ))}
        {Array.from({ length: cols }, (_, i) => (
          <line key={`v${i}`}
            x1={`${(i + 1) * (100 / (cols + 1))}%`} y1="0"
            x2={`${(i + 1) * (100 / (cols + 1))}%`} y2="100%"
            stroke="url(#vg)" strokeWidth="1"
            className="ls-grid-line-v"
            style={{ animationDelay: `${i * 0.06}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

/** Floating ambient particles */
function Particles() {
  const pts = [
    { top: "18%", left: "12%", size: 3, anim: "ls-drift-1 4.2s ease-in-out infinite", delay: "0s" },
    { top: "72%", left: "8%", size: 2, anim: "ls-drift-2 5.1s ease-in-out infinite", delay: "0.7s" },
    { top: "25%", left: "88%", size: 4, anim: "ls-drift-3 3.8s ease-in-out infinite", delay: "1.2s" },
    { top: "80%", left: "85%", size: 2, anim: "ls-drift-4 6s ease-in-out infinite", delay: "0.3s" },
    { top: "55%", left: "5%", size: 3, anim: "ls-drift-1 4.8s ease-in-out infinite", delay: "2s" },
    { top: "40%", left: "93%", size: 2, anim: "ls-drift-2 5.5s ease-in-out infinite", delay: "1.8s" },
    { top: "10%", left: "55%", size: 2, anim: "ls-drift-3 4s ease-in-out infinite", delay: "0.5s" },
    { top: "90%", left: "45%", size: 3, anim: "ls-drift-4 5.2s ease-in-out infinite", delay: "1.1s" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: "absolute",
          top: p.top, left: p.left,
          width: p.size, height: p.size,
          borderRadius: "50%",
          background: C.green,
          boxShadow: `0 0 ${p.size * 3}px ${C.green}`,
          animation: p.anim,
          animationDelay: p.delay,
        }} />
      ))}
    </div>
  );
}

/** The central ◈ orb with layered rings */
function OrbIcon({ phase }) {
  // phase: "booting" | "connecting" | "ready" | "error"
  const coreColor = phase === "error" ? C.red : C.green;
  const coreGlow = phase === "error" ? "rgba(248,113,113,0.35)" : "rgba(74,222,128,0.3)";

  return (
    <div style={{
      position: "relative", width: 100, height: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0
    }}>

      {/* Outermost ping ring */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        border: `1px solid ${coreColor}`,
        opacity: 0.2,
        animation: phase !== "error" ? "ls-ping-slow 3s ease-out infinite" : "none",
      }} />

      {/* Slow outer ring */}
      <div style={{
        position: "absolute", inset: 8, borderRadius: "50%",
        border: `1px solid ${coreColor}22`,
        animation: phase !== "error" ? "ls-spin-rev 14s linear infinite" : "none",
      }}>
        {/* tick marks on the ring */}
        {[0, 90, 180, 270].map(deg => (
          <div key={deg} style={{
            position: "absolute", top: "50%", left: "50%",
            width: 4, height: 4, marginTop: -2, marginLeft: -2,
            borderRadius: "50%",
            background: coreColor,
            opacity: 0.5,
            transform: `rotate(${deg}deg) translateY(-${42 - 8}px)`,
          }} />
        ))}
      </div>

      {/* Mid ring — spins clockwise */}
      <div style={{
        position: "absolute", inset: 18, borderRadius: "50%",
        border: `1px dashed ${coreColor}30`,
        animation: phase !== "error" ? "ls-spin 8s linear infinite" : "none",
      }} />

      {/* Core glow disk */}
      <div style={{
        position: "absolute", inset: 28, borderRadius: "50%",
        background: `radial-gradient(circle, ${coreColor}18 0%, transparent 70%)`,
        animation: phase !== "error" ? "ls-pulse-glow 2.4s ease-in-out infinite" : "none",
        boxShadow: `0 0 40px ${coreGlow}, 0 0 80px ${coreGlow}40`,
      }} />

      {/* ◈ glyph */}
      <div style={{
        position: "relative", zIndex: 2,
        fontSize: 28, lineHeight: 1,
        color: coreColor,
        textShadow: `0 0 20px ${coreGlow}, 0 0 40px ${coreGlow}`,
        animation: phase === "error"
          ? "ls-shake 0.45s ease"
          : "ls-pulse-glow 2.4s ease-in-out infinite",
        fontFamily: "'DM Serif Display',serif",
      }}>
        {phase === "error" ? "✕" : "◈"}
      </div>
    </div>
  );
}

/** Animated dot-trail loader (3 dots scanning) */
function DotLoader({ color = C.green }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: i === 2 ? 5 : 3,
          height: i === 2 ? 5 : 3,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: `ls-dot-scan 1.4s ease-in-out infinite`,
          animationDelay: `${i * 0.15}s`,
        }} />
      ))}
    </div>
  );
}

/** The thin progress bar at the bottom of the card */
function ProgressBar({ attempts, maxAttempts, error }) {
  const pct = Math.min((attempts / maxAttempts) * 100, 100);
  const color = error ? C.red : C.green;

  return (
    <div style={{
      position: "relative", height: 2,
      background: "rgba(255,255,255,0.04)",
      borderRadius: 2, overflow: "hidden",
    }}>
      {/* Filled portion */}
      <div style={{
        height: "100%",
        width: `${pct}%`,
        borderRadius: 2,
        background: `linear-gradient(90deg, ${C.green}80, ${color})`,
        transition: "width 0.4s ease, background 0.4s ease",
      }} />
      {/* Shimmer on the filled portion */}
      {!error && (
        <div style={{
          position: "absolute", top: 0, left: 0,
          height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.3) 50%,transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "ls-bar-pulse 1.4s ease-in-out infinite",
          borderRadius: 2,
        }} />
      )}
    </div>
  );
}

/** Retry counter dots */
function RetryDots({ attempts, max }) {
  const show = Math.min(attempts, max);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: max }, (_, i) => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: "50%",
          background: i < show ? C.green : "rgba(255,255,255,0.08)",
          boxShadow: i < show ? `0 0 4px ${C.green}` : "none",
          transition: "background 0.3s, box-shadow 0.3s",
          transitionDelay: `${i * 0.04}s`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function LoadingScreen({
  onReady,
  healthUrl = HEALTH_URL,
  retryInterval = RETRY_INTERVAL,
  maxRetries = MAX_RETRIES,
}) {
  const [phase, setPhase] = useState("booting");   // booting | connecting | ready | error
  const [attempts, setAttempts] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgAnim, setMsgAnim] = useState("in");        // in | out
  const [exiting, setExiting] = useState(false);
  const [showRetry, setShowRetry] = useState(false);

  const timerRef = useRef(null);
  const msgTimer = useRef(null);
  const attemptRef = useRef(0);

  // ── Status message rotator ──────────────────────────────────────────────────
  useEffect(() => {
    const rotate = () => {
      setMsgAnim("out");
      msgTimer.current = setTimeout(() => {
        setMsgIdx(i => (i + 1) % STATUS_MSGS.length);
        setMsgAnim("in");
      }, 350);
    };
    const iv = setInterval(rotate, 2800);
    return () => { clearInterval(iv); clearTimeout(msgTimer.current); };
  }, []);

  // ── Health check poll ───────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    attemptRef.current += 1;
    setAttempts(attemptRef.current);

    if (phase !== "connecting") setPhase("connecting");

    try {
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        // ── SUCCESS ──
        setPhase("ready");
        clearInterval(timerRef.current);

        // Short celebration pause, then fade out and call onReady
        setTimeout(() => {
          setExiting(true);
          setTimeout(onReady, 700);
        }, 900);
        return;
      }
    } catch {
      // swallow — network error is expected while backend starts
    }

    // ── Give up ──
    if (attemptRef.current >= maxRetries) {
      clearInterval(timerRef.current);
      setPhase("error");
      setShowRetry(true);
    }
  }, [healthUrl, maxRetries, onReady, phase]);

  // Start polling after a short delay (lets animations render first)
  useEffect(() => {
    const boot = setTimeout(() => {
      poll();
      timerRef.current = setInterval(poll, retryInterval);
    }, 800);
    return () => {
      clearTimeout(boot);
      clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualRetry = () => {
    attemptRef.current = 0;
    setAttempts(0);
    setPhase("connecting");
    setShowRetry(false);
    poll();
    timerRef.current = setInterval(poll, retryInterval);
  };

  // ── Derived display values ──────────────────────────────────────────────────
  const isError = phase === "error";
  const isReady = phase === "ready";
  const dotColor = isError ? C.red : isReady ? C.green : C.green;
  const statusColor = isError ? C.red : isReady ? C.green : C.textMuted;

  const statusText = isError
    ? "Backend unreachable — check that api_server.py is running"
    : isReady
      ? "Connected — launching Stasis…"
      : STATUS_MSGS[msgIdx];

  // How many dots to show max (keep to 12 so row doesn't overflow)
  const dotMax = Math.min(maxRetries, 12);

  return (
    <>
      <style>{CSS}</style>

      {/* ── FULLSCREEN WRAPPER ── */}
      <div className="ls-root" style={{
        position: "fixed", inset: 0,
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
        zIndex: 9999,
        animation: exiting ? "ls-outro 0.7s ease forwards" : "none",
      }}>

        <GridBackground />
        <Particles />

        {/* ── RADIAL GLOW — ambient background bloom ── */}
        <div style={{
          position: "absolute",
          width: 600, height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${isError ? "rgba(248,113,113,0.04)" : "rgba(74,222,128,0.055)"} 0%, transparent 70%)`,
          transform: "translate(-50%,-50%)",
          top: "50%", left: "50%",
          pointerEvents: "none",
          transition: "background 0.6s ease",
          animation: "ls-pulse-glow 4s ease-in-out infinite",
        }} />

        {/* ── MAIN CARD ── */}
        <div style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 400,
          margin: "0 24px",
          background: "rgba(10,13,22,0.85)",
          border: `1px solid ${isError ? "rgba(248,113,113,0.2)" : isReady ? "rgba(74,222,128,0.2)" : C.border}`,
          borderRadius: 28,
          padding: "44px 36px 36px",
          backdropFilter: "blur(24px)",
          boxShadow: `0 48px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)`,
          textAlign: "center",
          animation: "ls-word-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both",
          transition: "border-color 0.5s ease",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}>

          {/* Corner decorations */}
          {[
            { top: 12, left: 12, borderTop: `1px solid ${C.green}30`, borderLeft: `1px solid ${C.green}30` },
            { top: 12, right: 12, borderTop: `1px solid ${C.green}30`, borderRight: `1px solid ${C.green}30` },
            { bottom: 12, left: 12, borderBottom: `1px solid ${C.green}20`, borderLeft: `1px solid ${C.green}20` },
            { bottom: 12, right: 12, borderBottom: `1px solid ${C.green}20`, borderRight: `1px solid ${C.green}20` },
          ].map((s, i) => (
            <div key={i} style={{
              position: "absolute", width: 16, height: 16,
              borderRadius: 3, ...s,
              animation: `ls-fade-in 0.4s ease ${0.6 + i * 0.07}s both`,
            }} />
          ))}

          {/* ── ORB ── */}
          <div style={{
            marginBottom: 28,
            animation: "ls-fade-in 0.5s ease 0.2s both"
          }}>
            <OrbIcon phase={phase} />
          </div>

          {/* ── WORDMARK ── */}
          <div style={{
            animation: "ls-word-in 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.3s both",
            marginBottom: 6,
          }}>
            <div style={{
              fontFamily: "'DM Serif Display',serif",
              fontSize: 42,
              fontWeight: 400,
              color: C.text,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}>
              Sta<em style={{ color: C.green, fontStyle: "italic" }}>sis</em>
            </div>
          </div>

          {/* ── PRIMARY TAGLINE ── */}
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.textDim,
            marginBottom: 6,
            animation: "ls-tag-in 0.5s ease 0.5s both",
          }}>
            Your Focus Core
          </div>

          {/* ── SECONDARY TAGLINE ── */}
          <div style={{
            fontSize: 10,
            color: C.textGhost,
            letterSpacing: "0.05em",
            marginBottom: 36,
            animation: "ls-tag-in 0.5s ease 0.6s both",
          }}>
            Wellbeing &amp; Remote Sync via Telegram
          </div>

          {/* ── DIVIDER ── */}
          <div style={{
            width: "100%",
            height: 1,
            background: `linear-gradient(90deg,transparent,${C.green}25,transparent)`,
            marginBottom: 28,
            animation: "ls-fade-in 0.5s ease 0.7s both",
          }} />

          {/* ── STATUS ROW ── */}
          <div style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 20,
            minHeight: 28,
            animation: "ls-fade-in 0.5s ease 0.75s both",
          }}>
            {/* Status text with swap animation */}
            <div style={{
              flex: 1,
              textAlign: "left",
              fontSize: 12,
              color: statusColor,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 300,
              transition: "color 0.4s ease",
              animation: isReady || isError
                ? "none"
                : msgAnim === "in"
                  ? "ls-msg-in 0.3s ease both"
                  : "ls-msg-out 0.3s ease both",
              lineHeight: 1.4,
            }}>
              {statusText}
            </div>

            {/* Right side: dots while loading, checkmark when ready */}
            <div style={{ flexShrink: 0 }}>
              {isReady ? (
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(74,222,128,0.12)",
                  border: "1px solid rgba(74,222,128,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: C.green,
                  animation: "ls-word-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
                }}>✓</div>
              ) : isError ? (
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: C.red,
                }}>✕</div>
              ) : (
                <DotLoader color={C.green} />
              )}
            </div>
          </div>

          {/* ── PROGRESS BAR ── */}
          <div style={{
            width: "100%", marginBottom: 16,
            animation: "ls-fade-in 0.5s ease 0.8s both",
          }}>
            <ProgressBar
              attempts={attempts}
              maxAttempts={maxRetries}
              error={isError}
            />
          </div>

          {/* ── ATTEMPT DOTS ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            animation: "ls-fade-in 0.5s ease 0.85s both",
          }}>
            <RetryDots attempts={attempts} max={dotMax} />
            <div style={{
              fontSize: 10,
              color: C.textGhost,
              fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 300,
              letterSpacing: "0.04em",
            }}>
              {isError ? "timed out" : isReady ? "connected" : `${attempts}/${maxRetries}`}
            </div>
          </div>

          {/* ── ERROR — manual retry button ── */}
          {showRetry && (
            <button onClick={handleManualRetry}
              style={{
                marginTop: 24, width: "100%",
                padding: "11px",
                borderRadius: 12,
                border: "1px solid rgba(248,113,113,0.3)",
                background: "rgba(248,113,113,0.07)",
                color: C.red,
                fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif",
                cursor: "pointer",
                letterSpacing: "0.03em",
                transition: "all 0.2s ease",
                animation: "ls-fade-in 0.4s ease both",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(248,113,113,0.13)";
                e.currentTarget.style.borderColor = "rgba(248,113,113,0.45)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(248,113,113,0.07)";
                e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)";
              }}>
              ↺ &nbsp;Retry connection
            </button>
          )}
        </div>

        {/* ── BOTTOM HINT ── */}
        <div style={{
          position: "absolute",
          bottom: 28,
          fontSize: 10,
          color: C.textGhost,
          letterSpacing: "0.06em",
          textAlign: "center",
          fontFamily: "'JetBrains Mono',monospace",
          animation: "ls-fade-in 0.5s ease 1.2s both",
        }}>
          {isError
            ? "Run python api_server.py to start the backend"
            : "Waiting for api_server.py on port 7432"}
        </div>
      </div>
    </>
  );
}

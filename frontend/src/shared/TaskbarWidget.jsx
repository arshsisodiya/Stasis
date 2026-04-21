import { useState, useEffect, useRef, useCallback } from "react";
import { fmtTime } from "./utils";
import { getCurrentWindow } from "@tauri-apps/api/window";

const POLL_INTERVAL = 2000;
const MIN_WIDTH = 180;
const MAX_WIDTH = 520;
const COMPACT_BREAKPOINT = 260;

const getAppColor = (name) => {
  if (!name || name === "N/A") return "#475569";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 70%, 58%)`;
};

const getCategoryColor = (cat) => {
  switch (cat) {
    case "productive": return "#4ade80";
    case "distraction": return "#f87171";
    case "neutral": return "#60a5fa";
    default: return "#94a3b8";
  }
};

const getCategoryLabel = (cat) => {
  switch (cat) {
    case "productive": return "Productive";
    case "distraction": return "Distraction";
    case "neutral": return "Neutral";
    default: return "Unknown";
  }
};

// ── Resize handle ──────────────────────────────────────────────────────────
function ResizeHandle({ side, onResize }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = e.currentTarget.closest("[data-widget-root]").offsetWidth;

    const onMove = (me) => {
      if (!dragging.current) return;
      const delta = side === "right"
        ? me.clientX - startX.current
        : startX.current - me.clientX;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta));
      onResize(newW);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        top: 0, bottom: 0,
        [side]: -4,
        width: 8,
        cursor: "ew-resize",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{
        width: 2, height: 16,
        background: "rgba(255,255,255,0.18)",
        borderRadius: 2,
        transition: "background 0.2s",
      }} />
    </div>
  );
}

// ── Hover Detail Card ──────────────────────────────────────────────────────
function DetailCard({ status, segments, todayTime, position }) {
  const top5 = segments.slice(0, 5);

  return (
    <div style={{
      position: "fixed",
      bottom: position.bottom,
      left: position.left,
      width: 280,
      background: "rgba(10, 12, 22, 0.96)",
      backdropFilter: "blur(32px) saturate(180%)",
      WebkitBackdropFilter: "blur(32px) saturate(180%)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      padding: "14px 16px",
      boxShadow: "0 -8px 40px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04)",
      zIndex: 9999,
      fontFamily: "'Geist', 'SF Pro Display', system-ui, sans-serif",
      color: "#f1f5f9",
      animation: "card-appear 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
      pointerEvents: "none",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: getCategoryColor(status.category),
            boxShadow: `0 0 8px ${getCategoryColor(status.category)}`,
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.09em" }}>
            {getCategoryLabel(status.category)}
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
          {fmtTime(todayTime)}
        </span>
      </div>

      {/* Active app */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 9,
        padding: "8px 11px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 9,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: getAppColor(status.active?.app_name || ""),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.7)",
          flexShrink: 0,
        }}>
          {(status.active?.app_name || "?").charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {status.active?.app_name || "No active app"}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>Active now</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#94a3b8", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {fmtTime(status.active?.duration_seconds || 0)}
        </div>
      </div>

      {/* Top apps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {top5.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#cbd5e1", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.name}
            </span>
            <span style={{ fontSize: 11, color: "#475569", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {fmtTime(s.seconds)}
            </span>
            <div style={{ width: 52, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, flexShrink: 0, overflow: "hidden" }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div style={{ display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
        {[
          { label: "Sessions", value: status.sessions_today ?? "—" },
          { label: "Peak hour", value: status.peak_hour ?? "—" },
          { label: "Score", value: status.score != null ? `${status.score}%` : "—" },
        ].map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>{item.value}</div>
            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes card-appear {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────
export default function TaskbarWidget({ BASE }) {
  const [status, setStatus] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const [width, setWidth] = useState(300);
  const rootRef = useRef(null);

  const isCompact = width < COMPACT_BREAKPOINT;

  // Sync width to physical window size and persist
  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      const win = getCurrentWindow();
      // Update window width (keep height fixed at 36 + padding/margins if any, 
      // but the widget design seems to aim for ~44px total height)
      win.setSize(new (window.__TAURI_INTERNALS__.plugins.path.LogicalSize)(width, 44)).catch(console.error);

      // Persist to store (settings.json)
      import("@tauri-apps/plugin-store").then(({ load }) => {
        load("settings.json", { autoSave: true }).then(store => {
          store.set("widget_width", width);
        });
      });
    }
  }, [width]);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${BASE}/api/live-status`)
        .then(r => r.json())
        .then(d => setStatus(d))
        .catch(err => console.error("Widget fetch error:", err));
    };

    // Load initial width from persistence
    if (window.__TAURI_INTERNALS__) {
      import("@tauri-apps/plugin-store").then(({ load }) => {
        load("settings.json", { autoSave: true }).then(store => {
          store.get("widget_width").then(w => {
            if (w) setWidth(w);
          });
        });
      });
    }

    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [BASE]);

  const handlePointerDown = (e) => {
    if (window.__TAURI_INTERNALS__ && e.button === 0) {
      getCurrentWindow().startDragging().catch(err => console.error("Drag start error:", err));
    }
  };

  // Card position: above the widget, aligned to left edge
  const getCardPosition = useCallback(() => {
    if (!rootRef.current) return { bottom: 48, left: 0 };
    const rect = rootRef.current.getBoundingClientRect();
    return {
      bottom: window.innerHeight - rect.top + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
    };
  }, []);

  if (!status) return null;

  const todayTime = status.today_seconds || 1;
  const currentApp = status.active?.app_name || "N/A";
  const categoryColor = getCategoryColor(status.category);

  // Build segments
  const usageArray = Object.entries(status.usage || {}).sort((a, b) => b[1] - a[1]);
  const top7 = usageArray.slice(0, 7);
  const othersSeconds = usageArray.slice(7).reduce((acc, [, v]) => acc + v, 0);

  const segments = top7.map(([app, sec]) => ({
    name: app, seconds: sec,
    pct: (sec / todayTime) * 100,
    color: getAppColor(app),
  }));
  if (othersSeconds > 0) {
    segments.push({ name: "Others", seconds: othersSeconds, pct: (othersSeconds / todayTime) * 100, color: "#334155" });
  }

  const activeLabel = hoveredSegment ? hoveredSegment.name : currentApp;
  const activeTime = hoveredSegment ? hoveredSegment.seconds : (status.active?.duration_seconds || todayTime);

  return (
    <>
      <div
        ref={rootRef}
        data-widget-root
        onPointerDown={handlePointerDown}
        onMouseEnter={() => { setHovered(true); setShowCard(true); }}
        onMouseLeave={() => { setHovered(false); setShowCard(false); setHoveredSegment(null); }}
        style={{
          position: "relative",
          width: width,
          height: 36,
          background: hovered
            ? "rgba(15, 18, 32, 0.92)"
            : "rgba(8, 11, 24, 0.72)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: isCompact ? "0 10px" : "0 14px",
          color: "#f8fafc",
          boxShadow: hovered
            ? "0 4px 24px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.06)"
            : "0 2px 12px rgba(0,0,0,0.4)",
          userSelect: "none",
          cursor: "grab",
          fontFamily: "'Geist', 'SF Pro Display', system-ui, sans-serif",
          transition: "background 0.25s ease, box-shadow 0.25s ease, width 0.1s ease",
          overflow: "visible",
        }}
      >
        {/* Left resize handle */}
        <ResizeHandle side="left" onResize={setWidth} />

        {/* Content row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>

          {/* Status dot */}
          <div style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: hoveredSegment ? hoveredSegment.color : categoryColor,
            boxShadow: `0 0 8px ${hoveredSegment ? hoveredSegment.color : categoryColor}cc`,
            animation: hoveredSegment ? "none" : "wpulse 2s ease-in-out infinite",
            transition: "background 0.2s ease, box-shadow 0.2s ease",
          }} />

          {/* App name */}
          {!isCompact && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: hoveredSegment ? hoveredSegment.color : "#94a3b8",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 110, transition: "color 0.2s ease",
            }}>
              {activeLabel}
            </span>
          )}

          {/* Time */}
          <span style={{
            fontSize: 13, fontWeight: 800, color: "#fff",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
            marginLeft: isCompact ? 2 : 0,
          }}>
            {fmtTime(activeTime)}
          </span>

          {/* Stacked bar — fills remaining space */}
          <div style={{
            flex: 1,
            height: hovered ? 6 : 3,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 3,
            display: "flex",
            overflow: "hidden",
            transition: "height 0.2s ease",
            cursor: "default",
            minWidth: 0,
          }}>
            {segments.map((s, i) => (
              <div
                key={i}
                onMouseEnter={(e) => { e.stopPropagation(); setHoveredSegment(s); setShowCard(false); }}
                onMouseLeave={() => { setHoveredSegment(null); setShowCard(true); }}
                title={`${s.name} — ${fmtTime(s.seconds)} (${s.pct.toFixed(1)}%)`}
                style={{
                  width: `${s.pct}%`,
                  height: "100%",
                  background: s.color,
                  transition: "opacity 0.2s ease, transform 0.2s ease",
                  opacity: hoveredSegment && hoveredSegment.name !== s.name ? 0.3 : 1,
                  transform: hoveredSegment?.name === s.name
                    ? "scaleY(1.6)"
                    : "scaleY(1)",
                  transformOrigin: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Right resize handle */}
        <ResizeHandle side="right" onResize={setWidth} />

        <style>{`
          @keyframes wpulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.6; transform: scale(0.8); }
          }
          [data-widget-root]:active { cursor: grabbing; }
        `}</style>
      </div>

      {/* Hover detail card — shown when hovering widget body (not bar segments) */}
      {showCard && hovered && !hoveredSegment && (
        <DetailCard
          status={status}
          segments={segments}
          todayTime={todayTime}
          position={getCardPosition()}
        />
      )}
    </>
  );
}
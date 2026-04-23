import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { fmtTime, fmtAppName } from "./utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const POLL_INTERVAL = 2000;

const getAppColor = (name) => {
  if (!name || name === "N/A") return "#94a3b8";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 75%, 60%)`;
};

const getCategoryColor = (cat) => {
  switch (cat) {
    case "productive": return "#4ade80";
    case "distraction":
    case "unproductive": return "#f87171";
    case "neutral": return "#60a5fa";
    case "entertainment": return "#a855f7";
    case "communication": return "#22d3ee";
    case "system": return "#94a3b8";
    case "development": return "#fbbf24";
    default: return "#64748b";
  }
};

const getCategoryLabel = (cat) => {
  switch (cat) {
    case "productive": return "Productive";
    case "distraction":
    case "unproductive": return "Distraction";
    case "neutral": return "Neutral";
    case "entertainment": return "Entertainment";
    case "communication": return "Communication";
    case "system": return "System";
    case "development": return "Development";
    case "other": return "Other";
    default: return "Activity";
  }
};

// ── Hover Detail Card ──────────────────────────────────────────────────────
const DetailCard = memo(({ status, segments, todayTime, visible }) => {
  const top5 = segments.slice(0, 5);
  const catColor = getCategoryColor(status.category);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        right: 0,
        width: 320,
        background: "rgba(13, 17, 28, 0.98)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "20px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
        color: "#f1f5f9",
        pointerEvents: visible ? "auto" : "none",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.98)",
        transformOrigin: "bottom right",
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: catColor,
            boxShadow: `0 0 10px ${catColor}`,
          }} />
          <span style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {getCategoryLabel(status.category)}
          </span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
          {fmtTime(todayTime)}
        </span>
      </div>

      {/* Active app - Highlighted Row */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: getAppColor(status.active?.app_name || ""),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, color: "rgba(0,0,0,0.6)",
          flexShrink: 0,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
        }}>
          {(status.active?.app_name || "?").charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 750, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
            {status.active?.app_name ? fmtAppName(status.active.app_name) : "No active app"}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, fontWeight: 600, opacity: 0.8 }}>Current Session</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: catColor, fontVariantNumeric: "tabular-nums", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 6 }}>
          {status.active?.duration_seconds < 60 
            ? `${status.active.duration_seconds}s` 
            : fmtTime(status.active?.duration_seconds || 0)}
        </div>
      </div>

      {/* Top apps list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {top5.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(s.seconds)}
            </span>
            <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginLeft: 8 }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom info columns */}
      <div style={{ display: "flex", gap: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
        {[
          { label: "Sessions", value: status.sessions_today ?? "—" },
          { label: "Peak hour", value: status.peak_hour ?? "—" },
          { label: "Focus Score", value: status.score != null ? `${status.score}%` : "—" },
        ].map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>{item.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function TaskbarWidget({ BASE }) {
  const [status, setStatus] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [hoverEnabled, setHoverEnabled] = useState(true);
  const hideTimeout = useRef(null);

  // Override global overflow:hidden from index.css — the widget needs visible overflow
  // so the detail card (positioned above the bar) isn't clipped when window is expanded
  useEffect(() => {
    document.documentElement.style.overflow = "visible";
    document.body.style.overflow = "visible";
    const root = document.getElementById("root");
    if (root) root.style.overflow = "visible";
  }, []);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${BASE}/api/live-status`)
        .then(r => r.json())
        .then(d => {
          console.log("[Widget] data received:", JSON.stringify(d).slice(0, 200));
          setStatus(d);
          
          // Also fetch hover setting occasionally (or every poll)
          fetch(`${BASE}/api/settings`)
            .then(res => res.json())
            .then(s => setHoverEnabled(s.widget_details_hover_enabled !== false))
            .catch(() => {});
        })
        .catch(err => console.error("Widget fetch error:", err));
    };

    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [BASE]);

  const handlePointerDown = useCallback((e) => {
    if (window.__TAURI_INTERNALS__ && e.button === 0) {
      getCurrentWindow().startDragging().catch(err => console.error("Drag start error:", err));
    }
  }, []);

  // Show card: mount it, then trigger entry transition
  const requestShow = useCallback(() => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
    
    // Expand the physical window to fit the detail card
    if (window.__TAURI_INTERNALS__) {
      invoke("expand_widget").catch(e => console.error("Expand error:", e));
    }

    setIsMounted(true);
    // Small delay to ensure React has mounted the component before we trigger the opacity transition
    setTimeout(() => setIsVisible(true), 20);
  }, []);

  // Hide card: trigger fade out, then unmount after transition completes
  const requestHide = useCallback(() => {
    setIsVisible(false);
    hideTimeout.current = setTimeout(() => {
      setIsMounted(false);
      setHoveredSegment(null);
      
      // Shrink the physical window back to bar size
      if (window.__TAURI_INTERNALS__) {
        invoke("shrink_widget").catch(e => console.error("Shrink error:", e));
      }
    }, 400); // Match the 0.4s transition duration in DetailCard
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  // Compute Top 7 Apps + Other with extreme defensive checks
  const segments = useMemo(() => {
    if (!status) return [];
    try {
      const usage = status?.usage || {};
      const usageArray = Object.entries(usage).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
      const top7 = usageArray.slice(0, 7);
      const othersSeconds = usageArray.slice(7).reduce((acc, curr) => acc + (Number(curr[1]) || 0), 0);

      const s = top7.map(([app, sec]) => ({
        name: app || "Unknown",
        seconds: Number(sec) || 0,
        pct: ( (Number(sec) || 0) / (status.today_seconds || 1)) * 100,
        color: getAppColor(app)
      }));

      if (othersSeconds > 0) {
        s.push({
          name: "Others",
          seconds: othersSeconds,
          pct: (othersSeconds / (status.today_seconds || 1)) * 100,
          color: "#475569"
        });
      }
      return s;
    } catch (e) {
      console.error("Segments calculation error:", e);
      return [];
    }
  }, [status?.usage, status?.today_seconds]);

  if (!status) {
    return (
      <div style={{
        height: "100%", width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 200, height: 44,
          background: "rgba(13, 17, 28, 0.95)",
          backdropFilter: "blur(40px) saturate(200%)",
          borderRadius: 14,
          display: "flex", alignItems: "center", padding: "0 14px", gap: 10,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", opacity: 0.3, animation: "pulse 2s infinite" }} />
          <div style={{ width: 60, height: 12, background: "rgba(255,255,255,0.1)", borderRadius: 6 }} />
        </div>
        <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.2); opacity: 0.6; } }`}</style>
      </div>
    );
  }

  const todayTime = Number(status?.today_seconds) || 1;
  const categoryColor = getCategoryColor(status?.category);
  const activeTime = hoveredSegment ? hoveredSegment.seconds : todayTime;

  return (
    <div
      style={{
        height: "100%", width: "100%",
        display: "flex", flexDirection: "column",
        justifyContent: "flex-end", alignItems: "flex-end",
        pointerEvents: "none", // Ignore transparent areas
      }}
    >
      {/* Inner container — only this part and its children catch mouse events */}
      <div 
        style={{ 
          position: "relative",
          pointerEvents: "auto", // Re-enable for the UI
        }}
        onMouseEnter={requestShow}
        onMouseLeave={requestHide}
      >
        {/* Detail Card — conditionally mounted for layout performance */}
        {isMounted && hoverEnabled && (
          <DetailCard
            status={status}
            segments={segments}
            todayTime={todayTime}
            visible={isVisible && !hoveredSegment}
          />
        )}

        {/* Custom Tooltip — conditionally mounted */}
        {isMounted && (
          <div
            style={{
              position: "absolute",
              bottom: 56,
              right: 0,
              background: "rgba(13, 17, 28, 0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "8px 12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
              color: "#f1f5f9",
              display: "flex",
              alignItems: "center",
              gap: 8,
              pointerEvents: "none",
              opacity: isVisible && hoveredSegment ? 1 : 0,
              transform: isVisible && hoveredSegment ? "translateY(0) scale(1)" : "translateY(4px) scale(0.97)",
              transformOrigin: "bottom right",
              transition: "opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
              zIndex: 10,
            }}
          >
            {hoveredSegment && (
              <>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: hoveredSegment.color, boxShadow: `0 0 8px ${hoveredSegment.color}` }} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>{hoveredSegment.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{fmtTime(hoveredSegment.seconds)}</span>
              </>
            )}
          </div>
        )}

        {/* The fixed-size widget bar */}
        <div
          onPointerDown={handlePointerDown}
          style={{
            width: 200,
            height: 44,
            background: "rgba(13, 17, 28, 0.95)",
            backdropFilter: "blur(40px) saturate(200%)",
            WebkitBackdropFilter: "blur(40px) saturate(200%)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 10,
            color: "#fff",
            overflow: "hidden",
            userSelect: "none",
            cursor: "grab",
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            position: "relative",
          }}
        >
          {/* Productivity Dot + Time */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: hoveredSegment ? hoveredSegment.color : categoryColor,
              boxShadow: `0 0 14px ${hoveredSegment ? hoveredSegment.color : categoryColor}`,
              animation: "widget-pulse 2.5s ease-in-out infinite",
              transition: "all 0.3s ease",
              flexShrink: 0
            }} />

            <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
              <span style={{
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                background: "linear-gradient(180deg, #fff 0%, #cbd5e1 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                {fmtTime(activeTime)}
              </span>
            </div>
          </div>

          {/* Usage Bar */}
          <div style={{
            flex: 1,
            height: 8,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 4,
            display: "flex",
            overflow: "hidden",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
          }}>
            {segments.map((s, i) => (
              <div
                key={i}
                onMouseEnter={(e) => { e.stopPropagation(); setHoveredSegment(s); }}
                onMouseLeave={() => { setHoveredSegment(null); }}
                style={{
                  width: `${Math.max(0, Math.min(100, isFinite(s.pct) ? s.pct : 0))}%`,
                  height: "100%",
                  background: s.color,
                  transition: "opacity 0.3s ease, transform 0.3s ease",
                  opacity: hoveredSegment && hoveredSegment.name !== s.name ? 0.3 : 1,
                  transform: hoveredSegment && hoveredSegment.name === s.name ? "scaleY(1.3)" : "scaleY(1)",
                  cursor: "pointer"
                }}
              />
            ))}
          </div>

          <style>{`
            @keyframes widget-pulse {
              0%, 100% { opacity: 1; transform: scale(1); filter: brightness(1); }
              50% { opacity: 0.8; transform: scale(0.9); filter: brightness(1.2); }
            }
            div:active { cursor: grabbing; }
          `}</style>
        </div>
      </div>
    </div>
  );
}
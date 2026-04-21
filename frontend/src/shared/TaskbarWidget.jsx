import { useState, useEffect } from "react";
import { fmtTime } from "./utils";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
    case "distraction": return "#f87171";
    case "neutral": return "#60a5fa";
    default: return "#94a3b8";
  }
};

export default function TaskbarWidget({ BASE }) {
  const [status, setStatus] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState(null);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${BASE}/api/live-status`)
        .then(r => r.json())
        .then(d => setStatus(d))
        .catch(err => console.error("Widget fetch error:", err));
    };

    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [BASE]);

  const handlePointerDown = (e) => {
    if (window.__TAURI_INTERNALS__ && e.button === 0) {
      getCurrentWindow().startDragging().catch(err => console.error("Drag start error:", err));
    }
  };

  if (!status) return null;

  const todayTime = status.today_seconds || 1; 
  const currentApp = status.active?.app_name || "N/A";
  const categoryColor = getCategoryColor(status.category);

  // Compute Top 7 Apps + Other
  const usageArray = Object.entries(status.usage || {})
    .sort((a, b) => b[1] - a[1]);
  
  const top7 = usageArray.slice(0, 7);
  const othersSeconds = usageArray.slice(7).reduce((acc, curr) => acc + curr[1], 0);

  const segments = top7.map(([app, sec]) => ({
    name: app,
    seconds: sec,
    pct: (sec / todayTime) * 100,
    color: getAppColor(app)
  }));

  if (othersSeconds > 0) {
    segments.push({
      name: "Others",
      seconds: othersSeconds,
      pct: (othersSeconds / todayTime) * 100,
      color: "#475569"
    });
  }

  const activeLabel = hoveredSegment ? hoveredSegment.name : (hovered ? "Active" : "Today");
  const activeTime = hoveredSegment ? hoveredSegment.seconds : todayTime;
  const activeDetail = hoveredSegment ? "" : (hovered ? ` • ${currentApp}` : "");

  return (
    <div 
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoveredSegment(null); }}
      style={{
        width: "100%", height: "100%", 
        background: hovered ? "rgba(15, 20, 35, 0.85)" : "rgba(10, 15, 30, 0.65)",
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 16,
        display: "flex", flexDirection: "column",
        padding: "8px 14px",
        color: "#f8fafc", overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)",
        userSelect: "none", 
        cursor: "grab",
        fontFamily: "Inter, system-ui, sans-serif",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <div style={{ 
          width: 8, height: 8, borderRadius: "50%", 
          background: hoveredSegment ? hoveredSegment.color : categoryColor, 
          boxShadow: `0 0 12px ${hoveredSegment ? hoveredSegment.color : categoryColor}99`,
          animation: hoveredSegment ? "none" : "widget-pulse 2s ease-in-out infinite",
          transition: "all 0.3s ease",
          flexShrink: 0
        }} />

        <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span style={{ 
              fontSize: 9, fontWeight: 800, color: hoveredSegment ? hoveredSegment.color : "#64748b", 
              textTransform: "uppercase", letterSpacing: "0.1em",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: hoveredSegment ? "70%" : "auto"
          }}>
            {activeLabel}
          </span>
          <span style={{ 
              fontSize: 13, fontWeight: 800, color: "#fff", tabularNums: true,
              transition: "all 0.2s ease"
          }}>
            {fmtTime(activeTime)}
          </span>
          {activeDetail && (
            <span style={{ 
              fontSize: 10, color: "#94a3b8", fontWeight: 500, 
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 100, animation: "fade-in 0.3s ease"
            }}>
               {activeDetail}
            </span>
          )}
        </div>
      </div>

      {/* Stacked Usage Bar */}
      <div style={{ 
        width: "100%", height: 4, background: "rgba(255,255,255,0.05)", 
        borderRadius: 2, marginTop: 6, display: "flex", overflow: "hidden",
        transition: "height 0.2s ease"
      }}>
        {segments.map((s, i) => (
          <div 
            key={i} 
            onMouseEnter={() => setHoveredSegment(s)}
            onMouseLeave={() => setHoveredSegment(null)}
            style={{
              width: `${s.pct}%`, height: "100%", 
              background: s.color, 
              transition: "all 0.3s ease",
              opacity: hoveredSegment && hoveredSegment.name !== s.name ? 0.4 : 1,
              transform: hoveredSegment && hoveredSegment.name === s.name ? "scaleY(1.5)" : "scaleY(1)",
              cursor: "pointer"
            }} 
          />
        ))}
      </div>

      <style>{`
        @keyframes widget-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.85); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: translateX(0); }
        }
        div:active {
          cursor: grabbing;
        }
      `}</style>
    </div>
  );
}

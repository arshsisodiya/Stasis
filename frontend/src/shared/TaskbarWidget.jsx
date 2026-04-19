import { useState, useEffect } from "react";
import { AppIcon } from "./components";
import { fmtTime, fmtAppName } from "./utils";

const POLL_INTERVAL = 2000;

export default function TaskbarWidget({ BASE }) {
  const [status, setStatus] = useState(null);

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

  if (!status) return null;

  const currentApp = status.active?.app_name || "Idle";
  const sessionTime = status.session_seconds || 0;
  const todayTime = status.today_seconds || 0;

  return (
    <div style={{
      width: "100%", height: "100%", 
      background: "rgba(10, 15, 30, 0.7)",
      backdropFilter: "blur(20px) saturate(160%)",
      WebkitBackdropFilter: "blur(20px) saturate(160%)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      borderRadius: 24,
      display: "flex", alignItems: "center",
      padding: "0 16px", gap: 12,
      color: "#f8fafc", overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)",
      userSelect: "none", cursor: "default",
      fontFamily: "Inter, system-ui, sans-serif"
    }} data-tauri-drag-region>
      <AppIcon appName={currentApp} size={28} />
      
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ 
          fontSize: 13, fontWeight: 700, 
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          letterSpacing: "-0.01em", marginBottom: -1
        }}>
          {fmtAppName(currentApp)}
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, display: "flex", gap: 6, letterSpacing: "0.015em" }}>
          <span>{fmtTime(sessionTime)} active</span>
          <span style={{ opacity: 0.3 }}>•</span>
          <span style={{ color: "#4ade80cc" }}>{fmtTime(todayTime)} today</span>
        </div>
      </div>

      <div style={{ 
        width: 8, height: 8, borderRadius: "50%", 
        background: "#4ade80", 
        boxShadow: "0 0 10px #4ade80",
        animation: "widget-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      }} />

      <style>{`
        @keyframes widget-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

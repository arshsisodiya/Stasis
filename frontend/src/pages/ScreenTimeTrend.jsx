import { useState, useEffect } from "react";
import { SectionCard } from "../shared/components";
// Reuse the shared hourly chart – no new chart created for drill-down
import HourlyActivityPattern from "./HourlyActivityPattern";

// ─── WEEKLY TREND GRAPH ───────────────────────────────────────────────────────
function WeeklyTrendGraph({ BASE, onDayClick, activeDrillDate }) {
  const [trend, setTrend] = useState([]);
  const [hovIdx, setHovIdx] = useState(null);

  useEffect(() => {
    fetch(`${BASE}/api/weekly-trend`).then(r => r.json()).then(setTrend).catch(() => {});
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
    ...d,
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
            <stop offset="0%"   stopColor="#34d399" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>

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

        <path d={area} fill="url(#trendGrad)" />
        <path d={line} fill="none" stroke="url(#trendLine)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {pts.map((p, i) => {
          const barH = (trend[i].productivityPct / 100) * iH;
          return (
            <rect key={i} x={p.x - 3} y={PAD.t + iH - barH}
              width={6} height={barH > 0 ? barH : 0} rx={2}
              fill={`rgba(52,211,153,${hovIdx === i ? 0.4 : 0.15})`}
              style={{ transition: "fill 0.2s" }} />
          );
        })}

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

        {pts.map((p, i) => i % 2 === 0 && (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle"
            style={{
              fontSize: 9,
              fill: activeDrillDate === p.date ? "#34d399" : "#e2e8f0",
              fontFamily: "'DM Sans',sans-serif",
              transition: "fill 0.2s",
            }}>
            {fmtDate(p.date)}
          </text>
        ))}
      </svg>

      {hovIdx !== null && (() => {
        const d = trend[hovIdx];
        const p = pts[hovIdx];
        return (
          <div style={{
            position: "absolute",
            left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`,
            transform: "translate(-50%,-130%)", pointerEvents: "none",
            background: "rgba(8, 11, 20, 0.97)", border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 10, padding: "8px 12px", minWidth: 130,
            boxShadow: "0 6px 28px rgba(0, 0, 0, 0.55)",
            animation: "center-fade-in 0.15s ease both", zIndex: 10,
          }}>
            <div style={{ fontSize: 10, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>{fmtDate(d.date)}</div>
            <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600 }}>{fmtHr(d.screenTime)} tracked</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{d.productivityPct}% productive</div>
            <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 4 }}>Click to drill in →</div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── SCREEN TIME TREND ────────────────────────────────────────────────────────
// 14-Day trend line with click-to-drill-down into a day's hourly breakdown.
// The hourly breakdown reuses <HourlyActivityPattern> from the Overview page –
// no duplicate chart code.
//
// Props:
//   BASE – API base URL string
export default function ScreenTimeTrend({ BASE }) {
  const [drillDate, setDrillDate]     = useState(null);
  const [drillHourly, setDrillHourly] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const drillPeak = drillHourly
    ? drillHourly.reduce((pi, v, i) => (v > drillHourly[pi] ? i : pi), 0)
    : 0;

  const handleDayClick = (date) => {
    if (drillDate === date) { setDrillDate(null); setDrillHourly(null); return; }
    setDrillDate(date);
    setDrillLoading(true);
    fetch(`${BASE}/api/hourly?date=${date}`)
      .then(r => r.json())
      .then(h => { setDrillHourly(h); setDrillLoading(false); })
      .catch(() => setDrillLoading(false));
  };

  return (
    <SectionCard title="14-Day Screen Time Trend">
      <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 12 }}>
        Click any point to see that day's hourly breakdown ↓
      </div>

      <WeeklyTrendGraph BASE={BASE} onDayClick={handleDayClick} activeDrillDate={drillDate} />

      {drillDate && (
        <div style={{
          marginTop: 16, paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          animation: "legend-slide-in 0.25s ease both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
            <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>
              {new Date(drillDate + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              })}
            </span>
            <button
              onClick={() => { setDrillDate(null); setDrillHourly(null); }}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13 }}
            >✕</button>
          </div>

          {drillLoading ? (
            <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontSize: 13 }}>
              Loading…
            </div>
          ) : drillHourly ? (
            // ✅ Reuses HourlyActivityPattern from OverviewPage – no new chart
            <HourlyActivityPattern
              hourly={drillHourly}
              peakHour={drillPeak}
              BASE={BASE}
              selectedDate={drillDate}
            />
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

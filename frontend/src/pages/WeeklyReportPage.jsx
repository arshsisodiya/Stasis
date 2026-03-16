import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SectionCard, AppIcon } from "../shared/components";
import { fmtTime, localYMD } from "../shared/utils";

const BASE = "http://127.0.0.1:7432";
const EARLIEST_WEEK = "2024-01-01";

function weekBounds(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(), diff = day === 0 ? 6 : day - 1;
  const mon = new Date(d); mon.setDate(d.getDate() - diff);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: localYMD(mon), end: localYMD(sun) };
}

function fmtDateShort(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtWeekRange(start, end) {
  const s = new Date(start + "T12:00:00"), e = new Date(end + "T12:00:00");
  const opts = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}, ${e.getFullYear()}`;
}

function WeekOptionMenu({ options, selected, disabledValue, onSelect }) {
  return (
    <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(10,14,26,0.98)" }}>
      {options.map((opt) => {
        const disabled = opt.value === disabledValue;
        const active = opt.value === selected;
        return (
          <button key={opt.value} onClick={() => !disabled && onSelect(opt.value)} disabled={disabled} style={{
            width: "100%", textAlign: "left", padding: "9px 12px", border: "none",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            background: active ? "rgba(34,211,238,0.1)" : "transparent",
            color: disabled ? "#334155" : active ? "#22d3ee" : "#94a3b8",
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 12, fontFamily: "'DM Sans',sans-serif", opacity: disabled ? 0.4 : 1,
          }}>{opt.label}</button>
        );
      })}
    </div>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CATEGORY_COLORS = {
  productive: "#4ade80",
  communication: "#60a5fa",
  entertainment: "#f87171",
  browser: "#a78bfa",
  neutral: "#fbbf24",
  unproductive: "#fb7185",
  other: "#64748b",
  system: "#22d3ee",
};

function reportToCsv(report) {
  if (!report) return "";
  const rows = [["date", "total_seconds", "productive_pct"]];
  (report.daily_breakdown || []).forEach((d) => rows.push([d.date, d.total_seconds || 0, d.productive_pct || 0]));
  return rows.map((r) => r.join(",")).join("\n");
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Tiny sparkline ──
function TinySparkline({ values = [], color = "#4ade80", width = 56, height = 20 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.2" fill={color} />
    </svg>
  );
}

// ── Category breakdown: donut left + legend rows right ──
function CategoryDonut({ categories = [] }) {
  const [hovered, setHovered] = useState(null);
  const total = categories.reduce((sum, c) => sum + (c.total_seconds || 0), 0);
  // Fixed viewBox — never distorts regardless of container size
  const CX = 70, CY = 70, R = 52, SW = 13;
  const circ = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", width: "100%" }}>

      {/* Donut — fixed 140×140 */}
      <div style={{ flexShrink: 0, width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          {/* Track ring */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={SW} />

          {/* Segments */}
          {categories.map((cat) => {
            const secs = cat.total_seconds || 0;
            const frac = total > 0 ? secs / total : 0;
            const seg = frac * circ;
            const offset = circ - acc;
            acc += seg;
            const key = (cat.category || "other").toLowerCase();
            const color = CATEGORY_COLORS[key] || "#64748b";
            const isHov = hovered === key;
            const dimmed = hovered !== null && !isHov;
            return (
              <circle key={cat.category}
                cx={CX} cy={CY} r={R} fill="none"
                stroke={color}
                strokeWidth={isHov ? SW + 4 : SW}
                strokeDasharray={`${seg} ${circ - seg}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${CX} ${CY})`}
                style={{ opacity: dimmed ? 0.15 : 1, transition: "opacity 0.15s, stroke-width 0.15s", cursor: "pointer" }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* Centre labels — idle: TOTAL + time, hover: category name + time + % */}
          {!hovered ? (
            <>
              <text x={CX} y={CY - 8} textAnchor="middle" fill="#475569"
                fontSize="8" fontWeight="700" letterSpacing="1" style={{ fontFamily: "sans-serif" }}>
                TOTAL
              </text>
              <text x={CX} y={CY + 9} textAnchor="middle" fill="#f1f5f9"
                fontSize="14" fontWeight="800" style={{ fontFamily: "monospace" }}>
                {fmtTime(total)}
              </text>
            </>
          ) : (() => {
            const cat = categories.find(c => (c.category || "other").toLowerCase() === hovered);
            if (!cat) return null;
            const pct = total > 0 ? Math.round((cat.total_seconds / total) * 100) : 0;
            const color = CATEGORY_COLORS[hovered] || "#64748b";
            const label = (cat.category || "other");
            // Capitalise first letter
            const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
            return (
              <>
                {/* Category name */}
                <text x={CX} y={CY - 14} textAnchor="middle" fill={color}
                  fontSize="8" fontWeight="700" letterSpacing="0.5"
                  style={{ fontFamily: "sans-serif", textTransform: "uppercase" }}>
                  {displayLabel}
                </text>
                {/* Time */}
                <text x={CX} y={CY + 3} textAnchor="middle" fill="#f1f5f9"
                  fontSize="14" fontWeight="800" style={{ fontFamily: "monospace" }}>
                  {fmtTime(cat.total_seconds)}
                </text>
                {/* Percentage */}
                <text x={CX} y={CY + 20} textAnchor="middle" fill={color}
                  fontSize="11" fontWeight="700" style={{ fontFamily: "monospace" }}>
                  {pct}%
                </text>
              </>
            );
          })()}
        </svg>
      </div>

      {/* Legend — full remaining width, one row per category with mini bar */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        {categories.map((cat) => {
          const secs = cat.total_seconds || 0;
          const pct = total > 0 ? (secs / total) * 100 : 0;
          const key = (cat.category || "other").toLowerCase();
          const color = CATEGORY_COLORS[key] || "#64748b";
          const isHov = hovered === key;
          const dimmed = hovered !== null && !isHov;
          return (
            <div key={cat.category}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{ opacity: dimmed ? 0.28 : 1, transition: "opacity 0.15s", cursor: "default" }}>
              {/* Label row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: isHov ? "#e2e8f0" : "#94a3b8", textTransform: "capitalize", transition: "color 0.15s" }}>
                    {cat.category || "other"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{Math.round(pct)}%</span>
                  <span style={{ fontSize: 10, color: "#334155", fontFamily: "'DM Mono',monospace" }}>{fmtTime(secs)}</span>
                </div>
              </div>
              {/* Mini progress bar */}
              <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.05)" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${pct}%`,
                  background: color, opacity: 0.65,
                  transition: "width 0.55s cubic-bezier(0.34,1.56,0.64,1)",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Hourly Activity Heatmap ──
// Expects data: { grid: [{date, hour, total_seconds, productive_pct, dominant_category}] }
// dailyBreakdown: [{date, total_seconds, productive_pct}] from report.daily_breakdown

const HOUR_LABELS_FULL = Array.from({ length: 24 }, (_, h) => {
  if (h === 0)  return "12 AM";
  if (h === 6)  return "6 AM";
  if (h === 12) return "12 PM";
  if (h === 18) return "6 PM";
  return "";
});

function fmtHour(h) {
  if (h === 0)  return "12 AM";
  if (h < 12)   return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

// Derive text insights entirely from the grid data — no extra API call
function deriveHourlyInsights(grid, dates) {
  if (!grid || grid.length === 0) return [];
  const insights = [];

  // Build hourly totals across the whole week (h → {secs, prodSecs, count})
  const hourTotals = Array.from({ length: 24 }, () => ({ secs: 0, prodSecs: 0, count: 0 }));
  // Per-day peak
  const dayPeaks = {};
  // Weekday vs weekend splits
  let wdSecs = 0, weSecs = 0;

  for (const row of grid) {
    const h = row.hour;
    const s = row.total_seconds || 0;
    const ps = s * ((row.productive_pct || 0) / 100);
    hourTotals[h].secs  += s;
    hourTotals[h].prodSecs += ps;
    hourTotals[h].count += 1;
    if (!dayPeaks[row.date] || s > dayPeaks[row.date].secs) {
      dayPeaks[row.date] = { hour: h, secs: s, cat: row.dominant_category || "" };
    }
    // date is YYYY-MM-DD — day-of-week from dates array
    const dateIdx = dates.indexOf(row.date);
    const isWeekend = dateIdx >= 5;
    if (isWeekend) { weSecs += s; }
    else           { wdSecs += s; }
  }

  // 1. Peak week-hour (most total screen time)
  const peakH = hourTotals.reduce((best, cur, i) => cur.secs > hourTotals[best].secs ? i : best, 0);
  if (hourTotals[peakH].secs > 0) {
    insights.push({
      icon: "⏰",
      label: "Busiest Hour",
      value: fmtHour(peakH),
      detail: `avg ${fmtTime(Math.round(hourTotals[peakH].secs / Math.max(hourTotals[peakH].count, 1)))} across active days`,
      color: "#60a5fa",
    });
  }

  // 2. Best productive window — 3-hour block with highest productive seconds
  let bestWindowStart = -1, bestWindowProd = 0;
  for (let h = 0; h <= 21; h++) {
    const prod = hourTotals[h].prodSecs + hourTotals[h+1].prodSecs + hourTotals[h+2].prodSecs;
    if (prod > bestWindowProd) { bestWindowProd = prod; bestWindowStart = h; }
  }
  if (bestWindowStart >= 0 && bestWindowProd > 60) {
    insights.push({
      icon: "🎯",
      label: "Focus Window",
      value: `${fmtHour(bestWindowStart)} – ${fmtHour(bestWindowStart + 3)}`,
      detail: `peak 3-hr productive block`,
      color: "#4ade80",
    });
  }

  // 3. Earliest active hour (first hour with data on any day)
  const earliest = hourTotals.findIndex(h => h.secs > 0);
  if (earliest >= 0 && earliest < 8) {
    insights.push({
      icon: "🌅",
      label: "Early Start",
      value: fmtHour(earliest),
      detail: "earliest screen activity",
      color: "#fbbf24",
    });
  }

  // 4. Latest active hour
  let latest = -1;
  for (let h = 23; h >= 0; h--) { if (hourTotals[h].secs > 0) { latest = h; break; } }
  if (latest >= 22) {
    insights.push({
      icon: "🌙",
      label: "Late Night",
      value: fmtHour(latest),
      detail: "latest screen activity this week",
      color: "#a78bfa",
    });
  }

  // 5. Morning vs afternoon vs evening breakdown
  const morning   = hourTotals.slice(6, 12).reduce((s, h) => s + h.secs, 0);
  const afternoon = hourTotals.slice(12, 18).reduce((s, h) => s + h.secs, 0);
  const evening   = hourTotals.slice(18, 24).reduce((s, h) => s + h.secs, 0);
  const total = morning + afternoon + evening;
  if (total > 0) {
    const dominant = morning >= afternoon && morning >= evening ? "Morning"
      : afternoon >= evening ? "Afternoon" : "Evening";
    const domSecs = dominant === "Morning" ? morning : dominant === "Afternoon" ? afternoon : evening;
    const domPct = Math.round((domSecs / total) * 100);
    insights.push({
      icon: dominant === "Morning" ? "☀️" : dominant === "Afternoon" ? "🌤️" : "🌆",
      label: "Peak Period",
      value: dominant,
      detail: `${domPct}% of daily screen time`,
      color: dominant === "Morning" ? "#fbbf24" : dominant === "Afternoon" ? "#60a5fa" : "#a78bfa",
    });
  }

  // 6. Weekend vs weekday
  if (weSecs > 0 && wdSecs > 0) {
    const wdAvg = wdSecs / 5;
    const weAvg = weSecs / 2;
    const diff = Math.abs(wdAvg - weAvg);
    if (diff > 900) { // >15 min difference — worth mentioning
      const heavier = wdAvg > weAvg ? "Weekdays" : "Weekends";
      const lighter = wdAvg > weAvg ? "weekends" : "weekdays";
      insights.push({
        icon: "📅",
        label: "Work/Rest",
        value: `${heavier} heavier`,
        detail: `${fmtTime(Math.round(diff))} more/day vs ${lighter}`,
        color: "#22d3ee",
      });
    }
  }

  return insights;
}

function HourlyHeatmap({ data, weekStart }) {
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);

  const lookup = useMemo(() => {
    const map = {};
    if (!data?.grid) return map;
    for (const row of data.grid) map[`${row.date}:${row.hour}`] = row;
    return map;
  }, [data]);

  const dates = useMemo(() => {
    return DAY_LABELS.map((_, i) => {
      const d = new Date(weekStart + "T12:00:00");
      d.setDate(d.getDate() + i);
      return localYMD(d);
    });
  }, [weekStart]);

  const maxSecs = useMemo(() => {
    let m = 1;
    if (!data?.grid) return m;
    for (const row of data.grid) if ((row.total_seconds || 0) > m) m = row.total_seconds;
    return m;
  }, [data]);

  const peakHourByDay = useMemo(() => {
    const map = {};
    if (!data?.grid) return map;
    for (const row of data.grid) {
      const prev = map[row.date];
      if (!prev || row.total_seconds > prev.secs)
        map[row.date] = { hour: row.hour, secs: row.total_seconds, domCat: row.dominant_category || "" };
    }
    return map;
  }, [data]);

  // Derive insights from grid data
  const insights = useMemo(() => deriveHourlyInsights(data?.grid || [], dates), [data, dates]);

  function cellColor(secs, dominantCat) {
    if (!secs || secs < 30) return "rgba(255,255,255,0.03)";
    const intensity = Math.pow(Math.min(secs / maxSecs, 1), 0.55);
    const cat = (dominantCat || "").toLowerCase();
    let r, g, b;
    if      (cat === "productive")    { r = 30;  g = 180; b = 100; }
    else if (cat === "communication") { r = 50;  g = 130; b = 240; }
    else if (cat === "browser")       { r = 130; g = 90;  b = 230; }
    else if (cat === "neutral")       { r = 200; g = 150; b = 20;  }
    else if (cat === "entertainment") { r = 220; g = 70;  b = 70;  }
    else if (cat === "unproductive")  { r = 200; g = 40;  b = 60;  }
    else if (cat === "system")        { r = 20;  g = 190; b = 210; }
    else                              { r = 80;  g = 100; b = 120; }
    return `rgba(${r},${g},${b},${(0.12 + intensity * 0.82).toFixed(2)})`;
  }

  function borderColor(secs, dominantCat) {
    if (!secs || secs < 30) return "transparent";
    const cat = (dominantCat || "").toLowerCase();
    const m = {
      productive: "rgba(74,222,128,0.3)", communication: "rgba(96,165,250,0.3)",
      browser: "rgba(167,139,250,0.3)",   neutral: "rgba(251,191,36,0.3)",
      entertainment: "rgba(248,113,113,0.3)", unproductive: "rgba(251,113,133,0.3)",
      system: "rgba(34,211,238,0.3)",
    };
    return m[cat] || "rgba(100,116,139,0.2)";
  }

  const CELL_W = 28, CELL_H = 20, GAP = 2;
  const DAY_COL_W = 30;
  const TT_W = 148, TT_H = 72;

  function handleMouseEnter(e, dayIdx, date, h, secs, prodPct, domCat) {
    if (!secs) return;
    const cell = e.currentTarget.getBoundingClientRect();
    const container = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    let left = cell.left - container.left + CELL_W / 2 - TT_W / 2;
    let top  = cell.top  - container.top  - TT_H - 6;
    const contW = containerRef.current?.offsetWidth || 800;
    left = Math.max(0, Math.min(left, contW - TT_W));
    if (top < 0) top = cell.top - container.top + CELL_H + 6;
    setTooltip({ day: DAY_LABELS[dayIdx], hour: h, secs, prodPct, domCat, left, top });
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>

      {/* ── Hour labels header ── */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <div style={{ width: DAY_COL_W, flexShrink: 0 }} />
        <div style={{ display: "flex", flex: 1 }}>
          {HOUR_LABELS_FULL.map((lbl, h) => (
            <div key={h} style={{
              flex: 1, position: "relative", height: 14,
            }}>
              {lbl && (
                <span style={{
                  position: "absolute", left: "50%", transform: "translateX(-50%)",
                  fontSize: 8.5, color: "#3d526b", fontFamily: "'DM Mono',monospace",
                  fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "-0.01em",
                }}>
                  {lbl}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Grid rows ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
        {dates.map((date, dayIdx) => {
          const isWeekend = dayIdx >= 5;
          const peak = peakHourByDay[date];
          const peakColor = peak ? (CATEGORY_COLORS[(peak.domCat || "").toLowerCase()] || "#64748b") : "#1e293b";

          return (
            <div key={date} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: DAY_COL_W, flexShrink: 0, fontSize: 9, fontWeight: 700,
                color: isWeekend ? "#3d526b" : "#4a6080",
                fontFamily: "'DM Sans',sans-serif",
                textAlign: "right", paddingRight: 7, letterSpacing: "0.04em",
              }}>
                {DAY_LABELS[dayIdx]}
              </div>

              {/* 24 cells — flex:1 each so they fill all available width */}
              <div style={{ display: "flex", flex: 1 }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const entry   = lookup[`${date}:${h}`];
                  const secs    = entry?.total_seconds    || 0;
                  const prodPct = entry?.productive_pct   || 0;
                  const domCat  = entry?.dominant_category || "";
                  const isPeak  = peak?.hour === h && secs > 0;

                  return (
                    <div
                      key={h}
                      onMouseEnter={e => handleMouseEnter(e, dayIdx, date, h, secs, prodPct, domCat)}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        flex: 1, height: CELL_H,
                        marginRight: h < 23 ? GAP : 0,
                        borderRadius: 3,
                        background: cellColor(secs, domCat),
                        border: isPeak ? `1px solid ${peakColor}` : `1px solid ${borderColor(secs, domCat)}`,
                        boxShadow: isPeak && secs > 0 ? `0 0 4px ${peakColor}55` : "none",
                        transition: "transform 0.08s",
                      }}
                      onMouseOver={e => { if (secs > 0) e.currentTarget.style.transform = "scale(1.35)"; }}
                      onMouseOut={e => { e.currentTarget.style.transform = "scale(1)"; }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.left, top: tooltip.top,
          pointerEvents: "none",
          background: "rgba(8,11,22,0.97)",
          border: "1px solid rgba(255,255,255,0.11)",
          borderRadius: 9, padding: "8px 11px",
          zIndex: 200, whiteSpace: "nowrap",
          boxShadow: "0 6px 20px rgba(0,0,0,0.65)",
          width: TT_W,
        }}>
          <div style={{ fontSize: 9.5, color: "#475569", fontWeight: 600, marginBottom: 3 }}>
            {tooltip.day} · {fmtHour(tooltip.hour)}
          </div>
          <div style={{ fontSize: 15, color: "#f1f5f9", fontFamily: "'DM Mono',monospace", fontWeight: 800, lineHeight: 1, marginBottom: 5 }}>
            {fmtTime(tooltip.secs)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {tooltip.domCat && (
              <>
                <div style={{ width: 6, height: 6, borderRadius: 1.5, background: CATEGORY_COLORS[tooltip.domCat] || "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: CATEGORY_COLORS[tooltip.domCat] || "#94a3b8", textTransform: "capitalize", fontWeight: 600 }}>
                  {tooltip.domCat}
                </span>
              </>
            )}
            {tooltip.prodPct > 0 && (
              <span style={{ fontSize: 9.5, color: tooltip.prodPct >= 60 ? "#4ade80" : tooltip.prodPct >= 35 ? "#fbbf24" : "#f87171", marginLeft: tooltip.domCat ? 4 : 0 }}>
                · {tooltip.prodPct}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Insights row ── */}
      {insights.length > 0 && (
        <div style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "grid",
          gridTemplateColumns: `repeat(${insights.length}, 1fr)`,
          gap: 8,
        }}>
          {insights.map((ins, i) => (
            <div key={i} style={{
              background: `${ins.color}08`,
              border: `1px solid ${ins.color}18`,
              borderRadius: 9, padding: "8px 10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 11 }}>{ins.icon}</span>
                <span style={{ fontSize: 8.5, color: ins.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {ins.label}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1.1, marginBottom: 3 }}>
                {ins.value}
              </div>
              <div style={{ fontSize: 9.5, color: "#475569", lineHeight: 1.4 }}>
                {ins.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, paddingLeft: DAY_COL_W, flexWrap: "wrap" }}>
        <span style={{ fontSize: 8.5, color: "#2d3f52", fontWeight: 700, marginRight: 1 }}>Key:</span>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color, opacity: 0.7 }} />
            <span style={{ fontSize: 8.5, color: "#3d526b", textTransform: "capitalize" }}>{cat}</span>
          </div>
        ))}
        <span style={{ fontSize: 8.5, color: "#253040", marginLeft: 4 }}>· brighter = more time · outlined = peak hour</span>
      </div>
    </div>
  );
}

// ── Daily bar chart — fixed viewBox SVG, bars evenly distributed ──
function DailyBars({ days, animKey }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, [animKey]);

  if (!days || !days.length) return null;

  const seconds = days.map(d => d.total_seconds || 0);
  const maxVal = Math.max(...seconds, 1);
  const maxSec = Math.max(...seconds);
  const minSec = Math.min(...seconds.filter(s => s > 0));
  const peakIdx = seconds.indexOf(maxSec);
  const lowestIdx = minSec > 0 ? seconds.indexOf(minSec) : -1;

  // Fixed coordinate system — always 560 × 160
  const VW = 560, VH = 160;
  const PT = 24;   // paddingTop  — room for crown/value above bar
  const PB = 18;   // paddingBottom — room for day label
  const PX = 10;   // left/right padding
  const chartH = VH - PT - PB;          // 118px usable bar area
  const n = days.length;                 // 7
  const colW = (VW - PX * 2) / n;       // width per column
  const barW = Math.round(colW * 0.52);  // bar occupies 52% of column width

  // Y grid lines at 25 / 50 / 75 / 100%
  const grids = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
    >
      <defs>
        {days.map((d, i) => {
          const productive = d.productive_pct || 0;
          const base = productive >= 60 ? "#4ade80" : productive >= 40 ? "#fbbf24" : "#f87171";
          const isPeak = i === peakIdx && seconds[i] > 0;
          const top = isPeak ? "#fbbf24" : base;
          const bot = isPeak ? "#f59e0b" : base;
          return (
            <linearGradient key={i} id={`dbg-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={top} stopOpacity="1" />
              <stop offset="100%" stopColor={bot} stopOpacity="0.4" />
            </linearGradient>
          );
        })}
      </defs>

      {/* Grid lines */}
      {grids.map(f => {
        const gy = PT + chartH * (1 - f);
        return (
          <line key={f}
            x1={PX} y1={gy} x2={VW - PX} y2={gy}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,4"
          />
        );
      })}

      {days.map((d, i) => {
        const secs = seconds[i];
        const hasData = secs > 0;
        const frac = hasData ? secs / maxVal : 0;
        const barH = Math.max(frac * chartH, hasData ? 3 : 0);

        // Column centre x
        const cx = PX + colW * i + colW / 2;
        const bx = cx - barW / 2;

        // Bar top y (animates from bottom when !mounted)
        const barTopY = PT + chartH - barH;
        const animY = mounted ? barTopY : PT + chartH;
        const animH = mounted ? barH : 0;

        const productive = d.productive_pct || 0;
        const base = productive >= 60 ? "#4ade80" : productive >= 40 ? "#fbbf24" : "#f87171";
        const isPeak = i === peakIdx && hasData;
        const isLowest = i === lowestIdx && hasData && lowestIdx !== peakIdx;
        const labelColor = isPeak ? "#fbbf24" : isLowest ? "#64748b" : base;
        const dayColor = isPeak ? "#fbbf24" : isLowest ? "#475569" : "#3d4f63";

        // Show time label: inside bar if tall enough (>28px), otherwise above it
        const labelInside = barH > 30;
        const labelY = labelInside
          ? animY + Math.min(animH * 0.38, 14)
          : animY - 4;

        return (
          <g key={d.date || i}>

            {/* Background track */}
            <rect x={bx} y={PT} width={barW} height={chartH} rx="5" fill="rgba(255,255,255,0.03)" />

            {/* Bar */}
            {hasData && (
              <rect
                x={bx} y={animY} width={barW} height={animH} rx="5"
                fill={`url(#dbg-${i})`}
                style={{
                  transition: mounted
                    ? `y ${0.55 + i * 0.04}s cubic-bezier(0.34,1.56,0.64,1) ${i * 45}ms,
                       height ${0.55 + i * 0.04}s cubic-bezier(0.34,1.56,0.64,1) ${i * 45}ms`
                    : "none",
                  filter: isPeak
                    ? "drop-shadow(0 0 6px rgba(251,191,36,0.55))"
                    : `drop-shadow(0 0 3px ${base}35)`,
                }}
              />
            )}

            {/* Top shine stripe */}
            {hasData && mounted && barH > 6 && (
              <rect
                x={bx} y={animY} width={barW} height={Math.min(animH * 0.35, 10)} rx="5"
                fill="rgba(255,255,255,0.12)" style={{ pointerEvents: "none" }}
              />
            )}

            {/* Time value label */}
            {hasData && (
              <text x={cx} y={mounted ? labelY : PT + chartH - 4}
                textAnchor="middle"
                fill={labelInside ? "rgba(255,255,255,0.85)" : labelColor}
                fontSize="8.5" fontWeight="700" fontFamily="'DM Mono',monospace"
                style={{
                  opacity: mounted ? 1 : 0,
                  transition: `opacity 0.35s ease ${i * 45 + 220}ms`,
                }}>
                {fmtTime(secs)}
              </text>
            )}

            {/* Crown / sleep badge above bar */}
            {isPeak && mounted && (
              <text x={cx} y={PT - 5} textAnchor="middle" fontSize="11"
                style={{
                  opacity: mounted ? 1 : 0,
                  transition: `opacity 0.3s ease ${i * 45 + 300}ms`,
                  filter: "drop-shadow(0 0 4px rgba(251,191,36,0.8))",
                }}>
                👑
              </text>
            )}
            {isLowest && mounted && (
              <text x={cx} y={PT - 5} textAnchor="middle" fontSize="10"
                style={{ opacity: mounted ? 1 : 0, transition: `opacity 0.3s ease ${i * 45 + 300}ms` }}>
                💤
              </text>
            )}

            {/* Day label */}
            <text x={cx} y={VH - 2} textAnchor="middle"
              fill={dayColor} fontSize="9.5" fontWeight="700"
              fontFamily="'DM Sans',sans-serif" letterSpacing="0.5">
              {DAY_LABELS[i] || ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Stat card (redesigned, wider, with mini gauge) ──
function StatCard({ label, value, color = "#4ade80", icon, trendValues = [], sublabel }) {
  return (
    <div style={{ flex: 1, minWidth: 130, background: `linear-gradient(145deg, ${color}08, ${color}04)`, border: `1px solid ${color}1a`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -18, right: -18, width: 72, height: 72, borderRadius: "50%", background: `${color}08`, pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
          <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
        </div>
        <TinySparkline values={trendValues} color={color} width={52} height={18} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", fontFamily: "'DM Mono',monospace", lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
        {sublabel && <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

// ── Insight card ──
function InsightCard({ text, index }) {
  return (
    <div style={{
      animation: `wr-fade-in 0.35s cubic-bezier(0.34,1.56,0.64,1) ${index * 55}ms both`,
      background: "rgba(14,18,32,0.7)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "13px 16px", display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1, filter: "drop-shadow(0 0 6px rgba(251,191,36,0.5))" }}>💡</span>
      <p style={{ margin: 0, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif" }}>{text}</p>
    </div>
  );
}

// ── Top app row ──
function TopApp({ app, seconds, maxSec, rank, trend, deltaPct }) {
  const rankColor = rank === 1 ? "#fbbf24" : rank <= 3 ? "#a78bfa" : "#475569";
  const trendColor = trend === "up" ? "#f87171" : trend === "down" ? "#4ade80" : trend === "new" ? "#22d3ee" : "#64748b";
  const trendText = trend === "up" ? `↑${Math.abs(deltaPct || 0)}%` : trend === "down" ? `↓${Math.abs(deltaPct || 0)}%` : trend === "new" ? "new" : "—";
  const barPct = Math.min((seconds / maxSec) * 100, 100);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 16, textAlign: "center", fontSize: 10, fontWeight: 800, color: rankColor, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{rank}</span>
      <AppIcon appName={app} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 11.5, color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.replace(".exe", "")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 6, flexShrink: 0 }}>
            {trend && trend !== "flat" && <span style={{ fontSize: 9.5, color: trendColor, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{trendText}</span>}
            <span style={{ fontSize: 10.5, color: "#64748b", fontFamily: "'DM Mono',monospace" }}>{fmtTime(seconds)}</span>
          </div>
        </div>
        <div style={{ height: 2.5, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, width: `${barPct}%`, background: `linear-gradient(90deg,${rankColor},${rankColor}70)`, transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)" }} />
        </div>
      </div>
    </div>
  );
}

// ── Limit row ──
function LimitRow({ app, hits, edits }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AppIcon appName={app} size={22} />
        <span style={{ fontSize: 11.5, color: "#e2e8f0", fontWeight: 500 }}>{app.replace(".exe", "")}</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {hits > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#f87171", fontFamily: "'DM Mono',monospace", background: "rgba(248,113,113,0.1)", padding: "2px 7px", borderRadius: 5 }}>{hits}x hit</span>}
        {edits > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fbbf24", fontFamily: "'DM Mono',monospace", background: "rgba(251,191,36,0.1)", padding: "2px 7px", borderRadius: 5 }}>{edits}x edit</span>}
      </div>
    </div>
  );
}

// ── Goal badge ──
function GoalBadge({ goal }) {
  const rate = goal.total_days > 0 ? Math.round((goal.days_met / goal.total_days) * 100) : 0;
  const color = rate >= 80 ? "#4ade80" : rate >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ background: `${color}08`, border: `1px solid ${color}1e`, borderRadius: 11, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: "#e2e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{goal.label || goal.goal_type}</div>
        <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{goal.days_met}/{goal.total_days} days met</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{rate}%</div>
    </div>
  );
}

// ── Animated content wrapper ──
function AnimatedContent({ children, animKey, reportRef }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 55);
    return () => clearTimeout(t);
  }, [animKey]);
  return (
    <div ref={reportRef} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)", transition: "opacity 0.3s ease, transform 0.36s cubic-bezier(0.34,1.56,0.64,1)", display: "flex", flexDirection: "column", gap: 14 }}>
      {children}
    </div>
  );
}

// ── Compact section wrapper ──
function Panel({ title, children, style = {}, titleRight }) {
  return (
    <div style={{ background: "rgba(12,16,28,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'DM Sans',sans-serif" }}>{title}</span>
          {titleRight}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Delta pill ──
function DeltaPill({ label, value, sign, color }) {
  return (
    <div style={{ background: `${color}08`, border: `1px solid ${color}18`, borderRadius: 10, padding: "8px 12px", flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 9, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{value} <span style={{ color: sign >= 0 ? "#4ade80" : "#f87171", fontSize: 12 }}>{sign >= 0 ? "↑" : "↓"}</span></div>
    </div>
  );
}

export default function WeeklyReportPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(() => weekBounds(localYMD()).start);
  const [sending, setSending] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [weekMenuOpen, setWeekMenuOpen] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [compareWeekA, setCompareWeekA] = useState(() => weekBounds(localYMD()).start);
  const [compareWeekB, setCompareWeekB] = useState(() => {
    const d = new Date(weekBounds(localYMD()).start + "T12:00:00");
    d.setDate(d.getDate() - 7);
    return localYMD(d);
  });
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [verbosity, setVerbosity] = useState("standard");
  const [hourlyData, setHourlyData] = useState(null); // 7×24 grid from backend
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const reportRef = useRef(null);

  const showT = (msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const week = weekBounds(weekMonday);
  const currentWeekMonday = weekBounds(localYMD()).start;
  const earliestMonday = weekBounds(EARLIEST_WEEK).start;
  const isCurrentWeek = weekMonday === currentWeekMonday;
  const canGoBack = weekMonday > earliestMonday;
  const canGoForward = weekMonday < currentWeekMonday;

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then(r => r.json())
      .then(d => setVerbosity((d.weekly_report_verbosity || "standard").toLowerCase()))
      .catch(() => {});
    fetch(`${BASE}/api/weekly-report/available-weeks`)
      .then(r => r.json())
      .then(d => {
        const options = Array.isArray(d) ? d : [];
        setAvailableWeeks(options);
        if (options.length > 0) {
          setCompareWeekA(prev => options.some(x => x.value === prev) ? prev : options[0].value);
          setCompareWeekB(prev => options.some(x => x.value === prev && x.value !== options[0]?.value) ? prev : (options[1]?.value || options[0].value));
        }
      })
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setHourlyData(null);
    try {
      const r = await fetch(`${BASE}/api/weekly-report?week_of=${weekMonday}&verbosity=${verbosity}`);
      const j = await r.json();
      setReport(j.error ? null : j);
    } catch { setReport(null); }

    // Fetch hourly activity grid — endpoint: /api/hourly-activity?week_of=YYYY-MM-DD
    // Expected response: { grid: [ {date, hour, total_seconds, productive_pct}... ] }
    // Falls back gracefully to null if endpoint doesn't exist yet
    try {
      const hr = await fetch(`${BASE}/api/hourly-activity?week_of=${weekMonday}`);
      if (hr.ok) {
        const hj = await hr.json();
        setHourlyData(hj.error ? null : hj);
      }
    } catch { /* endpoint not yet available — heatmap will be hidden */ }

    setLoading(false);
  }, [weekMonday, verbosity]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const navigateWeek = (dir) => {
    if (dir === -1 && !canGoBack) return;
    if (dir === 1 && !canGoForward) return;
    const d = new Date(weekMonday + "T12:00:00");
    d.setDate(d.getDate() + dir * 7);
    setWeekMonday(localYMD(d));
  };

  const sendTelegram = async () => {
    setSending(true);
    try {
      const r = await fetch(`${BASE}/api/weekly-report/send-telegram`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_of: weekMonday }),
      });
      const j = await r.json();
      j.ok ? showT("Report sent to Telegram!") : showT(j.error || "Failed to send", "warn");
    } catch (e) {
      showT(e instanceof TypeError ? "Server unreachable" : "Failed to send", "warn");
    }
    setSending(false);
  };

  const downloadJson = () => { try { downloadBlob(`stasis-weekly-${week.start}.json`, "application/json", JSON.stringify(report, null, 2)); showT("JSON downloaded"); } catch { showT("Failed", "warn"); } };
  const downloadCsv = () => { try { downloadBlob(`stasis-weekly-${week.start}.csv`, "text/csv;charset=utf-8", reportToCsv(report)); showT("CSV downloaded"); } catch { showT("Failed", "warn"); } };

  const exportPdf = async () => {
    if (!reportRef.current) { showT("Nothing to export", "warn"); return; }
    try {
      showT("Opening print dialog…");

      // Clone the report node into a minimal printable document
      const el = reportRef.current;
      const clone = el.cloneNode(true);

      // Inline the computed styles for all elements so the print window looks right
      const allEls = el.querySelectorAll("*");
      const cloneEls = clone.querySelectorAll("*");
      allEls.forEach((src, idx) => {
        const computed = window.getComputedStyle(src);
        const target = cloneEls[idx];
        if (!target) return;
        // Copy only key visual properties to avoid massive strings
        const props = [
          "color","background","backgroundColor","border","borderRadius","padding","margin",
          "fontSize","fontWeight","fontFamily","lineHeight","letterSpacing","textTransform",
          "display","flexDirection","gap","gridTemplateColumns","alignItems","justifyContent",
          "width","height","minWidth","maxWidth","overflow","opacity","boxShadow","filter",
          "position","top","left","right","bottom","flex","flexShrink","flexGrow",
        ];
        props.forEach(p => {
          try { target.style[p] = computed[p]; } catch {}
        });
      });

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Stasis Weekly Report — ${week.start}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 16px; background: #080c18; color: #f1f5f9; font-family: 'DM Sans', sans-serif; }
    @media print {
      html, body { padding: 12px; }
      @page { size: A4; margin: 10mm; }
    }
    svg { display: block; max-width: 100%; }
  </style>
</head>
<body>${clone.outerHTML}</body>
</html>`;

      const printWin = window.open("", "_blank", "width=900,height=700");
      if (!printWin) { showT("Pop-up blocked — allow pop-ups to export PDF", "warn"); return; }
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      // Give browser time to render SVGs before triggering print
      setTimeout(() => {
        printWin.print();
        // Close after print dialog is dismissed (delay so user can save as PDF)
        setTimeout(() => printWin.close(), 2000);
      }, 600);
      showT("Use 'Save as PDF' in the print dialog");
    } catch (err) {
      console.error(err);
      showT("Failed to export PDF", "warn");
    }
  };

  const compareWeeks = async () => {
    setCompareLoading(true);
    try {
      const r = await fetch(`${BASE}/api/weekly-report/compare?week_a=${compareWeekA}&week_b=${compareWeekB}`);
      const j = await r.json();
      setCompareData(j.error ? null : j);
      if (j.error) showT(j.error, "warn");
    } catch { showT("Failed to compare weeks", "warn"); }
    setCompareLoading(false);
  };

  const s = report?.summary;
  const topMax = report?.top_apps?.[0]?.total_seconds || 1;
  const trend = useMemo(() => {
    const list = report?.trends || [];
    return {
      screen: list.map(x => x.screen_time || 0),
      avg: list.map(x => x.avg_daily || 0),
      prod: list.map(x => x.productivity_pct || 0),
      focus: list.map(x => x.focus_score || 0),
    };
  }, [report]);

  const navBtnStyle = (enabled) => ({
    width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
    background: enabled ? "rgba(255,255,255,0.04)" : "transparent",
    color: enabled ? "#94a3b8" : "#1e293b", cursor: enabled ? "pointer" : "not-allowed",
    fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @keyframes wr-fade-in { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:none; } }
        @keyframes wr-spin { to { transform:rotate(360deg); } }
        @keyframes wr-toast { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:none; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 500,
          background: "rgba(9,13,22,0.97)", border: `1px solid ${toast.type === "warn" ? "rgba(251,191,36,0.3)" : "rgba(74,222,128,0.3)"}`,
          borderRadius: 12, padding: "11px 18px", color: toast.type === "warn" ? "#fbbf24" : "#4ade80",
          fontSize: 12.5, fontWeight: 500, boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", gap: 9, animation: "wr-toast 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <span>{toast.type === "warn" ? "⚠️" : "✓"}</span>{toast.msg}
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", fontFamily: "'DM Mono',monospace" }}>Weekly Report</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 1 }}>{fmtWeekRange(week.start, week.end)}</div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Week nav */}
          <button onClick={() => navigateWeek(-1)} disabled={!canGoBack} title="Previous week" style={navBtnStyle(canGoBack)}>←</button>

          {isCurrentWeek ? (
            <div style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(34,211,238,0.25)", background: "rgba(34,211,238,0.07)", color: "#22d3ee", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em" }}>THIS WEEK</div>
          ) : (
            <button onClick={() => setWeekMonday(currentWeekMonday)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>↩ Now</button>
          )}

          <button onClick={() => navigateWeek(1)} disabled={!canGoForward} title="Next week" style={navBtnStyle(canGoForward)}>→</button>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)", margin: "0 2px" }} />

          {/* Compare */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { setCompareOpen(v => !v); setExportOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(167,139,250,0.25)", background: compareData ? "rgba(167,139,250,0.12)" : "rgba(167,139,250,0.06)",
              color: "#a78bfa", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
            }}>⇄ Compare {compareData && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa" }} />}</button>

            {compareOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 40, width: 300, background: "rgba(9,13,24,0.99)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.65)", padding: 14 }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontWeight: 700 }}>Compare Two Weeks</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {["a", "b"].map((slot, si) => {
                    const curVal = slot === "a" ? compareWeekA : compareWeekB;
                    const otherVal = slot === "a" ? compareWeekB : compareWeekA;
                    const setter = slot === "a" ? setCompareWeekA : setCompareWeekB;
                    return (
                      <div key={slot}>
                        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 5, fontWeight: 600 }}>Week {si + 1}</div>
                        <button onClick={() => setWeekMenuOpen(weekMenuOpen === slot ? null : slot)} style={{ width: "100%", textAlign: "left", background: "rgba(255,255,255,0.04)", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "8px 10px", fontSize: 11.5, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
                          {availableWeeks.find(x => x.value === curVal)?.label || "Select week"} <span style={{ color: "#334155", float: "right" }}>▾</span>
                        </button>
                        {weekMenuOpen === slot && (
                          <div style={{ marginTop: 5 }}>
                            <WeekOptionMenu options={availableWeeks} selected={curVal} disabledValue={otherVal} onSelect={(v) => { setter(v); setWeekMenuOpen(null); }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={async () => { await compareWeeks(); setCompareOpen(false); }} disabled={compareLoading || compareWeekA === compareWeekB}
                    style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(34,211,238,0.25)", background: "rgba(34,211,238,0.07)", color: compareWeekA === compareWeekB ? "#334155" : "#22d3ee", cursor: compareWeekA === compareWeekB ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>
                    {compareLoading ? "Comparing…" : "Run Comparison"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { setExportOpen(v => !v); setCompareOpen(false); }} disabled={!report} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.06)", color: "#60a5fa",
              fontSize: 11, fontWeight: 700, cursor: report ? "pointer" : "not-allowed", opacity: report ? 1 : 0.4, letterSpacing: "0.04em",
            }}>↓ Export</button>

            {exportOpen && report && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 40, minWidth: 175, background: "rgba(9,13,24,0.99)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.65)", overflow: "hidden" }}>
                {[
                  { label: "📄 Download PDF", action: async () => { await exportPdf(); setExportOpen(false); } },
                  { label: "📊 Download CSV", action: () => { downloadCsv(); setExportOpen(false); } },
                  { label: "📦 Download JSON", action: () => { downloadJson(); setExportOpen(false); } },
                  { label: sending ? "✈️ Sending…" : "✈️ Send Telegram", action: async () => { await sendTelegram(); setExportOpen(false); } },
                ].map(item => (
                  <button key={item.label} onClick={item.action} style={{ width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh */}
          <button onClick={fetchReport} title="Refresh" style={{ ...navBtnStyle(true), color: "#475569" }}>↻</button>
        </div>
      </div>

      {/* ── BODY ── */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "60px 0", color: "#334155", fontSize: 13 }}>
          <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.06)", borderTopColor: "#22d3ee", borderRadius: "50%", animation: "wr-spin 0.7s linear infinite" }} />
          Generating report…
        </div>
      ) : !report ? (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "rgba(12,15,28,0.4)", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: 18 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 18, color: "#334155", marginBottom: 6, fontWeight: 700 }}>No data for this week</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Try navigating to a week with activity data</div>
        </div>
      ) : (
        <AnimatedContent animKey={weekMonday} reportRef={reportRef}>

          {/* ── ROW 1: Stat cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            <StatCard icon="🖥️" label="Screen Time" value={fmtTime(s?.total_screen_time || 0)} color="#60a5fa" trendValues={trend.screen} sublabel="total this week" />
            <StatCard icon="📅" label="Daily Average" value={fmtTime(s?.avg_daily || 0)} color="#a78bfa" trendValues={trend.avg} sublabel="per active day" />
            <StatCard icon="💪" label="Productivity" value={`${Math.round(s?.productivity_pct || 0)}%`} color="#4ade80" trendValues={trend.prod} sublabel="of total time" />
            <StatCard icon="🎯" label="Focus Score" value={`${Math.round(s?.avg_focus_score || 0)}`} color="#fbbf24" trendValues={trend.focus} sublabel="weekly avg" />
          </div>

          {/* ── Compare deltas (if active) ── */}
          {compareData?.diff && (
            <Panel title={`vs. ${availableWeeks.find(x => x.value === compareWeekB)?.label || "Previous week"}`} titleRight={<button onClick={() => setCompareData(null)} style={{ fontSize: 10, color: "#334155", background: "none", border: "none", cursor: "pointer" }}>✕ clear</button>}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                <DeltaPill label="Screen Δ" value={fmtTime(Math.abs(compareData.diff.screen_time_delta || 0))} sign={compareData.diff.screen_time_delta} color="#60a5fa" />
                <DeltaPill label="Avg/Day Δ" value={fmtTime(Math.abs(compareData.diff.avg_daily_delta || 0))} sign={compareData.diff.avg_daily_delta} color="#a78bfa" />
                <DeltaPill label="Productivity Δ" value={`${Math.abs(compareData.diff.productivity_delta || 0)}pt`} sign={compareData.diff.productivity_delta} color="#4ade80" />
                <DeltaPill label="Focus Δ" value={`${Math.abs(compareData.diff.focus_delta || 0)}`} sign={compareData.diff.focus_delta} color="#fbbf24" />
              </div>
            </Panel>
          )}

          {/* ── ROW 2: Daily chart + Categories ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Panel title="Daily Breakdown" titleRight={
              <div style={{ display: "flex", gap: 16 }}>
                {report.peak_day && <span style={{ fontSize: 10, color: "#fbbf24" }}>👑 Peak: <strong>{fmtDateShort(report.peak_day.date)}</strong> · {fmtTime(report.peak_day.total_seconds)}</span>}
                {report.lightest_day && <span style={{ fontSize: 10, color: "#64748b" }}>💤 Lightest: <strong>{fmtDateShort(report.lightest_day.date)}</strong> · {fmtTime(report.lightest_day.total_seconds)}</span>}
              </div>
            }>
              <DailyBars days={report.daily_breakdown || []} animKey={weekMonday} />
            </Panel>

            <Panel title="Categories">
              <CategoryDonut categories={report.category_breakdown || []} />
            </Panel>
          </div>

          {/* ── ROW 2b: Hourly Heatmap (only shown if backend returns data) ── */}
          {hourlyData?.grid?.length > 0 && (
            <Panel title="Hourly Activity" style={{ gap: 8 }} titleRight={
              <span style={{ fontSize: 9, color: "#2d3f52" }}>hover cell · outlined = peak hour</span>
            }>
              <HourlyHeatmap
                data={hourlyData}
                weekStart={week.start}
                dailyBreakdown={report.daily_breakdown || []}
              />
            </Panel>
          )}

          {/* ── ROW 3: Top apps + Limits + Goals ── */}
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 1fr", gap: 10 }}>
            {/* Top apps */}
            <Panel title="Top Apps">
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {(report.top_apps || []).map((a, i) => (
                  <TopApp key={a.app_name} app={a.app_name} seconds={a.total_seconds} pct={a.pct} maxSec={topMax} rank={i + 1} trend={a.trend} deltaPct={a.delta_pct} />
                ))}
              </div>
            </Panel>

            {/* Limit discipline */}
            {report.limits && (report.limits.total_hits > 0 || report.limits.total_edits > 0) ? (
              <Panel title="Limit Discipline">
                <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                  <div style={{ flex: 1, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ fontSize: 9, color: "#f87171", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Limit Hits</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#f87171", fontFamily: "'DM Mono',monospace" }}>{report.limits.total_hits}</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ fontSize: 9, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Limit Edits</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fbbf24", fontFamily: "'DM Mono',monospace" }}>{report.limits.total_edits}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {(report.limits.per_app || []).map(a => <LimitRow key={a.app_name} app={a.app_name} hits={a.hits} edits={a.edits} />)}
                </div>
              </Panel>
            ) : (
              <Panel title="Limit Discipline">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: "20px 0" }}>
                  <span style={{ fontSize: 28, filter: "drop-shadow(0 0 8px rgba(74,222,128,0.4))" }}>✅</span>
                  <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>No limit hits this week</span>
                  <span style={{ fontSize: 10, color: "#334155" }}>Great self-discipline!</span>
                </div>
              </Panel>
            )}

            {/* Goals */}
            {report.goals && report.goals.length > 0 ? (
              <Panel title="Goals Achievement">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {report.goals.map((g, i) => <GoalBadge key={i} goal={g} />)}
                </div>
                {report.goal_drift_alerts?.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
                    {report.goal_drift_alerts.map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: a.severity === "high" ? "#f87171" : "#fbbf24", background: a.severity === "high" ? "rgba(248,113,113,0.07)" : "rgba(251,191,36,0.07)", border: `1px solid ${a.severity === "high" ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)"}`, borderRadius: 9, padding: "7px 9px" }}>
                        ⚠️ {a.message}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ) : (
              <Panel title="Goals Achievement">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: "20px 0" }}>
                  <span style={{ fontSize: 28 }}>🎯</span>
                  <span style={{ fontSize: 11, color: "#334155" }}>No goals tracked this week</span>
                </div>
              </Panel>
            )}
          </div>

          {/* ── ROW 4: Goal impact + What changed ── */}
          {(report.goal_impact_correlation || (report.what_changed && report.what_changed.length > 0)) && (
            <div style={{ display: "grid", gridTemplateColumns: report.goal_impact_correlation && report.what_changed?.length ? "1fr 1fr" : "1fr", gap: 10 }}>
              {report.goal_impact_correlation && (
                <Panel title="Goal Impact on Productivity">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ border: "1px solid rgba(74,222,128,0.18)", background: "rgba(74,222,128,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>Goals Met</div>
                      <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{report.goal_impact_correlation.with_goal_met_productivity ?? "—"}%</div>
                    </div>
                    <div style={{ border: "1px solid rgba(148,163,184,0.15)", background: "rgba(148,163,184,0.05)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>No Goals</div>
                      <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{report.goal_impact_correlation.without_goal_met_productivity ?? "—"}%</div>
                    </div>
                    <div style={{ border: "1px solid rgba(34,211,238,0.18)", background: "rgba(34,211,238,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>Delta</div>
                      <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{report.goal_impact_correlation.delta ?? "—"}pt</div>
                    </div>
                  </div>
                  {report.goal_impact_correlation.summary && <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{report.goal_impact_correlation.summary}</div>}
                </Panel>
              )}

              {report.what_changed && report.what_changed.length > 0 && (
                <Panel title="What Changed This Week">
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {report.what_changed.map((x, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: "#94a3b8", padding: "8px 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", lineHeight: 1.5 }}>{x}</div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )}

          {/* ── INSIGHTS (pinned last) ── */}
          {report.insights && report.insights.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: 13, filter: "drop-shadow(0 0 6px rgba(251,191,36,0.6))" }}>✨</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.12em" }}>Weekly Insights</span>
                <span style={{ fontSize: 10, color: "#1e293b", marginLeft: 2 }}>{report.insights.length} observations</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
                {report.insights.map((txt, i) => <InsightCard key={i} text={txt} index={i} />)}
              </div>
            </div>
          )}

          {/* ── Category insights (also at bottom) ── */}
          {report.category_insights?.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: 13 }}>🧩</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.12em" }}>Category Insights</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
                {report.category_insights.map((txt, i) => (
                  <div key={i} style={{ animation: `wr-fade-in 0.35s cubic-bezier(0.34,1.56,0.64,1) ${i * 55}ms both`, background: "rgba(14,18,32,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "13px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>🧠</span>
                    <p style={{ margin: 0, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.65 }}>{txt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </AnimatedContent>
      )}
    </div>
  );
}
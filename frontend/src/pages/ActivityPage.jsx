import { useState, useEffect, useRef } from "react";
import { CATEGORY_COLORS } from "../shared/constants";
import { fmtTime, trendPct } from "../shared/utils";
import { SectionCard, StatPill, TrendChip, HourlyBar } from "../shared/components";

// ─── WEEKLY TREND GRAPH ───────────────────────────────────────────────────────
function WeeklyTrendGraph({ BASE, onDayClick, activeDrillDate }) {
  const [trend, setTrend] = useState([]);
  const [hovIdx, setHovIdx] = useState(null);

  useEffect(() => {
    fetch(`${BASE}/api/weekly-trend`).then(r => r.json()).then(setTrend).catch(() => { });
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
    ...d
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
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
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
              fontSize: 9, fill: activeDrillDate === p.date ? "#34d399" : "#e2e8f0",
              fontFamily: "'DM Sans',sans-serif", transition: "fill 0.2s"
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

// ─── SESSION TIMELINE ─────────────────────────────────────────────────────────
function SessionTimeline({ BASE, date }) {
  const [catBlocks, setCatBlocks] = useState({});
  const [allCats, setAllCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hovBlock, setHovBlock] = useState(null);
  const [activeHours, setActiveHours] = useState([]);
  const [dayStart, setDayStart] = useState(0);
  const [dayEnd, setDayEnd] = useState(1440);
  const containerRef = useRef(null);
  const MIN_BLOCK_SECS = 60;

  useEffect(() => {
    setLoading(true);
    setHovBlock(null);
    fetch(`${BASE}/api/sessions?date=${date}`)
      .then(r => r.json())
      .then(rows => {
        const GAP_MINS = 5;
        const byCategory = {};
        let currentCat = null;
        let currentBlock = null;

        for (const row of rows) {
          const ts = new Date(row.ts);
          const min = ts.getHours() * 60 + ts.getMinutes();
          const cat = row.cat || "other";
          const isSameCat = cat === currentCat;
          const isSmallGap = currentBlock && (min - currentBlock.endMin) <= GAP_MINS;

          if (isSameCat && isSmallGap) {
            currentBlock.endMin = min + Math.max(Math.round(row.active / 60), 1);
            currentBlock.active += row.active;
            currentBlock.keys += row.keys;
            currentBlock.clicks += row.clicks;
            const appName = row.app.replace(".exe", "");
            currentBlock.apps[appName] = (currentBlock.apps[appName] || 0) + row.active;
          } else {
            if (currentBlock && currentBlock.active >= MIN_BLOCK_SECS) {
              if (!byCategory[currentCat]) byCategory[currentCat] = [];
              byCategory[currentCat].push(currentBlock);
            }
            currentCat = cat;
            currentBlock = {
              startMin: min,
              endMin: min + Math.max(Math.round(row.active / 60), 1),
              active: row.active,
              keys: row.keys,
              clicks: row.clicks,
              apps: { [row.app.replace(".exe", "")]: row.active },
              id: Math.random(),
            };
          }
        }
        if (currentBlock && currentBlock.active >= MIN_BLOCK_SECS) {
          if (!byCategory[currentCat]) byCategory[currentCat] = [];
          byCategory[currentCat].push(currentBlock);
        }

        // Update the state for rendering blocks and categories
        setCatBlocks(byCategory);
        const CAT_ORDER = ["productive", "neutral", "communication", "entertainment", "system", "social", "other"];
        const cats = Object.keys(byCategory).sort((a, b) => {
          const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return 0;
        });
        setAllCats(cats);

        const hourSet = new Set();
        const allBlocks = Object.values(byCategory).flat();
        allBlocks.forEach(b => {
          for (let h = Math.floor(b.startMin / 60); h <= Math.floor((b.endMin - 0.01) / 60); h++) {
            hourSet.add(h);
          }
        });
        const sortedHours = [...hourSet].sort((a, b) => a - b);
        setActiveHours(sortedHours);

        if (sortedHours.length) {
          setDayStart(sortedHours[0] * 60);
          setDayEnd((sortedHours[sortedHours.length - 1] + 1) * 60);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [BASE, date]);

  if (loading) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontSize: 13 }}>
      Loading sessions…
    </div>
  );
  if (!allCats.length) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "#e2e8f0", fontSize: 13 }}>
      No session data tracked for this day
    </div>
  );

  const hourMap = {};
  activeHours.forEach((h, i) => { hourMap[h] = i; });

  const toX = min => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const hIdx = hourMap[h];
    if (hIdx === undefined) {
      if (min <= dayStart) return 0;
      if (min >= dayEnd) return 100;
      // Find the closest previous hour
      const prev = activeHours.filter(ah => ah < h).pop();
      if (prev !== undefined) return ((hourMap[prev] + 1) / activeHours.length) * 100;
      return 0;
    }
    return ((hIdx + m / 60) / activeHours.length) * 100;
  };

  const fmtMin = min => {
    const totalMin = Math.round(min);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    const suffix = h < 12 ? " am" : " pm";
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}${m > 0 ? ":" + String(m).padStart(2, "0") : ""}${suffix}`;
  };

  // Identify jumps between non-consecutive active hours
  const jumps = [];
  for (let i = 1; i < activeHours.length; i++) {
    if (activeHours[i] !== activeHours[i - 1] + 1) {
      jumps.push(activeHours[i]);
    }
  }

  const LABEL_W = 120;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {hovBlock && (() => {
        const { cat, block, tipX, tipY } = hovBlock;
        const col = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
        const topApps = Object.entries(block.apps).sort(([, a], [, b]) => b - a).slice(0, 5);
        return (
          <div style={{
            position: "absolute", left: tipX, top: tipY,
            transform: "translate(-50%, calc(-100% - 12px))",
            pointerEvents: "none", zIndex: 50,
            background: "rgba(8,11,20,0.97)", border: `1px solid ${col.primary}45`,
            borderRadius: 14, boxShadow: `0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px ${col.primary}18`,
            minWidth: 220, maxWidth: 300, animation: "center-fade-in 0.13s ease both",
          }}>
            <div style={{
              position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(45deg)",
              width: 10, height: 10, background: "rgba(8,11,20,0.97)",
              border: `1px solid ${col.primary}45`, borderTop: "none", borderLeft: "none",
            }} />
            <div style={{ padding: "12px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ minWidth: 100 }}>
                <div style={{ fontSize: 10, color: col.primary, fontWeight: 700, textTransform: "capitalize", marginBottom: 4, letterSpacing: "0.06em" }}>{cat}</div>
                <div style={{ fontSize: 14, color: "#f8fafc", fontWeight: 700 }}>{fmtTime(block.active)}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>{fmtMin(block.startMin)} → {fmtMin(block.endMin)}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>⌨️ {block.keys.toLocaleString()} · 🖱 {block.clicks}</div>
              </div>
              {topApps.length > 0 && (
                <>
                  <div style={{ width: 1, alignSelf: "stretch", background: `${col.primary}20` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: "#475569", fontWeight: 600, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Apps</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {topApps.map(([app, secs]) => {
                        const pct = Math.round((secs / block.active) * 100);
                        return (
                          <div key={app} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 500, minWidth: 60, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app}</span>
                            <div style={{ flex: 1, height: 2, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: col.grad || col.primary, transition: "width 0.3s ease" }} />
                            </div>
                            <span style={{ fontSize: 9, color: "#475569", flexShrink: 0 }}>{fmtTime(secs)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Header ruler */}
      <div style={{ display: "flex" }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: "relative", height: 20, marginBottom: 6 }}>
          {activeHours.map((h) => (
            <div key={h} style={{ position: "absolute", left: `${toX(h * 60)}%`, top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 1, height: 7, background: "rgba(255, 255, 255, 0.12)" }} />
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", fontWeight: 500 }}>{fmtMin(h * 60)}</span>
            </div>
          ))}
          {activeHours.length > 0 && (
            <div style={{ position: "absolute", left: "100%", top: 0, display: "flex", flexDirection: "column", alignItems: "center", transform: "translateX(-100%)" }}>
              <div style={{ width: 1, height: 7, background: "rgba(255, 255, 255, 0.12)" }} />
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", fontWeight: 500 }}>{fmtMin((activeHours[activeHours.length - 1] + 1) * 60)}</span>
            </div>
          )}
          {/* Jump markers */}
          {jumps.map(h => (
            <div key={h} style={{
              position: "absolute", left: `${toX(h * 60)}%`, top: 0, bottom: -((allCats.length * 36) + 10),
              width: 1, borderLeft: "1px dashed rgba(255,255,255,0.08)", zIndex: 0, pointerEvents: "none"
            }} />
          ))}
        </div>
      </div>

      {/* Category rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {allCats.map(cat => {
          const col = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
          const blocks = catBlocks[cat] || [];
          const emoji = { productive: "💼", communication: "💬", entertainment: "🎮", system: "⚙️", neutral: "🌐", social: "📣", other: "📦" }[cat] || "•";
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: LABEL_W, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, paddingRight: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: col.grad || col.primary, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: col.primary, fontWeight: 600, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                  {emoji} {cat}
                </span>
              </div>
              <div style={{ flex: 1, position: "relative", height: 28, background: "rgba(255, 255, 255, 0.03)", borderRadius: 8, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                {blocks.map(block => {
                  const left = toX(block.startMin);
                  const width = Math.max(toX(block.endMin) - left, 0.4);
                  const isHov = hovBlock?.block?.id === block.id;
                  return (
                    <div
                      key={block.id}
                      onMouseEnter={(e) => {
                        const container = containerRef.current;
                        if (!container) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        setHovBlock({ cat, block, tipX: rect.left + rect.width / 2 - containerRect.left, tipY: rect.top - containerRect.top });
                      }}
                      onMouseLeave={() => setHovBlock(null)}
                      style={{
                        position: "absolute", left: `${left}%`, width: `${width}%`,
                        top: 3, bottom: 3, borderRadius: 4,
                        background: isHov ? (col.grad || col.primary) : `${col.primary}bb`,
                        boxShadow: isHov ? `0 0 12px ${col.primary}88` : "none",
                        transition: "all 0.15s ease", cursor: "pointer",
                        display: "flex", alignItems: "center", overflow: "hidden",
                      }}
                    >
                      {width > 6 && (
                        <span style={{
                          fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                          paddingLeft: 5, whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(15,18,34,0.7)",
                          letterSpacing: "0.02em",
                        }}>
                          {fmtTime(block.active)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ACTIVITY PAGE ────────────────────────────────────────────────────────────
export default function ActivityPage({ BASE, selectedDate, data, stats, prevStats, prevWellbeing, showComparison, hourly, peakHour, countKey }) {
  const [drillDate, setDrillDate] = useState(null);
  const [drillHourly, setDrillHourly] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const drillPeak = drillHourly ? drillHourly.reduce((pi, v, i) => v > drillHourly[pi] ? i : pi, 0) : 0;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stat pills */}
      <div className="grid-4-sm" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="⏱" label="Screen Time" value={fmtTime(data.totalScreenTime)} color="#4ade80" />
          {showComparison && prevWellbeing && (
            <TrendChip current={data.totalScreenTime} previous={prevWellbeing.totalScreenTime} mode="time" isPositiveGood={false} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="💬" label="Sessions" value={data.totalSessions} color="#60a5fa" />
          {showComparison && prevWellbeing && (
            <TrendChip current={data.totalSessions} previous={prevWellbeing.totalSessions} mode="count" isPositiveGood={true} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="⌨️" label="Keystrokes" value={data.totalKeystrokes.toLocaleString()} color="#a78bfa" />
          {showComparison && prevWellbeing && (
            <TrendChip current={data.totalKeystrokes} previous={prevWellbeing.totalKeystrokes} mode="count" isPositiveGood={true} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="🖱️" label="Clicks" value={data.totalClicks.toLocaleString()} color="#f472b6" />
          {showComparison && prevWellbeing && (
            <TrendChip current={data.totalClicks} previous={prevWellbeing.totalClicks} mode="count" isPositiveGood={true} />
          )}
        </div>

      </div>

      {/* Weekly trend */}
      <SectionCard title="14-Day Screen Time Trend">
        <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 12 }}>
          Click any point to see that day's hourly breakdown ↓
        </div>
        <WeeklyTrendGraph BASE={BASE} onDayClick={handleDayClick} activeDrillDate={drillDate} />

        {drillDate && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", animation: "legend-slide-in 0.25s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
              <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>
                {new Date(drillDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <button onClick={() => { setDrillDate(null); setDrillHourly(null); }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
            {drillLoading
              ? <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontSize: 13 }}>Loading…</div>
              : drillHourly ? <HourlyBar data={drillHourly} peakHour={drillPeak} /> : null
            }
          </div>
        )}
      </SectionCard>

      {/* Session timeline */}
      <SectionCard title="Session Timeline">
        <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 12 }}>
          Each block = a continuous app session · hover for details
        </div>
        <SessionTimeline BASE={BASE} date={selectedDate} />
      </SectionCard>
    </div>
  );
}

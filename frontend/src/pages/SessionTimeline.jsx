import { useState, useEffect, useRef } from "react";
import { CATEGORY_COLORS } from "../shared/constants";
import { fmtTime } from "../shared/utils";
import { SectionCard } from "../shared/components";

// ─── SESSION TIMELINE ─────────────────────────────────────────────────────────
// Self-contained session timeline for one day.
//
// Props:
//   BASE – API base URL
//   date – ISO date string, e.g. "2024-01-15"
function Timeline({ BASE, date }) {
  const [catBlocks, setCatBlocks]     = useState({});
  const [allCats, setAllCats]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [hovBlock, setHovBlock]       = useState(null);
  const [activeHours, setActiveHours] = useState([]);
  const [dayStart, setDayStart]       = useState(0);
  const [dayEnd, setDayEnd]           = useState(1440);
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
            currentBlock.keys   += row.keys;
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

  const jumps = [];
  for (let i = 1; i < activeHours.length; i++) {
    if (activeHours[i] !== activeHours[i - 1] + 1) jumps.push(activeHours[i]);
  }

  const LABEL_W = 120;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Tooltip */}
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
              position: "absolute", bottom: -6, left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
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
          {activeHours.map(h => (
            <div key={h} style={{ position: "absolute", left: `${toX(h * 60)}%`, top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 1, height: 7, background: "rgba(255, 255, 255, 0.12)" }} />
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", fontWeight: 500 }}>{fmtMin(h * 60)}</span>
            </div>
          ))}
          {activeHours.length > 0 && (
            <div style={{ position: "absolute", left: "100%", top: 0, display: "flex", flexDirection: "column", alignItems: "center", transform: "translateX(-100%)" }}>
              <div style={{ width: 1, height: 7, background: "rgba(255, 255, 255, 0.12)" }} />
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", fontWeight: 500 }}>
                {fmtMin((activeHours[activeHours.length - 1] + 1) * 60)}
              </span>
            </div>
          )}
          {/* Jump markers */}
          {jumps.map(h => (
            <div key={h} style={{
              position: "absolute", left: `${toX(h * 60)}%`, top: 0,
              bottom: -((allCats.length * 36) + 10),
              width: 1, borderLeft: "1px dashed rgba(255,255,255,0.08)",
              zIndex: 0, pointerEvents: "none",
            }} />
          ))}
        </div>
      </div>

      {/* Category rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {allCats.map(cat => {
          const col = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
          const blocks = catBlocks[cat] || [];
          const emoji = {
            productive: "💼", communication: "💬", entertainment: "🎮",
            system: "⚙️", neutral: "🌐", social: "📣", other: "📦",
          }[cat] || "•";
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
                      onMouseEnter={e => {
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

// ─── SESSION TIMELINE CARD ────────────────────────────────────────────────────
export default function SessionTimeline({ BASE, date }) {
  return (
    <SectionCard title="Session Timeline">
      <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 12 }}>
        Each block = a continuous app session · hover for details
      </div>
      <Timeline BASE={BASE} date={date} />
    </SectionCard>
  );
}

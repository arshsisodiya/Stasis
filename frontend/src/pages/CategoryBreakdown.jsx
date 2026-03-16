import { useState, useRef } from "react";
import { CATEGORY_COLORS } from "../shared/constants";
import { fmtTime } from "../shared/utils";
import { DONUT_CSS } from "../shared/components";

const EMOJI = {
  productive: "💼",
  communication: "💬",
  entertainment: "🎮",
  system: "⚙️",
  neutral: "🌐",
  social: "📣",
  other: "📦",
};

const TOP_N = 3;

// ─── APP TOOLTIP (absolutely positioned — zero layout shift) ──────────────────
function AppTooltip({ apps, col, topOffset }) {
  if (!apps.length) return null;
  return (
    <div style={{
      position: "absolute",
      right: 0,
      top: topOffset,
      zIndex: 40,
      pointerEvents: "none",
      width: 220,
      background: "rgba(8,11,22,0.97)",
      border: `1px solid ${col.primary}30`,
      borderRadius: 12,
      boxShadow: `0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px ${col.primary}12`,
      padding: "10px 13px",
      animation: "center-fade-in 0.16s cubic-bezier(0.34,1.56,0.64,1) both",
    }}>
      <div style={{
        fontSize: 9, color: col.primary, fontWeight: 700,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 9,
      }}>
        Top Apps
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {apps.slice(0, 5).map((a, i) => {
          const maxActive = apps[0]?.active || 1;
          const pct = Math.round((a.active / maxActive) * 100);
          const rankColor = i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : "#64748b";
          return (
            <div key={a.app} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, width: 10, color: rankColor, flexShrink: 0 }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{
                    fontSize: 11, color: "#cbd5e1", fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120,
                  }}>
                    {a.app.replace(".exe", "")}
                  </span>
                  <span style={{ fontSize: 10, color: "#475569", flexShrink: 0, marginLeft: 6 }}>
                    {fmtTime(a.active)}
                  </span>
                </div>
                <div style={{ height: 2, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    background: col.grad || col.primary,
                    width: `${pct}%`,
                    boxShadow: `0 0 5px ${col.primary}55`,
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DONUT SVG ────────────────────────────────────────────────────────────────
function DonutSVG({ segments, total, hovered, onSegEnter, onLeave }) {
  const size = 220, stroke = 26, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const GAP = 2.5;

  let offset = 0;
  const segs = segments.map(({ cat, secs, pct }) => {
    const dash = Math.max(pct * circ - GAP, 0);
    const s = { cat, secs, pct, offset, dash };
    offset += pct * circ;
    return s;
  });

  const active = hovered ? segs.find(s => s.cat === hovered) : null;
  const activeCol = active ? (CATEGORY_COLORS[active.cat] || CATEGORY_COLORS.other) : null;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size} height={size}
        style={{ transform: "rotate(-90deg)", overflow: "visible" }}
        onMouseLeave={onLeave}
      >
        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
        {segs.map((seg) => {
          const col = CATEGORY_COLORS[seg.cat] || CATEGORY_COLORS.other;
          const isHov = hovered === seg.cat;
          const isDim = hovered && !isHov;
          return (
            <circle key={seg.cat}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={col.primary}
              strokeWidth={isHov ? stroke + 5 : stroke}
              strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="round"
              className={`donut-seg${isHov ? " hov" : isDim ? " dimmed" : ""}`}
              onMouseEnter={() => onSegEnter(seg.cat)}
              style={{
                filter: isHov
                  ? `drop-shadow(0 0 10px ${col.primary}aa)`
                  : "none",
                cursor: "pointer",
                transition: "stroke-width 0.18s ease, filter 0.18s ease, opacity 0.18s ease",
              }}
            />
          );
        })}
      </svg>

      {/* Center label */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", pointerEvents: "none",
      }}>
        {active ? (
          <div key={active.cat} style={{ textAlign: "center", animation: "center-fade-in 0.18s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <div style={{ fontSize: 18, marginBottom: 1 }}>{EMOJI[active.cat] || "•"}</div>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: "0.15em",
              textTransform: "uppercase", color: activeCol.primary, marginBottom: 2,
            }}>{active.cat}</div>
            <div style={{
              fontSize: 30, fontWeight: 700, color: "#f8fafc",
              fontFamily: "'DM Serif Display',serif", lineHeight: 1,
            }}>
              {Math.round(active.pct * 100)}<span style={{ fontSize: 14, color: activeCol.primary }}>%</span>
            </div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>{fmtTime(active.secs)}</div>
          </div>
        ) : (
          <div key="total" style={{ textAlign: "center", animation: "center-fade-in 0.18s ease both" }}>
            <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 }}>
              Total
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: "#f8fafc",
              fontFamily: "'DM Serif Display',serif", lineHeight: 1,
            }}>{fmtTime(total)}</div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 5 }}>{segs.length} categories</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LEGEND ROW ───────────────────────────────────────────────────────────────
// Fixed height — app chips are rendered in a separate absolutely-positioned
// tooltip, so this row's height NEVER changes on hover.
function LegendRow({ seg, isHov, isDim, onEnter, onLeave, animDelay }) {
  const col = CATEGORY_COLORS[seg.cat] || CATEGORY_COLORS.other;
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 11px", borderRadius: 10, cursor: "pointer",
        // Height is always fixed — no children expand on hover
        background: isHov ? `${col.primary}10` : "transparent",
        border: `1px solid ${isHov ? col.primary + "38" : "rgba(255,255,255,0.04)"}`,
        boxShadow: isHov ? `0 2px 14px ${col.primary}16` : "none",
        opacity: isDim ? 0.3 : 1,
        transition: "background 0.15s, border-color 0.15s, opacity 0.15s, box-shadow 0.15s",
        animation: `legend-slide-in 0.28s cubic-bezier(0.34,1.56,0.64,1) ${animDelay}s both`,
      }}
    >
      {/* Swatch */}
      <div style={{
        width: 9, height: 9, borderRadius: 3, flexShrink: 0,
        background: col.grad || col.primary,
        boxShadow: isHov ? `0 0 10px ${col.primary}` : `0 0 4px ${col.primary}44`,
        transition: "box-shadow 0.15s",
      }} />

      {/* Emoji + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, width: 110, flexShrink: 0 }}>
        <span style={{ fontSize: 11 }}>{EMOJI[seg.cat] || "•"}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, textTransform: "capitalize",
          color: isHov ? col.primary : "#94a3b8",
          transition: "color 0.15s",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{seg.cat}</span>
      </div>

      {/* Bar */}
      <div style={{ flex: 1, height: 3, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 4,
          width: `${Math.round(seg.pct * 100)}%`,
          background: col.grad || col.primary,
          boxShadow: isHov ? `0 0 8px ${col.primary}77` : "none",
          transition: "width 1s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s",
        }} />
      </div>

      {/* Pct + time */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, width: 52 }}>
        <span style={{
          fontSize: 13, fontWeight: 700, fontFamily: "'DM Serif Display',serif",
          color: isHov ? col.primary : "#64748b",
          transition: "color 0.15s", lineHeight: 1,
        }}>{Math.round(seg.pct * 100)}%</span>
        <span style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{fmtTime(seg.secs)}</span>
      </div>

      {/* Chevron */}
      <div style={{
        fontSize: 11, color: col.primary,
        opacity: isHov ? 0.6 : 0,
        transition: "opacity 0.15s",
        flexShrink: 0,
      }}>›</div>
    </div>
  );
}

// ─── FULL COMPONENT ───────────────────────────────────────────────────────────
function DonutBreakdown({ data, total, appsByCategory }) {
  const [hovered, setHovered] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [tipTop, setTipTop] = useState(0);
  const listRef = useRef(null);
  const clearTimer = useRef(null);

  const setHov = (cat, rowEl) => {
    clearTimeout(clearTimer.current);
    setHovered(cat);
    if (rowEl && listRef.current) {
      const rr = rowEl.getBoundingClientRect();
      const lr = listRef.current.getBoundingClientRect();
      // centre the tooltip on the hovered row, shifted right to avoid overlap
      setTipTop(rr.top - lr.top - 4);
    }
  };
  const clearHov = () => {
    clearTimer.current = setTimeout(() => setHovered(null), 130);
  };

  // Filter out sub-minute categories (true zeros)
  const segments = Object.entries(data)
    .filter(([, secs]) => secs >= 60)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, secs]) => ({ cat, secs, pct: total > 0 ? secs / total : 0 }));

  const visibleSegs = showAll ? segments : segments.slice(0, TOP_N);
  const hiddenCount = segments.length - TOP_N;
  const hasHidden = hiddenCount > 0;

  const hovCol = hovered ? (CATEGORY_COLORS[hovered] || CATEGORY_COLORS.other) : null;
  const hovApps = hovered
    ? (appsByCategory[hovered] || []).slice().sort((a, b) => b.active - a.active)
    : [];

  return (
    <>
      <style>{DONUT_CSS}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>

        {/* Donut chart */}
        <DonutSVG
          segments={segments}
          total={total}
          hovered={hovered}
          onSegEnter={cat => {
            clearTimeout(clearTimer.current);
            setHovered(cat);
          }}
          onLeave={clearHov}
        />

        {/* Legend — right column */}
        <div style={{ flex: 1, minWidth: 230, display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Relative wrapper so tooltip anchors here without shifting anything */}
          <div ref={listRef} style={{ position: "relative" }}>

            {/* Rows — stable heights, no content expansion */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {visibleSegs.map((seg, i) => (
                <LegendRow
                  key={seg.cat}
                  seg={seg}
                  isHov={hovered === seg.cat}
                  isDim={!!(hovered && hovered !== seg.cat)}
                  animDelay={i * 0.05}
                  onEnter={e => setHov(seg.cat, e.currentTarget)}
                  onLeave={clearHov}
                />
              ))}
            </div>

            {/* Floating app tooltip — absolutely positioned, no layout impact */}
            {hovered && hovApps.length > 0 && hovCol && (
              <AppTooltip apps={hovApps} col={hovCol} topOffset={tipTop} />
            )}
          </div>

          {/* Show more / less */}
          {hasHidden && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                marginTop: 10, alignSelf: "flex-start",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8, padding: "5px 14px",
                cursor: "pointer", color: "#475569",
                fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                transition: "border-color 0.2s, color 0.2s, background 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
                e.currentTarget.style.color = "#94a3b8";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                e.currentTarget.style.color = "#475569";
                e.currentTarget.style.background = "transparent";
              }}
            >
              {showAll
                ? <><span style={{ fontSize: 10 }}>↑</span> Show less</>
                : <><span style={{ fontSize: 12, color: "#64748b" }}>+{hiddenCount}</span>&nbsp;more {hiddenCount === 1 ? "category" : "categories"}</>
              }
            </button>
          )}
        </div>

      </div>
    </>
  );
}

// ─── CATEGORY BREAKDOWN ───────────────────────────────────────────────────────
// Props:
//   stats – array of app stat rows: { app: string, main: string, active: number }
export default function CategoryBreakdown({ stats }) {
  const cats = stats.reduce((a, s) => {
    a[s.main] = (a[s.main] || 0) + s.active;
    return a;
  }, {});

  const appsByCategory = stats.reduce((a, s) => {
    if (!a[s.main]) a[s.main] = [];
    a[s.main].push(s);
    return a;
  }, {});

  const totA = Object.values(cats).reduce((a, b) => a + b, 0);

  return <DonutBreakdown data={cats} total={totA} appsByCategory={appsByCategory} />;
}
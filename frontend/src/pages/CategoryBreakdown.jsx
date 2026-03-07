import { useState } from "react";
import { CATEGORY_COLORS } from "../shared/constants";
import { fmtTime } from "../shared/utils";
import { DONUT_CSS } from "../shared/components";

// ─── DONUT CHART ──────────────────────────────────────────────────────────────
function DonutChart({ data, total, appsByCategory }) {
  const [hovered, setHovered] = useState(null);
  const clearTimer = { current: null };

  const setHov = (cat) => {
    clearTimeout(clearTimer.current);
    setHovered(cat);
  };
  const clearHov = () => {
    clearTimer.current = setTimeout(() => setHovered(null), 80);
  };

  const size = 200, stroke = 30, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  const GAP = 3;
  const MIN_SECS = 60;
  const segments = Object.entries(data)
    .filter(([, secs]) => secs >= MIN_SECS)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, secs]) => {
      const pct = total > 0 ? secs / total : 0;
      const dash = Math.max(pct * circ - GAP, 0);
      const seg = { cat, secs, pct, offset, dash };
      offset += pct * circ;
      return seg;
    });

  const active = hovered ? segments.find(s => s.cat === hovered) : null;
  const activeCol = active ? (CATEGORY_COLORS[active.cat] || CATEGORY_COLORS.other) : null;

  return (
    <>
      <style>{DONUT_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 36, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <svg
            width={size} height={size}
            style={{ transform: "rotate(-90deg)", overflow: "visible" }}
            onMouseLeave={clearHov}
          >
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="rgba(255, 255, 255, 0.04)" strokeWidth={stroke} />
            {segments.map((seg) => {
              const col = CATEGORY_COLORS[seg.cat] || CATEGORY_COLORS.other;
              const isHov = hovered === seg.cat;
              const isDim = hovered && !isHov;
              return (
                <circle key={seg.cat}
                  cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke={col.primary}
                  strokeWidth={isHov ? stroke + 6 : stroke}
                  strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
                  strokeDashoffset={-seg.offset}
                  strokeLinecap="round"
                  className={`donut-seg${isHov ? " hov" : isDim ? " dimmed" : ""}`}
                  onMouseEnter={() => setHov(seg.cat)}
                  style={{
                    filter: isHov
                      ? `drop-shadow(0 0 10px ${col.primary}) drop-shadow(0 0 20px ${col.primary}66)`
                      : "none",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none"
          }}>
            {active ? (
              <div key={active.cat} style={{ textAlign: "center", animation: "center-fade-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: activeCol.primary, marginBottom: 3
                }}>{active.cat}</div>
                <div style={{
                  fontSize: 26, fontWeight: 700, color: "#f8fafc",
                  fontFamily: "'DM Serif Display',serif", lineHeight: 1
                }}>{Math.round(active.pct * 100)}%</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{fmtTime(active.secs)}</div>
              </div>
            ) : (
              <div key="total" style={{ textAlign: "center", animation: "center-fade-in 0.22s ease both" }}>
                <div style={{ fontSize: 10, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Total</div>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: "#f8fafc",
                  fontFamily: "'DM Serif Display',serif", lineHeight: 1
                }}>{fmtTime(total)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 170 }}>
          {segments.map((seg, i) => {
            const col = CATEGORY_COLORS[seg.cat] || CATEGORY_COLORS.other;
            const apps = appsByCategory[seg.cat] || [];
            const isHov = hovered === seg.cat;
            const isDim = hovered && !isHov;
            return (
              <div key={seg.cat}
                className="cat-row"
                onMouseEnter={() => setHov(seg.cat)}
                onMouseLeave={clearHov}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "9px 12px", borderRadius: 12, cursor: "pointer",
                  background: isHov ? col.bg : `${col.primary}08`,
                  border: `1px solid ${isHov ? col.primary + "50" : col.primary + "1a"}`,
                  boxShadow: isHov ? `0 4px 16px ${col.primary}20, inset 0 0 0 1px ${col.primary}28` : "none",
                  opacity: isDim ? 0.45 : 1,
                  animation: `legend-slide-in 0.32s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.06}s both`,
                }}>
                <div className="cat-swatch" style={{
                  width: 11, height: 11, borderRadius: 4, flexShrink: 0,
                  background: col.grad || col.primary,
                  boxShadow: isHov ? `0 0 12px ${col.primary}` : `0 0 5px ${col.primary}55`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="cat-label" style={{
                      fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                      color: isHov ? col.primary : `${col.primary}dd`,
                    }}>{seg.cat}</span>
                    <span className="cat-pct" style={{
                      fontSize: 13, fontWeight: 700, fontFamily: "'DM Serif Display',serif",
                      color: isHov ? col.primary : `${col.primary}aa`,
                    }}>{Math.round(seg.pct * 100)}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", marginTop: 5, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4, width: `${Math.round(seg.pct * 100)}%`,
                      background: col.grad || col.primary,
                      boxShadow: `0 0 6px ${col.primary}66`,
                      transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1)",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>{fmtTime(seg.secs)}</div>
                  {isHov && apps.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {apps.slice(0, 4).map((a, ci) => (
                        <span key={a.app} style={{
                          fontSize: 10, background: `${col.primary}14`, borderRadius: 5,
                          padding: "2px 8px", border: `1px solid ${col.primary}28`,
                          color: `${col.primary}cc`,
                          animation: `chip-pop-in 0.18s cubic-bezier(0.34,1.56,0.64,1) ${ci * 0.04}s both`,
                        }}>
                          {a.app.replace(".exe", "")} · {fmtTime(a.active)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── CATEGORY BREAKDOWN ───────────────────────────────────────────────────────
// Props:
//   stats – array of app stat rows with { app, main, active } shape
export default function CategoryBreakdown({ stats }) {
  const cats = stats.reduce((a, s) => { a[s.main] = (a[s.main] || 0) + s.active; return a; }, {});
  const appsByCategory = stats.reduce((a, s) => { if (!a[s.main]) a[s.main] = []; a[s.main].push(s); return a; }, {});
  const totA = Object.values(cats).reduce((a, b) => a + b, 0);

  return <DonutChart data={cats} total={totA} appsByCategory={appsByCategory} />;
}

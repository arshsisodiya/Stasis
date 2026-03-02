import { useState } from "react";
import { CATEGORY_COLORS } from "../shared/constants";
import { fmtTime, fmtTimeLong, trendPct } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import {
  SectionCard,
  RadialProgress,
  TrendBadge,
  AppIcon,
  HourlyBar,
  DONUT_CSS,
} from "../shared/components";

// ─── DONUT CHART ─────────────────────────────────────────────────────────────
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
          <svg width={size} height={size}
            style={{ transform: "rotate(-90deg)", overflow: "visible" }}
            onMouseLeave={clearHov}>
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
                  }} />
              );
            })}
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none"
          }}>
            {active ? (
              <div key={active.cat}
                style={{ textAlign: "center", animation: "center-fade-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: activeCol.primary, marginBottom: 3
                }}>{active.cat}</div>
                <div style={{
                  fontSize: 26, fontWeight: 700, color: "#f8fafc",
                  fontFamily: "'DM Serif Display',serif", lineHeight: 1
                }}>{Math.round(active.pct * 100)}%</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{fmtTime(active.secs)}</div>
              </div>
            ) : (
              <div key="total"
                style={{ textAlign: "center", animation: "center-fade-in 0.22s ease both" }}>
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

// ─── LIMIT WARNING BANNER ─────────────────────────────────────────────────────
export function LimitWarningBanner({ limits, usage, onGoToLimits }) {
  const blocked = limits.filter(l => (usage[l.app_name] || 0) >= l.daily_limit_seconds && l.is_enabled);
  const warning = limits.filter(l => {
    const u = usage[l.app_name] || 0;
    return u >= l.daily_limit_seconds * 0.8 && u < l.daily_limit_seconds && l.is_enabled;
  });
  if (!blocked.length && !warning.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
      {blocked.map(l => (
        <div key={l.app_name} onClick={onGoToLimits}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 18px", borderRadius: 14, cursor: "pointer",
            background: "rgba(248,113,133,0.08)", border: "1px solid rgba(248,113,133,0.3)",
            animation: "banner-in 0.4s ease"
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>⛔</span>
            <div>
              <span style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>
                {l.app_name.replace(".exe", "")} blocked
              </span>
              <span style={{ fontSize: 12, color: "#475569", marginLeft: 8 }}>
                — daily limit of {fmtTime(l.daily_limit_seconds)} reached
              </span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: "#f87171", opacity: 0.7 }}>Manage →</span>
        </div>
      ))}
      {warning.map(l => {
        const u = usage[l.app_name] || 0, pct = Math.round((u / l.daily_limit_seconds) * 100);
        return (
          <div key={l.app_name} onClick={onGoToLimits}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 18px", borderRadius: 14, cursor: "pointer",
              background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)",
              animation: "banner-in 0.4s ease"
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>
                  {l.app_name.replace(".exe", "")}
                </span>
                <span style={{ fontSize: 12, color: "#475569", marginLeft: 8 }}>
                  — {pct}% of {fmtTime(l.daily_limit_seconds)} limit used ({fmtTime(u)} so far)
                </span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#fbbf24", opacity: 0.7 }}>Manage →</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
export default function OverviewPage({
  data,
  stats,
  prevStats,
  limits,
  hourly,
  peakHour,
  countKey,
  selectedDate,
  onGoToLimits,
}) {
  const prevData = prevStats.reduce((a, s) => {
    a.totalKeystrokes = (a.totalKeystrokes || 0) + s.keystrokes;
    a.totalClicks = (a.totalClicks || 0) + s.clicks;
    return a;
  }, {});

  const cats = stats.reduce((a, s) => { a[s.main] = (a[s.main] || 0) + s.active; return a; }, {});
  const appsByCategory = stats.reduce((a, s) => { if (!a[s.main]) a[s.main] = []; a[s.main].push(s); return a; }, {});
  const totA = Object.values(cats).reduce((a, b) => a + b, 0);
  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});

  const sH = useCountUp(Math.floor((data?.totalScreenTime || 0) / 3600), 1400, countKey);
  const sM = useCountUp(Math.floor(((data?.totalScreenTime || 0) % 3600) / 60), 1200, countKey);
  const kC = useCountUp(data?.totalKeystrokes || 0, 1600, countKey);
  const clC = useCountUp(data?.totalClicks || 0, 1600, countKey);

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Limit warnings */}
      <LimitWarningBanner limits={limits} usage={usage} onGoToLimits={onGoToLimits} />

      {/* Metric cards */}
      <div key={selectedDate} className="grid-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>

        {/* Screen Time */}
        <SectionCard className="metric-card" style={{ borderLeft: "3px solid #4ade80", background: "linear-gradient(135deg,rgba(74,222,128,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "0ms" }}>
          <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16, fontWeight: 600 }}>Screen Time</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 52, fontWeight: 400, lineHeight: 1, color: "#f8fafc" }}>
            {sH}<span style={{ fontSize: 24, color: "#475569" }}>h </span>
            {sM}<span style={{ fontSize: 24, color: "#475569" }}>m</span>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <div style={{ flex: 1, background: "rgba(74,222,128,0.08)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase" }}>Active</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f8fafc", marginTop: 2 }}>{fmtTime(data.totalScreenTime - data.totalIdleTime)}</div>
            </div>
            <div style={{ flex: 1, background: "rgba(148,163,184,0.06)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Idle</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginTop: 2 }}>{fmtTime(data.totalIdleTime)}</div>
            </div>
          </div>
        </SectionCard>

        {/* Productivity */}
        <SectionCard className="metric-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, borderLeft: "3px solid #4ade80", background: "linear-gradient(135deg,rgba(74,222,128,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "60ms" }}>
          <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 }}>Productivity</div>
          <RadialProgress value={data.productivityPercent} size={150} stroke={12} color="#4ade80" sublabel="%" />
          <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>of active time on<br />productive work</div>
        </SectionCard>

        {/* Focus */}
        <SectionCard className="metric-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, borderLeft: "3px solid #60a5fa", background: "linear-gradient(135deg,rgba(96,165,250,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "120ms" }}>
          <div style={{ fontSize: 11, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 }}>Focus</div>
          <RadialProgress value={data.focusScore ?? 0} size={150} stroke={12} color="#60a5fa" sublabel="%" />
          <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
            {data.deepWorkSeconds
              ? <><span>deep work</span><br /><span style={{ color: "#475569", fontWeight: 600 }}>{fmtTimeLong(data.deepWorkSeconds)}</span></>
              : "of time in deep focus"}
          </div>
        </SectionCard>

        {/* Input Activity */}
        <SectionCard className="metric-card" style={{ borderLeft: "3px solid #a78bfa", background: "linear-gradient(135deg,rgba(167,139,250,0.04) 0%,rgba(15,18,34,0.7) 60%)", minHeight: 190, animationDelay: "180ms" }}>
          <div style={{ fontSize: 11, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16, fontWeight: 600 }}>Input Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>⌨️ Keystrokes</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendBadge pct={trendPct(data.totalKeystrokes, prevData.totalKeystrokes)} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{kC.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)" }}>
                <div style={{
                  height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4ade80,#22d3ee)",
                  width: `${Math.min(100, (data.totalKeystrokes / 20000) * 100)}%`, transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1)"
                }} />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>🖱️ Clicks</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendBadge pct={trendPct(data.totalClicks, prevData.totalClicks)} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{clC.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)" }}>
                <div style={{
                  height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#60a5fa,#a78bfa)",
                  width: `${Math.min(100, (data.totalClicks / 8000) * 100)}%`, transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1) 0.2s"
                }} />
              </div>
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 2 }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Most used app</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AppIcon appName={data.mostUsedApp} category={stats.find(s => s.app === data.mostUsedApp)?.main || "other"} size={28} />
                <span style={{ fontSize: 14, fontWeight: 500, color: "#f8fafc" }}>{data.mostUsedApp.replace(".exe", "")}</span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Hourly + Peak callout */}
      <SectionCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Hourly Activity Pattern
          </div>
          {hourly[peakHour] > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "5px 12px"
            }}>
              <span style={{ fontSize: 12 }}>⭐</span>
              <span style={{ fontSize: 12, color: "#fbbf24" }}>
                Peak hour: {peakHour === 0 ? "12 AM" : peakHour === 12 ? "12 PM" : peakHour < 12 ? `${peakHour} AM` : `${peakHour - 12} PM`}
                &nbsp;·&nbsp;{hourly[peakHour]}m active
              </span>
            </div>
          )}
        </div>
        <HourlyBar data={hourly} peakHour={peakHour} />
      </SectionCard>

      {/* Donut category breakdown */}
      <SectionCard title="Category Breakdown">
        <DonutChart data={cats} total={totA} appsByCategory={appsByCategory} />
      </SectionCard>
    </div>
  );
}

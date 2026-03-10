import { useState } from "react";
import { fmtTime } from "../shared/utils";
import { localYMD } from "../shared/utils";
import { SectionCard } from "../shared/components";

import ScreenTimeCard from "./ScreenTimeCard";
import ProductivityCard from "./ProductivityCard";
import FocusCard from "./FocusCard";
import InputActivityCard from "./InputActivityCard";
import HourlyActivityPattern from "./HourlyActivityPattern";
import CategoryBreakdown from "./CategoryBreakdown";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt12h(h) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Find the best contiguous 2-hour block in the hourly array
function findBestWindow(hourly) {
  if (!hourly || hourly.length < 2) return null;
  let best = 0, bestStart = 0;
  for (let i = 0; i < hourly.length - 1; i++) {
    const sum = hourly[i] + hourly[i + 1];
    if (sum > best) { best = sum; bestStart = i; }
  }
  if (best === 0) return null;
  return { start: bestStart, end: bestStart + 1, score: best };
}

// ─── LIMIT WARNING BANNER ────────────────────────────────────────────────────
export function LimitWarningBanner({ limits, usage, onGoToLimits, selectedDate }) {
  const today = localYMD();
  if (selectedDate !== today) return null;

  const blocked = limits.filter(l => (usage[l.app_name] || 0) >= l.daily_limit_seconds && l.is_enabled);
  const warning = limits.filter(l => {
    const u = usage[l.app_name] || 0;
    return u >= l.daily_limit_seconds * 0.8 && u < l.daily_limit_seconds && l.is_enabled;
  });
  if (!blocked.length && !warning.length) return null;

  const totalIssues = blocked.length + warning.length;

  // Single item — slim pill
  if (totalIssues === 1) {
    const isBlocked = blocked.length === 1;
    const item = isBlocked ? blocked[0] : warning[0];
    const u = usage[item.app_name] || 0;
    const pct = Math.round((u / item.daily_limit_seconds) * 100);
    const accent = isBlocked ? "#f87171" : "#fbbf24";
    const bg = isBlocked ? "rgba(248,113,133,0.07)" : "rgba(251,191,36,0.06)";
    const border = isBlocked ? "rgba(248,113,133,0.2)" : "rgba(251,191,36,0.18)";
    return (
      <div onClick={onGoToLimits} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
        borderRadius: 12, cursor: "pointer", background: bg, border: `1px solid ${border}`,
        marginBottom: 4, animation: "banner-in 0.35s ease", transition: "background 0.2s",
      }}
        onMouseEnter={e => e.currentTarget.style.background = isBlocked ? "rgba(248,113,133,0.12)" : "rgba(251,191,36,0.1)"}
        onMouseLeave={e => e.currentTarget.style.background = bg}>
        <span style={{ fontSize: 13 }}>{isBlocked ? "⛔" : "⚠️"}</span>
        <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>{item.app_name.replace(".exe", "")}</span>
        <span style={{ fontSize: 12, color: "#475569" }}>
          {isBlocked ? `blocked — limit of ${fmtTime(item.daily_limit_seconds)} reached` : `${pct}% of ${fmtTime(item.daily_limit_seconds)} limit used`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: accent, opacity: 0.6 }}>Manage →</span>
      </div>
    );
  }

  // Multiple — one unified bar with pills
  const primary = blocked.length ? "#f87171" : "#fbbf24";
  const bg2 = blocked.length ? "rgba(248,113,133,0.07)" : "rgba(251,191,36,0.06)";
  const border2 = blocked.length ? "rgba(248,113,133,0.2)" : "rgba(251,191,36,0.18)";
  return (
    <div onClick={onGoToLimits} style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "8px 14px", borderRadius: 12, cursor: "pointer",
      background: bg2, border: `1px solid ${border2}`,
      marginBottom: 4, animation: "banner-in 0.35s ease", transition: "background 0.2s",
    }}
      onMouseEnter={e => e.currentTarget.style.background = blocked.length ? "rgba(248,113,133,0.12)" : "rgba(251,191,36,0.1)"}
      onMouseLeave={e => e.currentTarget.style.background = bg2}>
      <span style={{ fontSize: 13 }}>{blocked.length ? "⛔" : "⚠️"}</span>
      <span style={{ fontSize: 12, color: primary, fontWeight: 600, whiteSpace: "nowrap" }}>
        {blocked.length && warning.length
          ? `${blocked.length} blocked · ${warning.length} near limit`
          : blocked.length
            ? `${blocked.length} app${blocked.length > 1 ? "s" : ""} blocked`
            : `${warning.length} app${warning.length > 1 ? "s" : ""} near limit`}
      </span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
        {blocked.map(l => (
          <span key={l.app_name} style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,133,0.12)", border: "1px solid rgba(248,113,133,0.22)", borderRadius: 6, padding: "2px 8px", fontWeight: 500, whiteSpace: "nowrap" }}>
            {l.app_name.replace(".exe", "")}
          </span>
        ))}
        {warning.map(l => {
          const u = usage[l.app_name] || 0;
          const pct = Math.round((u / l.daily_limit_seconds) * 100);
          return (
            <span key={l.app_name} style={{ fontSize: 11, color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 6, padding: "2px 8px", fontWeight: 500, whiteSpace: "nowrap" }}>
              {l.app_name.replace(".exe", "")} {pct}%
            </span>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: primary, opacity: 0.6, whiteSpace: "nowrap" }}>Manage →</span>
    </div>
  );
}

// ─── HISTORICAL VIEW BANNER ──────────────────────────────────────────────────
function HistoricalBanner({ selectedDate, onGoToday }) {
  const today = localYMD();
  if (selectedDate === today) return null;
  const sel = new Date(selectedDate + "T12:00:00");
  const diffDays = Math.round((new Date(today + "T12:00:00") - sel) / 86400000);
  const label = sel.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const ago = diffDays === 1 ? "yesterday" : `${diffDays} days ago`;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
      borderRadius: 10, marginBottom: 4,
      background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
      animation: "banner-in 0.35s ease",
    }}>
      <span style={{ fontSize: 12 }}>📅</span>
      <span style={{ fontSize: 12, color: "#818cf8", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: "#2d3d52" }}>·</span>
      <span style={{ fontSize: 11, color: "#475569" }}>{ago}</span>
      <button onClick={onGoToday} style={{
        marginLeft: "auto", fontSize: 11, color: "#818cf8", background: "none",
        border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans',sans-serif",
        opacity: 0.65, transition: "opacity 0.15s",
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = "1"}
        onMouseLeave={e => e.currentTarget.style.opacity = "0.65"}>
        Back to today →
      </button>
    </div>
  );
}

// ─── SECTION EMPTY STATE ─────────────────────────────────────────────────────
function SectionEmpty({ icon = "📊", message = "No data for this period" }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 24px", gap: 10,
    }}>
      <div style={{ fontSize: 28, opacity: 0.25 }}>{icon}</div>
      <p style={{ fontSize: 12, color: "#334155", textAlign: "center", margin: 0 }}>{message}</p>
    </div>
  );
}

// ─── BEST TIME TO WORK INSIGHT ───────────────────────────────────────────────
function BestTimeInsight({ hourly, peakHour }) {
  const window = findBestWindow(hourly);
  const allZero = !hourly || hourly.every(v => v === 0);
  if (allZero || !window) return null;

  const start = fmt12h(window.start);
  const end = fmt12h(window.end + 1);
  const peak = fmt12h(peakHour);

  // Contextual label
  const hour = window.start;
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const label = `Your sharpest window is ${start}–${end}`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      marginTop: 14, padding: "10px 14px",
      background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.1)",
      borderRadius: 10, animation: "banner-in 0.4s ease 0.2s both",
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>🎯</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "#334155", marginLeft: 8 }}>
          · peak activity at {peak}
        </span>
      </div>
      {/* Mini bar strip showing the peak window */}
      <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", flexShrink: 0 }}>
        {[window.start - 1, window.start, window.end, window.end + 1].map((h, idx) => {
          if (h < 0 || h >= hourly.length) return <div key={idx} style={{ width: 5, height: 10, borderRadius: 2, background: "rgba(255,255,255,0.05)" }} />;
          const isActive = h === window.start || h === window.end;
          const v = hourly[h];
          const max = Math.max(...hourly, 1);
          const heightPx = 4 + (v / max) * 18;
          return (
            <div key={idx} style={{
              width: 5, height: heightPx, borderRadius: 2, transition: "height 0.3s",
              background: isActive ? "#4ade80" : "rgba(74,222,128,0.2)",
            }} />
          );
        })}
      </div>
    </div>
  );
}


// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
export default function OverviewPage({
  data,
  stats,
  prevStats,
  prevWellbeing,
  showComparison,
  limits,
  hourly,
  peakHour,
  countKey,
  selectedDate,
  onGoToLimits,
  onGoToday,
  sparkSeries,
  BASE,
}) {
  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});
  const isAllEmpty = !data || (data.totalScreenTime === 0 && !stats.length);

  if (!data) return null;

  const cardProps = { prevWellbeing, showComparison, countKey };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Historical banner */}
      <HistoricalBanner selectedDate={selectedDate} onGoToday={onGoToday} />

      {/* Limit warnings */}
      <LimitWarningBanner limits={limits} usage={usage} onGoToLimits={onGoToLimits} selectedDate={selectedDate} />

      {/* ── Metric cards — staggered entrance, 20px gap ── */}
      <div
        key={selectedDate}
        className="grid-4"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20, alignItems: "stretch" }}
      >
        {/* Each card gets staggered delay + matching sparkline */}
        <div className="metric-card" style={{ animationDelay: "0ms", display: "flex", flexDirection: "column" }}>
          <ScreenTimeCard data={data} {...cardProps} sparkValues={sparkSeries?.screenTime} />
        </div>

        <div className="metric-card" style={{ animationDelay: "55ms", display: "flex", flexDirection: "column" }}>
          <ProductivityCard data={data} {...cardProps} sparkValues={sparkSeries?.productivity} />
        </div>

        <div className="metric-card" style={{ animationDelay: "110ms", display: "flex", flexDirection: "column" }}>
          <FocusCard data={data} {...cardProps} sparkValues={sparkSeries?.focus} />
        </div>

        <div className="metric-card" style={{ animationDelay: "165ms", display: "flex", flexDirection: "column" }}>
          <InputActivityCard data={data} stats={stats} countKey={countKey} sparkValues={sparkSeries?.inputActivity} />
        </div>
      </div>

      {/* ── Hourly activity ── */}
      <div style={{
        background: "rgba(15,18,30,0.5)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20, padding: "20px 20px 16px", marginBottom: 16,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>Hourly Activity</span>
            {peakHour !== undefined && hourly[peakHour] > 0 && (
              <span style={{ fontSize: 11, color: "#334155", marginLeft: 10 }}>
                peak at {fmt12h(peakHour)}
              </span>
            )}
          </div>
        </div>

        {hourly.every(v => v === 0)
          ? <SectionEmpty icon="🕐" message="No hourly activity recorded for this day" />
          : <>
            <HourlyActivityPattern hourly={hourly} peakHour={peakHour} BASE={BASE} selectedDate={selectedDate} />
            <BestTimeInsight hourly={hourly} peakHour={peakHour} />
          </>
        }
      </div>

      {/* ── Category breakdown ── */}
      <div style={{
        background: "rgba(15,18,30,0.5)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20, padding: "20px 20px 16px",
        backdropFilter: "blur(12px)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1", display: "block", marginBottom: 14 }}>
          Category Breakdown
        </span>
        {!stats.length
          ? <SectionEmpty icon="🗂️" message="No app usage recorded for this day" />
          : <CategoryBreakdown stats={stats} />
        }
      </div>
    </div>
  );
}
import { fmtTime } from "../shared/utils";
import { SectionCard, StatPill, TrendChip } from "../shared/components";

// ─── Extracted chart components ───────────────────────────────────────────────
import ScreenTimeTrend from "./ScreenTimeTrend";   // 14-day trend + drill-down
import SessionTimeline from "./SessionTimeline";    // per-day session swimlanes

// ─── ACTIVITY PAGE ────────────────────────────────────────────────────────────
// Drill-down into the 14-Day trend now reuses <HourlyActivityPattern> from
// OverviewPage (via ScreenTimeTrend) – no duplicate chart code anywhere.
//
// Props:
//   BASE           – API base URL
//   selectedDate   – currently selected date string
//   data           – wellbeing data object
//   stats          – app stat rows
//   prevStats      – previous period stat rows
//   prevWellbeing  – previous period wellbeing object
//   showComparison – boolean
//   hourly         – array[24] minutes active (today)
//   peakHour       – index of today's peak hour
//   countKey       – key to re-trigger animations
export default function ActivityPage({
  BASE,
  selectedDate,
  data,
  stats,
  prevStats,
  prevWellbeing,
  showComparison,
  hourly,
  peakHour,
  countKey,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stat pills */}
      <div
        className="grid-4-sm"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="⏱" label="Screen Time" value={fmtTime(data.totalScreenTime)} color="#4ade80" />
          {showComparison && prevWellbeing && (
            <TrendChip
              current={data.totalScreenTime}
              previous={prevWellbeing.totalScreenTime}
              mode="time"
              isPositiveGood={false}
            />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="💬" label="Sessions" value={data.totalSessions} color="#60a5fa" />
          {showComparison && prevWellbeing && (
            <TrendChip
              current={data.totalSessions}
              previous={prevWellbeing.totalSessions}
              mode="count"
              isPositiveGood={true}
            />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="⌨️" label="Keystrokes" value={data.totalKeystrokes.toLocaleString()} color="#a78bfa" />
          {showComparison && prevWellbeing && (
            <TrendChip
              current={data.totalKeystrokes}
              previous={prevWellbeing.totalKeystrokes}
              mode="count"
              isPositiveGood={true}
            />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <StatPill icon="🖱️" label="Clicks" value={data.totalClicks.toLocaleString()} color="#f472b6" />
          {showComparison && prevWellbeing && (
            <TrendChip
              current={data.totalClicks}
              previous={prevWellbeing.totalClicks}
              mode="count"
              isPositiveGood={true}
            />
          )}
        </div>
      </div>

      {/*
        14-Day trend with click-to-drill-down.
        ✅ Drill-down renders <HourlyActivityPattern> from OverviewPage internally –
           no new chart; full code reuse via ScreenTimeTrend → HourlyActivityPattern.
      */}
      <ScreenTimeTrend BASE={BASE} />

      {/* Session timeline swimlanes */}
      <SessionTimeline BASE={BASE} date={selectedDate} />
    </div>
  );
}

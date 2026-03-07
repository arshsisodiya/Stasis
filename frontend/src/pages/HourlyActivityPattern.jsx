import { HourlyBar } from "../shared/components";

// ─── HOURLY ACTIVITY PATTERN ──────────────────────────────────────────────────
// Reusable component used in both OverviewPage and ActivityPage (drill-down).
// Props:
//   hourly       – array[24] of minutes active per hour
//   peakHour     – index of the peak hour
//   BASE         – API base URL (optional, passed to HourlyBar)
//   selectedDate – currently selected date string (optional)
export default function HourlyActivityPattern({ hourly, peakHour, BASE, selectedDate }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: "#475569",
          textTransform: "uppercase", letterSpacing: "0.15em"
        }}>
          Hourly Activity Pattern
        </div>
        {hourly[peakHour] > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 10, padding: "5px 12px"
          }}>
            <span style={{ fontSize: 12 }}>⭐</span>
            <span style={{ fontSize: 12, color: "#fbbf24" }}>
              Peak hour:{" "}
              {peakHour === 0
                ? "12 AM"
                : peakHour === 12
                ? "12 PM"
                : peakHour < 12
                ? `${peakHour} AM`
                : `${peakHour - 12} PM`}
              &nbsp;·&nbsp;{hourly[peakHour]}m active
            </span>
          </div>
        )}
      </div>
      <HourlyBar data={hourly} peakHour={peakHour} BASE={BASE} selectedDate={selectedDate} />
    </div>
  );
}

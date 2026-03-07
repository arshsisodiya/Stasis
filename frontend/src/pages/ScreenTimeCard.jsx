import { fmtTime } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard, TrendChip } from "../shared/components";

// ─── SCREEN TIME CARD ─────────────────────────────────────────────────────────
// Props:
//   data           – wellbeing data object { totalScreenTime, totalIdleTime, … }
//   prevWellbeing  – previous period wellbeing data (for comparison chip)
//   showComparison – boolean
//   countKey       – key to re-trigger count-up animation on date change
export default function ScreenTimeCard({ data, prevWellbeing, showComparison, countKey }) {
  const sH = useCountUp(Math.floor((data?.totalScreenTime || 0) / 3600), 1400, countKey);
  const sM = useCountUp(Math.floor(((data?.totalScreenTime || 0) % 3600) / 60), 1200, countKey);

  return (
    <SectionCard
      className="metric-card"
      style={{
        borderLeft: "3px solid #4ade80",
        background: "linear-gradient(135deg,rgba(74,222,128,0.04) 0%,rgba(15,18,34,0.7) 60%)",
        minHeight: 190,
        animationDelay: "0ms",
      }}
    >
      <div style={{
        fontSize: 11, color: "#4ade80", textTransform: "uppercase",
        letterSpacing: "0.15em", marginBottom: 16, fontWeight: 600,
      }}>
        Screen Time
      </div>

      <div style={{
        fontFamily: "'DM Serif Display',serif", fontSize: 52,
        fontWeight: 400, lineHeight: 1, color: "#f8fafc",
      }}>
        {sH}<span style={{ fontSize: 24, color: "#475569" }}>h </span>
        {sM}<span style={{ fontSize: 24, color: "#475569" }}>m</span>
      </div>

      {showComparison && prevWellbeing && (
        <div style={{ marginTop: 10, marginBottom: 4 }}>
          <TrendChip
            current={data.totalScreenTime}
            previous={prevWellbeing.totalScreenTime}
            mode="time"
            isPositiveGood={false}
          />
        </div>
      )}

      <div style={{
        marginTop: (showComparison && prevWellbeing) ? 8 : 16,
        display: "flex", gap: 12,
      }}>
        <div style={{ flex: 1, background: "rgba(74,222,128,0.08)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase" }}>Active</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#f8fafc", marginTop: 2 }}>
            {fmtTime(data.totalScreenTime - data.totalIdleTime)}
          </div>
        </div>
        <div style={{ flex: 1, background: "rgba(148,163,184,0.06)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Idle</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginTop: 2 }}>
            {fmtTime(data.totalIdleTime)}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

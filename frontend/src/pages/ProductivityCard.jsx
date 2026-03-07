import { interpolateColor } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard, RadialProgress, TrendChip } from "../shared/components";

// ─── PRODUCTIVITY CARD ────────────────────────────────────────────────────────
// Props:
//   data           – wellbeing data { productivityPercent, … }
//   prevWellbeing  – previous period data (for comparison chip)
//   showComparison – boolean
//   countKey       – key to re-trigger count-up animation
export default function ProductivityCard({ data, prevWellbeing, showComparison, countKey }) {
  const pC = useCountUp(data?.productivityPercent || 0, 2000, countKey);

  const prodColor = interpolateColor(data.productivityPercent, [
    { at: 0,  color: "#334155" },
    { at: 20, color: "#64748b" },
    { at: 45, color: "#fbbf24" },
    { at: 65, color: "#4ade80" },
    { at: 90, color: "#34d399" },
  ]);

  return (
    <SectionCard
      className="metric-card"
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        border: "1px solid rgba(255,255,255,0.04)",
        borderLeft: `5px solid ${prodColor}`,
        background: `linear-gradient(135deg,${prodColor}08 0%,rgba(15,18,34,0.7) 60%)`,
        minHeight: 190, animationDelay: "60ms", transition: "all 0.6s ease",
      }}
    >
      <div style={{
        fontSize: 11, color: prodColor, textTransform: "uppercase",
        letterSpacing: "0.15em", fontWeight: 600, transition: "color 0.6s ease",
      }}>
        Productivity
      </div>

      <RadialProgress value={pC} size={150} stroke={12} color="#4ade80" sublabel="%" />

      {showComparison && prevWellbeing ? (
        <TrendChip
          current={data.productivityPercent}
          previous={prevWellbeing.productivityPercent}
          mode="pct"
          isPositiveGood={true}
        />
      ) : (
        <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
          of active time on<br />productive work
        </div>
      )}
    </SectionCard>
  );
}

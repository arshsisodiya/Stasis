import { memo, useState } from "react";
import { interpolateColor } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard, RadialProgress, TrendChip } from "../shared/components";
import { Sparkline } from "../WellbeingDashboard";

// ─── PRODUCTIVITY CARD ────────────────────────────────────────────────────────
function ProductivityCardInner({ data, prevWellbeing, showComparison, countKey, sparkValues, sparkColor = "#4ade80", goalInfo, onSetGoal }) {
  const [isHovered, setIsHovered] = useState(false);
  const hasGoal = Boolean(goalInfo?.goal);
  const pC = useCountUp(data?.productivityPercent || 0, 2000, countKey);

  const prodColor = interpolateColor(data.productivityPercent, [
    { at: 0, color: "#334155" },
    { at: 20, color: "#64748b" },
    { at: 45, color: "#fbbf24" },
    { at: 65, color: "#4ade80" },
    { at: 90, color: "#34d399" },
  ]);

  return (
    <SectionCard
      className="metric-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex", flexDirection: "column",
        flex: 1,
        border: "1px solid rgba(255,255,255,0.04)",
        borderLeft: `5px solid ${prodColor}`,
        background: `linear-gradient(135deg,${prodColor}08 0%,rgba(15,18,34,0.7) 60%)`,
        animationDelay: "60ms", transition: "border-color 0.6s ease, background 0.6s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, minHeight: 28 }}>
        <div style={{
          fontSize: 11, color: prodColor, textTransform: "uppercase",
          letterSpacing: "0.15em", fontWeight: 600, transition: "color 0.6s ease",
        }}>
          Productivity
        </div>
        {!hasGoal && (
          <button
            onClick={onSetGoal}
            style={{
              border: "1px solid rgba(96,165,250,0.28)",
              background: isHovered ? "rgba(96,165,250,0.16)" : "rgba(96,165,250,0.08)",
              color: "#93c5fd",
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              opacity: isHovered ? 1 : 0,
              pointerEvents: isHovered ? "auto" : "none",
              transform: isHovered ? "translateY(0)" : "translateY(2px)",
              transition: "opacity 0.2s ease, transform 0.2s ease, background 0.2s ease",
            }}
            title="Set Productivity Goal"
          >
            Set Goal
          </button>
        )}
      </div>

      {/* ── Center-aligned content block ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>

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
      </div>  {/* end center block */}

      {sparkValues?.length >= 2 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: "auto",
          padding: "6px 0 10px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <span style={{ fontSize: 9, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.08em" }}>7d trend</span>
          <Sparkline values={sparkValues} color={sparkColor} width={72} height={20} />
        </div>
      )}
    </SectionCard>
  );
}

export default memo(ProductivityCardInner);

import { fmtTimeLong, interpolateColor } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard, RadialProgress, TrendChip } from "../shared/components";
import { Sparkline } from "../WellbeingDashboard";

// ─── FOCUS CARD ───────────────────────────────────────────────────────────────
// Props:
//   data           – wellbeing data { focusScore, deepWorkSeconds, … }
//   prevWellbeing  – previous period data (for comparison chip)
//   showComparison – boolean
//   countKey       – key to re-trigger count-up animation
export default function FocusCard({ data, prevWellbeing, showComparison, countKey, sparkValues, sparkColor = "#a78bfa" }) {
  const fC = useCountUp(data?.focusScore || 0, 2000, countKey);

  const focusColor = interpolateColor(data.focusScore ?? 0, [
    { at: 0, color: "#334155" },
    { at: 15, color: "#64748b" },
    { at: 35, color: "#60a5fa" },
    { at: 65, color: "#4ade80" },
    { at: 90, color: "#34d399" },
  ]);

  return (
    <SectionCard
      className="metric-card"
      style={{
        display: "flex", flexDirection: "column",
        flex: 1,
        border: "1px solid rgba(255,255,255,0.04)",
        borderLeft: `5px solid ${focusColor}`,
        background: `linear-gradient(135deg,${focusColor}08 0%,rgba(15,18,34,0.7) 60%)`,
        animationDelay: "120ms", transition: "all 0.6s ease",
        paddingBottom: sparkValues?.length >= 2 ? 0 : undefined,
      }}
    >
      {/* ── Center-aligned content block ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{
          fontSize: 11, color: focusColor, textTransform: "uppercase",
          letterSpacing: "0.15em", fontWeight: 600, transition: "color 0.6s ease",
        }}>
          Focus
        </div>

        <RadialProgress value={fC} size={150} stroke={12} color="#60a5fa" sublabel="%" />

        {data.deepWorkSeconds ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
              <span>deep work</span><br />
              <span style={{ color: "#475569", fontWeight: 600 }}>{fmtTimeLong(data.deepWorkSeconds)}</span>
            </div>
            {showComparison && prevWellbeing?.productivityPercent !== undefined && (
              <TrendChip
                current={data.focusScore ?? 0}
                previous={prevWellbeing.productivityPercent}
                mode="pct"
                isPositiveGood={true}
              />
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
            of time in deep focus
          </div>
        )}
      </div>  {/* end center block */}

      {sparkValues?.length >= 2 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "calc(100% + 48px)", marginLeft: -24, marginTop: "auto",
          padding: "6px 16px 10px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <span style={{ fontSize: 9, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.08em" }}>7d trend</span>
          <Sparkline values={sparkValues} color={sparkColor} width={72} height={20} />
        </div>
      )}
    </SectionCard>
  );
}

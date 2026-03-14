import { memo, useState } from "react";
import { fmtTimeLong, interpolateColor } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard, RadialProgress, TrendChip } from "../shared/components";
import { Sparkline } from "../WellbeingDashboard";

// ─── FOCUS CARD ─────────────────────────────────────────────────────────────
function FocusCardInner({
  data,
  prevWellbeing,
  showComparison,
  countKey,
  sparkValues,
  sparkColor = "#a78bfa",
  goalInfo,
  onSetGoal,
  onEditGoal,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const hasGoal = Boolean(goalInfo?.goal);
  const goal = goalInfo?.goal || null;
  const goalProgress = goalInfo?.progress || null;
  const goalTargetScore = goalProgress?.target_value ?? goal?.target_value ?? 0;
  const goalActualScore = goalProgress?.actual_value ?? data?.focusScore ?? 0;
  const goalDeltaPts = Math.round(goalActualScore - goalTargetScore);
  const goalMet = goalProgress?.met ?? (goalTargetScore > 0 ? goalActualScore >= goalTargetScore : false);
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={() => setIsHovered(false)}
      style={{
        display: "flex", flexDirection: "column",
        flex: 1,
        border: "1px solid rgba(255,255,255,0.04)",
        borderLeft: `5px solid ${focusColor}`,
        background: `linear-gradient(135deg,${focusColor}08 0%,rgba(15,18,34,0.7) 60%)`,
        animationDelay: "120ms", transition: "border-color 0.6s ease, background 0.6s ease",
      }}
    >
      {/* ── Center-aligned content block ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 28 }}>
          <div style={{
            fontSize: 11, color: focusColor, textTransform: "uppercase",
            letterSpacing: "0.15em", fontWeight: 600, transition: "color 0.6s ease",
          }}>
            Focus
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
            >
              Set Goal
            </button>
          )}
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
                previous={prevWellbeing.focusScore}
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

        {hasGoal && goalTargetScore > 0 && (
          <button
            onClick={onEditGoal || onSetGoal}
            style={{
              marginTop: 2,
              border: `1px solid ${goalMet ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
              background: goalMet ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
              borderRadius: 10,
              width: "100%",
              maxWidth: 230,
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Goal ≥ {Math.round(goalTargetScore)}
            </span>
            <span style={{ fontSize: 11, color: goalMet ? "#4ade80" : "#f87171", fontWeight: 700 }}>
              {goalMet ? `+${Math.abs(goalDeltaPts)} pt` : `-${Math.abs(goalDeltaPts)} pt`}
            </span>
          </button>
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

export default memo(FocusCardInner);

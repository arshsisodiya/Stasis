import { memo, useState } from "react";
import { fmtTime } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { GoalStatusBlock, SectionCard, TrendChip } from "../shared/components";
import { Sparkline } from "../WellbeingDashboard";

// ─── SCREEN TIME CARD ─────────────────────────────────────────────────────────
function ScreenTimeCardInner({ data, prevWellbeing, showComparison, countKey, sparkValues, sparkColor = "#60a5fa", goalInfo, onSetGoal, onEditGoal }) {
  const [isHovered, setIsHovered] = useState(false);
  const hasGoal = Boolean(goalInfo?.goal);
  const goal = goalInfo?.goal || null;
  const goalProgress = goalInfo?.progress || null;
  const streak7 = goalInfo?.streak7 || [];
  const currentStreak = goalInfo?.currentStreak || 0;
  const goalTargetSeconds = goalProgress?.target_value ?? goal?.target_value ?? 0;
  const goalActualSeconds = goalProgress?.actual_value ?? data?.totalScreenTime ?? 0;
  const goalDeltaSeconds = Math.round(goalActualSeconds - goalTargetSeconds);
  const goalMet = goalProgress?.met ?? (goalTargetSeconds > 0 ? goalActualSeconds <= goalTargetSeconds : false);
  const sH = useCountUp(Math.floor((data?.totalScreenTime || 0) / 3600), 1400, countKey);
  const sM = useCountUp(Math.floor(((data?.totalScreenTime || 0) % 3600) / 60), 1200, countKey);

  return (
    <SectionCard
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={() => setIsHovered(false)}
      className="metric-card"
      style={{
        display: "flex", flexDirection: "column",
        flex: 1,
        border: "1px solid rgba(255,255,255,0.04)",
        borderLeft: "3px solid #4ade80",
        background: "linear-gradient(135deg,rgba(74,222,128,0.04) 0%,rgba(15,18,34,0.7) 60%)",
        animationDelay: "0ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, minHeight: 28 }}>
        <div style={{
          fontSize: 11, color: "#4ade80", textTransform: "uppercase",
          letterSpacing: "0.15em", fontWeight: 600,
        }}>
          Screen Time
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

      <GoalStatusBlock
        hasGoal={hasGoal && goalTargetSeconds > 0}
        goalMet={goalMet}
        goalLabel={`Goal ≤ ${fmtTime(goalTargetSeconds)}`}
        goalDelta={goalMet ? `${fmtTime(Math.abs(goalDeltaSeconds))} under` : `${fmtTime(Math.abs(goalDeltaSeconds))} over`}
        onEditGoal={onEditGoal || onSetGoal}
        streak7={streak7}
        currentStreak={currentStreak}
      />

      <div style={{
        marginTop: 8,
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

      {/* ── Active / Idle ratio bar ── */}
      {data.totalScreenTime > 0 && (() => {
        const activeTime = data.totalScreenTime - data.totalIdleTime;
        const activePct = Math.round((activeTime / data.totalScreenTime) * 100);
        const idlePct = 100 - activePct;
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{
              height: 6, borderRadius: 6, overflow: "hidden",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
            }}>
              <div style={{
                width: `${activePct}%`, height: "100%",
                background: "linear-gradient(90deg, #4ade80, #22d3ee)",
                borderRadius: "6px 0 0 6px",
                transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1)",
                boxShadow: "0 0 8px rgba(74,222,128,0.4)",
              }} />
              <div style={{
                flex: 1, height: "100%",
                background: "rgba(100,116,139,0.25)",
                borderRadius: "0 6px 6px 0",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: "#4ade8077", fontWeight: 600 }}>{activePct}% active</span>
              <span style={{ fontSize: 9, color: "#47556966" }}>{idlePct}% idle</span>
            </div>
          </div>
        );
      })()}

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

export default memo(ScreenTimeCardInner);
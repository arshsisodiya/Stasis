import { useState } from "react";
import { fmtTime } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard } from "../shared/components";

// ─── Extracted metric & chart components ──────────────────────────────────────
import ScreenTimeCard        from "./ScreenTimeCard";
import ProductivityCard      from "./ProductivityCard";
import FocusCard             from "./FocusCard";
import InputActivityCard     from "./InputActivityCard";
import HourlyActivityPattern from "./HourlyActivityPattern";
import CategoryBreakdown     from "./CategoryBreakdown";

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
            animation: "banner-in 0.4s ease",
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
              animation: "banner-in 0.4s ease",
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
  prevWellbeing,
  showComparison,
  limits,
  hourly,
  peakHour,
  countKey,
  selectedDate,
  onGoToLimits,
  BASE,
}) {
  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Limit warnings */}
      <LimitWarningBanner limits={limits} usage={usage} onGoToLimits={onGoToLimits} />

      {/* Metric cards – 4-column grid */}
      <div
        key={selectedDate}
        className="grid-4"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}
      >
        <ScreenTimeCard
          data={data}
          prevWellbeing={prevWellbeing}
          showComparison={showComparison}
          countKey={countKey}
        />
        <ProductivityCard
          data={data}
          prevWellbeing={prevWellbeing}
          showComparison={showComparison}
          countKey={countKey}
        />
        <FocusCard
          data={data}
          prevWellbeing={prevWellbeing}
          showComparison={showComparison}
          countKey={countKey}
        />
        <InputActivityCard
          data={data}
          stats={stats}
          countKey={countKey}
        />
      </div>

      {/* Hourly activity pattern */}
      <SectionCard>
        <HourlyActivityPattern
          hourly={hourly}
          peakHour={peakHour}
          BASE={BASE}
          selectedDate={selectedDate}
        />
      </SectionCard>

      {/* Donut category breakdown */}
      <SectionCard title="Category Breakdown">
        <CategoryBreakdown stats={stats} />
      </SectionCard>
    </div>
  );
}

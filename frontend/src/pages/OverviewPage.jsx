import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fmtTime } from "../shared/utils";
import { localYMD } from "../shared/utils";
import { SectionCard } from "../shared/components";
import ScreenTimeCard from "./ScreenTimeCard";
import ProductivityCard from "./ProductivityCard";
import FocusCard from "./FocusCard";
import InputActivityCard from "./InputActivityCard";
import HourlyActivityPattern from "./HourlyActivityPattern";
import CategoryBreakdown from "./CategoryBreakdown";

const OVERVIEW_GOALS_VISIBILITY_EVENT = "stasis:overview-goals-visibility";

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

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localYMD(d);
}

function buildLastNDates(endDate, count) {
  const list = [];
  for (let i = count - 1; i >= 0; i--) {
    list.push(shiftDate(endDate, -i));
  }
  return list;
}

function streakWindowFromLogs(logs = [], endDate) {
  const dates = buildLastNDates(endDate, 7);
  const byDate = new Map(logs.map((l) => [l.date, Boolean(l.met)]));
  return dates.map((d) => {
    if (!byDate.has(d)) return null;
    return byDate.get(d);
  });
}

function currentStreakFromWindow(window = []) {
  let streak = 0;
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i] === true) streak += 1;
    else break;
  }
  return streak;
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
      <div className="hover-warn-banner" onClick={onGoToLimits} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
        borderRadius: 12, cursor: "pointer", background: bg, border: `1px solid ${border}`,
        marginBottom: 4, animation: "banner-in 0.35s ease", transition: "background 0.2s",
      }}>
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
    <div className="hover-warn-banner" onClick={onGoToLimits} style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "8px 14px", borderRadius: 12, cursor: "pointer",
      background: bg2, border: `1px solid ${border2}`,
      marginBottom: 4, animation: "banner-in 0.35s ease", transition: "background 0.2s",
    }}>
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

const GOAL_TYPE_META = {
  daily_screen_time: { label: "Screen Time Goal", unit: "seconds", direction: "under" },
  daily_productivity_pct: { label: "Productivity Goal", unit: "percent", direction: "over" },
  daily_focus_score: { label: "Focus Score Goal", unit: "score", direction: "over" },
};

function QuickGoalModal({ open, initial, onClose, onSave }) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [percent, setPercent] = useState(60);
  const [score, setScore] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !initial) return;
    setLabel(initial.label || "");
    if (initial.goal_type === "daily_screen_time") {
      const secs = Math.round(initial.target_value || 0);
      setHours(Math.floor(secs / 3600));
      setMinutes(Math.floor((secs % 3600) / 60));
    }
    if (initial.goal_type === "daily_productivity_pct") {
      setPercent(Math.round(initial.target_value || 60));
    }
    if (initial.goal_type === "daily_focus_score") {
      setScore(Math.round(initial.target_value || 60));
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !initial) return null;

  const isTime = initial.goal_type === "daily_screen_time";
  const isPercent = initial.goal_type === "daily_productivity_pct";
  const targetValue = isTime
    ? ((Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60)
    : (isPercent ? (Number(percent) || 0) : (Number(score) || 0));
  const canSave = targetValue > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    await onSave({
      ...initial,
      label: label.trim() || undefined,
      target_value: targetValue,
      target_unit: isTime ? "seconds" : (isPercent ? "percent" : "score"),
      direction: isTime ? "under" : "over",
    });
    setSaving(false);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,0.62)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ width: 420, maxWidth: "92vw", borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(7,10,20,0.98)", padding: 22 }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, color: "#f8fafc", fontWeight: 700 }}>{initial.id ? "Edit Goal" : "Set Goal"}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{GOAL_TYPE_META[initial.goal_type]?.label || "Goal"}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>Label (optional)</div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={GOAL_TYPE_META[initial.goal_type]?.label || "Goal"} style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", padding: "10px 12px", fontSize: 13, outline: "none" }} />
        </div>

        {isTime ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>Target (stay under)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input type="number" min="0" max="23" value={hours} onChange={(e) => setHours(Math.max(0, Math.min(23, Number(e.target.value) || 0)))} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", padding: "10px 12px", fontSize: 14, outline: "none" }} />
              <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", padding: "10px 12px", fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "#64748b" }}>
              <span>Hours</span>
              <span>Minutes</span>
            </div>
          </div>
        ) : isPercent ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>Target (reach at least)</div>
            <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", padding: "10px 12px", fontSize: 14, outline: "none" }} />
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>Target (reach at least)</div>
            <input type="number" min="1" max="100" value={score} onChange={(e) => setScore(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", padding: "10px 12px", fontSize: 14, outline: "none" }} />
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", padding: "10px 12px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={!canSave || saving} style={{ flex: 1, borderRadius: 10, border: "1px solid rgba(74,222,128,0.35)", background: canSave ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.04)", color: canSave ? "#4ade80" : "#64748b", padding: "10px 12px", cursor: canSave ? "pointer" : "not-allowed", fontWeight: 700 }}>
            {saving ? "Saving..." : initial.id ? "Update Goal" : "Create Goal"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
export default function OverviewPage({
  data,
  stats,
  prevWellbeing,
  showComparison,
  limits,
  hourly,
  peakHour,
  countKey,
  selectedDate,
  onGoToLimits,
  sparkSeries,
  BASE,
}) {
  const [goals, setGoals] = useState([]);
  const [goalProgress, setGoalProgress] = useState([]);
  const [goalHistory, setGoalHistory] = useState({});
  const [showGoalsInOverview, setShowGoalsInOverview] = useState(true);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalSeed, setGoalModalSeed] = useState(null);
  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then((r) => r.json())
      .then((s) => setShowGoalsInOverview(s?.show_goals_in_overview !== false))
      .catch(() => setShowGoalsInOverview(true));
  }, [BASE]);

  useEffect(() => {
    const onVisibilityChanged = (e) => {
      const next = e?.detail?.value;
      if (typeof next === "boolean") setShowGoalsInOverview(next);
    };
    window.addEventListener(OVERVIEW_GOALS_VISIBILITY_EVENT, onVisibilityChanged);
    return () => window.removeEventListener(OVERVIEW_GOALS_VISIBILITY_EVENT, onVisibilityChanged);
  }, []);

  const loadGoals = useCallback(async () => {
    if (!showGoalsInOverview) {
      setGoals([]);
      setGoalProgress([]);
      setGoalHistory({});
      return;
    }
    try {
      const [goalsRes, progressRes, historyRes] = await Promise.all([
        fetch(`${BASE}/api/goals`).then((r) => r.json()),
        fetch(`${BASE}/api/goals/progress?date=${selectedDate}`).then((r) => r.json()),
        fetch(`${BASE}/api/goals/history?days=120`).then((r) => r.json()),
      ]);
      setGoals(Array.isArray(goalsRes) ? goalsRes : []);
      setGoalProgress(Array.isArray(progressRes) ? progressRes : []);
      setGoalHistory(historyRes && typeof historyRes === "object" ? historyRes : {});
    } catch {
      setGoals([]);
      setGoalProgress([]);
      setGoalHistory({});
    }
  }, [BASE, selectedDate, showGoalsInOverview]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const goalsByType = useMemo(() => {
    const typed = {
      daily_screen_time: null,
      daily_productivity_pct: null,
      daily_focus_score: null,
    };
    for (const g of goals) {
      if (!g?.is_active) continue;
      if (g.goal_type in typed && !typed[g.goal_type]) {
        typed[g.goal_type] = g;
      }
    }
    return typed;
  }, [goals]);

  const progressByGoalId = useMemo(() => {
    const byId = {};
    for (const p of goalProgress) {
      if (p?.id != null) byId[p.id] = p;
    }
    return byId;
  }, [goalProgress]);

  const streakByGoalId = useMemo(() => {
    const byId = {};
    const endDate = selectedDate || localYMD();
    for (const [id, logs] of Object.entries(goalHistory || {})) {
      const window = streakWindowFromLogs(Array.isArray(logs) ? logs : [], endDate);
      byId[id] = {
        streak7: window,
        currentStreak: currentStreakFromWindow(window),
      };
    }
    return byId;
  }, [goalHistory, selectedDate]);

  const cardProps = { prevWellbeing, showComparison, countKey };

  if (!data) return null;

  const screenTimeGoal = goalsByType.daily_screen_time;
  const screenTimeGoalProgress = screenTimeGoal ? (progressByGoalId[screenTimeGoal.id] || null) : null;
  const screenTimeGoalStreak = screenTimeGoal ? (streakByGoalId[String(screenTimeGoal.id)] || null) : null;
  const productivityGoal = goalsByType.daily_productivity_pct;
  const productivityGoalProgress = productivityGoal ? (progressByGoalId[productivityGoal.id] || null) : null;
  const productivityGoalStreak = productivityGoal ? (streakByGoalId[String(productivityGoal.id)] || null) : null;
  const focusGoal = goalsByType.daily_focus_score;
  const focusGoalProgress = focusGoal ? (progressByGoalId[focusGoal.id] || null) : null;
  const focusGoalStreak = focusGoal ? (streakByGoalId[String(focusGoal.id)] || null) : null;

  const openCreateGoal = (goalType) => {
    const defaultTarget = goalType === "daily_screen_time" ? 7200 : 60;
    setGoalModalSeed({ goal_type: goalType, target_value: defaultTarget });
    setGoalModalOpen(true);
  };

  const openEditGoal = (goal) => {
    if (!goal) return;
    setGoalModalSeed(goal);
    setGoalModalOpen(true);
  };

  const handleSaveGoal = async (payload) => {
    const endpoint = payload.id ? `${BASE}/api/goals/${payload.id}` : `${BASE}/api/goals`;
    const method = payload.id ? "PUT" : "POST";
    const body = payload.id
      ? { target_value: payload.target_value, label: payload.label }
      : {
        goal_type: payload.goal_type,
        target_value: payload.target_value,
        target_unit: payload.target_unit,
        direction: payload.direction,
        label: payload.label,
      };

    await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    await loadGoals();
    setGoalModalOpen(false);
    setGoalModalSeed(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Limit warnings */}
      <LimitWarningBanner limits={limits} usage={usage} onGoToLimits={onGoToLimits} selectedDate={selectedDate} />

      {/* ── Metric cards — staggered entrance, 20px gap ── */}
      <div
        className="grid-4"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginBottom: 20, alignItems: "stretch" }}
      >
        {/* Each card gets staggered delay + matching sparkline */}
        <div className="metric-card" style={{ animationDelay: "0ms", display: "flex", flexDirection: "column" }}>
          <ScreenTimeCard
            data={data}
            {...cardProps}
            sparkValues={sparkSeries?.screenTime}
            goalInfo={{
              enabled: showGoalsInOverview,
              goal: screenTimeGoal,
              progress: screenTimeGoalProgress,
              streak7: screenTimeGoalStreak?.streak7 || [],
              currentStreak: screenTimeGoalStreak?.currentStreak || 0,
            }}
            onSetGoal={() => openCreateGoal("daily_screen_time")}
            onEditGoal={() => openEditGoal(screenTimeGoal)}
          />
        </div>

        <div className="metric-card" style={{ animationDelay: "55ms", display: "flex", flexDirection: "column" }}>
          <ProductivityCard
            data={data}
            {...cardProps}
            sparkValues={sparkSeries?.productivity}
            goalInfo={{
              enabled: showGoalsInOverview,
              goal: productivityGoal,
              progress: productivityGoalProgress,
              streak7: productivityGoalStreak?.streak7 || [],
              currentStreak: productivityGoalStreak?.currentStreak || 0,
            }}
            onSetGoal={() => openCreateGoal("daily_productivity_pct")}
            onEditGoal={() => openEditGoal(productivityGoal)}
          />
        </div>

        <div className="metric-card" style={{ animationDelay: "110ms", display: "flex", flexDirection: "column" }}>
          <FocusCard
            data={data}
            {...cardProps}
            sparkValues={sparkSeries?.focus}
            goalInfo={{
              enabled: showGoalsInOverview,
              goal: focusGoal,
              progress: focusGoalProgress,
              streak7: focusGoalStreak?.streak7 || [],
              currentStreak: focusGoalStreak?.currentStreak || 0,
            }}
            onSetGoal={() => openCreateGoal("daily_focus_score")}
            onEditGoal={() => openEditGoal(focusGoal)}
          />
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

      <QuickGoalModal
        open={goalModalOpen}
        initial={goalModalSeed}
        onClose={() => {
          setGoalModalOpen(false);
          setGoalModalSeed(null);
        }}
        onSave={handleSaveGoal}
      />
    </div>
  );
}
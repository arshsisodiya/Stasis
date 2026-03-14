import { useState, useEffect, useCallback, useRef } from "react";
import { SectionCard, AppIcon } from "../shared/components";
import { fmtTime, localYMD } from "../shared/utils";

const BASE = "http://127.0.0.1:7432";

const GOAL_TYPES = [
  { value: "daily_screen_time", label: "Daily Screen Time", unit: "seconds", direction: "under", icon: "🖥️", desc: "Stay under a daily screen time target" },
  { value: "daily_productive_time", label: "Daily Productive Time", unit: "seconds", direction: "over", icon: "💪", desc: "Hit a minimum productive time each day" },
  { value: "daily_productivity_pct", label: "Productivity %", unit: "percent", direction: "over", icon: "📊", desc: "Maintain a minimum productivity percentage" },
  { value: "daily_focus_score", label: "Focus Score", unit: "score", direction: "over", icon: "🎯", desc: "Reach a target focus score daily" },
];

function fmtTarget(value, unit) {
  if (unit === "seconds") return fmtTime(value);
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "score") return `${Math.round(value)}`;
  return String(value);
}

function fmtActual(value, unit) {
  if (unit === "seconds") return fmtTime(Math.round(value));
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "score") return `${Math.round(value)}`;
  return String(Math.round(value));
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

function bestStreakFromLogs(logs = []) {
  if (!logs.length) return 0;
  let best = 0;
  let current = 0;
  let prevDate = null;

  for (const log of logs) {
    const met = Boolean(log.met);
    const date = log.date;
    const isConsecutive = prevDate ? shiftDate(prevDate, 1) === date : true;

    if (met) {
      current = isConsecutive ? current + 1 : 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
    prevDate = date;
  }
  return best;
}

function streakWindowFromLogs(logs = [], endDate) {
  const dates = buildLastNDates(endDate, 7);
  const byDate = new Map(logs.map((l) => [l.date, Boolean(l.met)]));
  return dates.map((d) => {
    if (!byDate.has(d)) return null;
    return byDate.get(d);
  });
}

function GoalRing({ progress, met, size = 56, stroke = 4 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(progress / 100, 0), 1);
  const color = met ? "#4ade80" : pct >= 0.7 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}88)`, transition: "stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "'DM Mono',monospace" }}>{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

function GoalCard({ goal, index, onEdit, onDelete, streak7 = [], bestStreak = 0 }) {
  const [hov, setHov] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const meta = GOAL_TYPES.find(t => t.value === goal.goal_type) || {};
  const color = goal.met ? "#4ade80" : goal.progress_pct >= 70 ? "#fbbf24" : "#f87171";
  const statusLabel = goal.met ? "On Track" : goal.progress_pct >= 50 ? "Close" : "Behind";

  return (
    <>
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          animation: `card-fade-in 0.38s cubic-bezier(0.34,1.56,0.64,1) ${index * 55}ms both`,
          background: hov ? "rgba(22,28,52,0.96)" : "rgba(14,18,36,0.78)",
          border: `1px solid ${goal.met ? "rgba(74,222,128,0.18)" : hov ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 20, padding: "20px 22px",
          transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          transform: hov ? "translateY(-3px)" : "none",
          boxShadow: hov ? "0 14px 44px rgba(0,0,0,0.38)" : "0 2px 8px rgba(0,0,0,0.22)"
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}12`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              {meta.icon || "🎯"}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", lineHeight: 1 }}>
                {goal.label || meta.label || goal.goal_type}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
                <span style={{ fontSize: 11, color, fontWeight: 600 }}>{statusLabel}</span>
                {bestStreak > 0 && (
                  <span style={{
                    fontSize: 10,
                    color: "#fbbf24",
                    fontWeight: 700,
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.24)",
                    borderRadius: 999,
                    padding: "2px 8px",
                    marginLeft: 4,
                    fontFamily: "'DM Mono',monospace",
                  }}>
                    Best {bestStreak}d
                  </span>
                )}
              </div>
            </div>
          </div>
          <GoalRing progress={goal.progress_pct} met={goal.met} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "'DM Mono',monospace" }}>
            Current: {fmtActual(goal.actual_value, goal.target_unit)}
          </span>
          <span style={{ fontSize: 11, color: "#334155", fontFamily: "'DM Mono',monospace" }}>
            Target: {goal.direction === "under" ? "≤" : "≥"} {fmtTarget(goal.target_value, goal.target_unit)}
          </span>
        </div>

        <div style={{ height: 5, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "hidden", marginBottom: 14 }}>
          <div style={{
            height: "100%", borderRadius: 5, width: `${Math.min(goal.progress_pct, 100)}%`,
            background: goal.met ? "linear-gradient(90deg,#4ade80,#22d3ee)" : goal.progress_pct >= 70 ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#f87171,#ef4444)",
            boxShadow: `0 0 8px ${color}60`, transition: "width 1.1s cubic-bezier(0.34,1.56,0.64,1)"
          }} />
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}>
          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            7-Day Streak
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {streak7.map((s, idx) => {
              const dot = s === true ? "#4ade80" : s === false ? "#f87171" : "#334155";
              return (
                <div key={idx} style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dot,
                  boxShadow: s === true ? "0 0 8px rgba(74,222,128,0.8)" : "none",
                  opacity: s === null ? 0.65 : 1,
                }} />
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={() => onEdit(goal)} style={{
            flex: 1, padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            background: "rgba(96,165,250,0.09)", color: "#60a5fa",
            transition: "all 0.18s cubic-bezier(0.34,1.56,0.64,1)"
          }}>✏️ Edit</button>
          <button onClick={() => setConfirm(true)} style={{
            width: 34, padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: 14, background: "rgba(248,113,113,0.07)", color: "#f87171",
            transition: "all 0.18s cubic-bezier(0.34,1.56,0.64,1)"
          }}>✕</button>
        </div>
      </div>

      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", animation: "overlay-in 0.2s ease" }}
          onClick={e => { if (e.target === e.currentTarget) setConfirm(false); }}>
          <div style={{ background: "rgba(10,13,26,0.99)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 22, padding: 32, width: 380, maxWidth: "90vw", boxShadow: "0 32px 80px rgba(0,0,0,0.9)", animation: "modal-in 0.28s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#f1f5f9", marginBottom: 8 }}>Remove this goal?</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>This will permanently delete "{goal.label || meta.label}" and all its history.</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: 12, borderRadius: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={() => { onDelete(goal.id); setConfirm(false); }} style={{ flex: 1, padding: 12, borderRadius: 12, cursor: "pointer", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GoalModal({ onClose, onSave, editTarget }) {
  const [goalType, setGoalType] = useState(editTarget?.goal_type || "");
  const [label, setLabel] = useState(editTarget?.label || "");
  const [h, setH] = useState(editTarget && editTarget.target_unit === "seconds" ? Math.floor(editTarget.target_value / 3600) : "");
  const [m, setM] = useState(editTarget && editTarget.target_unit === "seconds" ? Math.floor((editTarget.target_value % 3600) / 60) : "");
  const [numVal, setNumVal] = useState(editTarget && editTarget.target_unit !== "seconds" ? editTarget.target_value : "");
  const [saving, setSaving] = useState(false);

  const meta = GOAL_TYPES.find(t => t.value === goalType);
  const isTime = meta?.unit === "seconds";
  const secs = isTime ? (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60 : 0;
  const targetVal = isTime ? secs : parseFloat(numVal) || 0;
  const ok = goalType && targetVal > 0;

  const doSave = async () => {
    if (!ok) return;
    setSaving(true);
    await onSave({
      goal_type: goalType,
      target_value: targetVal,
      target_unit: meta?.unit || "seconds",
      direction: meta?.direction || "under",
      label: label.trim() || undefined,
      ...(editTarget ? { id: editTarget.id } : {})
    });
    setSaving(false);
    onClose();
  };

  const PRESETS_TIME = [[0, 30, "30m"], [1, 0, "1h"], [2, 0, "2h"], [3, 0, "3h"], [4, 0, "4h"], [6, 0, "6h"], [8, 0, "8h"]];
  const PRESETS_PCT = [30, 40, 50, 60, 70, 80];
  const PRESETS_SCORE = [30, 40, 50, 60, 70, 80];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "linear-gradient(145deg,rgba(12,16,32,0.99),rgba(8,11,24,0.99))",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 26,
        padding: 32, width: 460, maxWidth: "93vw",
        boxShadow: "0 40px 100px rgba(0,0,0,0.9)",
        animation: "modal-in 0.32s cubic-bezier(0.34,1.56,0.64,1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f1f5f9", lineHeight: 1 }}>{editTarget ? "Edit Goal" : "Set a Goal"}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 5 }}>Define what you want to achieve</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.06)", color: "#64748b", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Goal type selector */}
        {!editTarget && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>Goal Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {GOAL_TYPES.map(t => (
                <button key={t.value} onClick={() => setGoalType(t.value)} style={{
                  padding: "12px 14px", borderRadius: 12, border: `1px solid ${goalType === t.value ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.08)"}`,
                  background: goalType === t.value ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.03)",
                  color: goalType === t.value ? "#4ade80" : "#94a3b8", cursor: "pointer",
                  textAlign: "left", fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s"
                }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom label */}
        {goalType && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>Custom Label (optional)</div>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={meta?.label || ""}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 11, color: "#f1f5f9", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
          </div>
        )}

        {/* Target value */}
        {goalType && isTime && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontWeight: 600 }}>
              Target ({meta?.direction === "under" ? "stay under" : "reach at least"})
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input type="number" min="0" max="23" value={h} onChange={e => setH(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))} placeholder="00"
                  style={{ width: "100%", textAlign: "center", fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 700, color: "#f1f5f9", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 8px", outline: "none", boxSizing: "border-box" }} />
                <span style={{ position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#334155" }}>Hours</span>
              </div>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 300, color: "#1e2d42", alignSelf: "center", paddingBottom: 4 }}>:</span>
              <div style={{ flex: 1, position: "relative" }}>
                <input type="number" min="0" max="59" value={m} onChange={e => setM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} placeholder="00"
                  style={{ width: "100%", textAlign: "center", fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 700, color: "#f1f5f9", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 8px", outline: "none", boxSizing: "border-box" }} />
                <span style={{ position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#334155" }}>Minutes</span>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 600 }}>Presets</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PRESETS_TIME.map(([ph, pm, lbl]) => {
                  const ps = ph * 3600 + pm * 60, active = secs === ps;
                  return (
                    <button key={lbl} onClick={() => { setH(ph); setM(pm); }}
                      style={{ padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", border: active ? "1px solid rgba(74,222,128,0.42)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(74,222,128,0.13)" : "rgba(255,255,255,0.04)", color: active ? "#4ade80" : "#64748b", transition: "all 0.2s" }}>
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {goalType && !isTime && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontWeight: 600 }}>
              Target ({meta?.direction === "under" ? "stay under" : "reach at least"}) — {meta?.unit === "percent" ? "%" : "points"}
            </div>
            <input type="number" min="0" max="100" value={numVal} onChange={e => setNumVal(e.target.value)} placeholder="e.g. 60"
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 700, color: "#f1f5f9", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 8px", outline: "none" }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
              {(meta?.unit === "percent" ? PRESETS_PCT : PRESETS_SCORE).map(v => {
                const active = parseFloat(numVal) === v;
                return (
                  <button key={v} onClick={() => setNumVal(v)}
                    style={{ padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", border: active ? "1px solid rgba(74,222,128,0.42)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(74,222,128,0.13)" : "rgba(255,255,255,0.04)", color: active ? "#4ade80" : "#64748b", transition: "all 0.2s" }}>
                    {v}{meta?.unit === "percent" ? "%" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={doSave} disabled={!ok || saving}
          style={{
            width: "100%", padding: 14, borderRadius: 13, border: "none",
            fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
            cursor: ok ? "pointer" : "not-allowed",
            background: ok ? "linear-gradient(135deg,#4ade80 0%,#22d3ee 100%)" : "rgba(255,255,255,0.05)",
            color: ok ? "#060c14" : "#334155",
            boxShadow: ok ? "0 0 26px rgba(74,222,128,0.22)" : "none",
            transition: "all 0.25s"
          }}>
          {saving ? "Saving…" : editTarget ? "Update Goal" : "Create Goal"}
        </button>
      </div>
    </div>
  );
}

export default function GoalsPage({ selectedDate }) {
  const [goals, setGoals] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [goalHistory, setGoalHistory] = useState({});
  const [showGoalsInOverview, setShowGoalsInOverview] = useState(true);
  const toastTimer = useRef(null);

  const showT = (msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [g, p, h, s] = await Promise.all([
        fetch(`${BASE}/api/goals`).then(r => r.json()),
        fetch(`${BASE}/api/goals/progress?date=${selectedDate}`).then(r => r.json()),
        fetch(`${BASE}/api/goals/history?days=120`).then(r => r.json()),
        fetch(`${BASE}/api/settings`).then(r => r.json()),
      ]);
      setGoals(Array.isArray(g) ? g : []);
      setProgress(Array.isArray(p) ? p : []);
      setGoalHistory(h && typeof h === "object" ? h : {});
      setShowGoalsInOverview(s?.show_goals_in_overview !== false);
    } catch { }
    setLoading(false);
  }, [selectedDate]);

  const updateShowGoalsInOverview = async (value) => {
    setShowGoalsInOverview(value);
    try {
      await fetch(`${BASE}/api/settings/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_goals_in_overview: value }),
      });
      showT(value ? "Goals will show on Overview" : "Goals hidden on Overview", "success");
    } catch {
      setShowGoalsInOverview(prev => !value);
      showT("Could not update overview goal setting", "warn");
    }
  };

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 60000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleSave = async (data) => {
    if (data.id) {
      await fetch(`${BASE}/api/goals/${data.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_value: data.target_value, label: data.label })
      });
      showT("Goal updated");
    } else {
      await fetch(`${BASE}/api/goals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      showT("Goal created");
    }
    fetchAll();
  };

  const handleDelete = async (id) => {
    await fetch(`${BASE}/api/goals/${id}`, { method: "DELETE" });
    showT("Goal removed", "warn");
    fetchAll();
  };

  const goalsMetToday = progress.filter(p => p.met).length;
  const totalActive = progress.length;

  const STATS = [
    { color: "#4ade80", bg: "rgba(74,222,128,0.05)", border: "rgba(74,222,128,0.12)", label: "Goals Met", val: goalsMetToday, sub: `${totalActive} active goal${totalActive !== 1 ? "s" : ""} today` },
    { color: "#60a5fa", bg: "rgba(96,165,250,0.05)", border: "rgba(96,165,250,0.12)", label: "Active Goals", val: goals.filter(g => g.is_active).length, sub: `${goals.length} total configured` },
    { color: "#a78bfa", bg: "rgba(167,139,250,0.05)", border: "rgba(167,139,250,0.12)", label: "Completion Rate", val: totalActive > 0 ? `${Math.round(goalsMetToday / totalActive * 100)}%` : "—", sub: "today's overall progress" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        @keyframes modal-in { from { opacity:0; transform:scale(0.93) translateY(14px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes overlay-in { from{opacity:0} to{opacity:1} }
        @keyframes card-fade-in { from { opacity:0; transform:translateY(14px) scale(0.98); } to { opacity:1; transform:none; } }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 400, background: toast.type === "warn" ? "rgba(14,11,4,0.98)" : "rgba(4,11,8,0.98)", border: `1px solid ${toast.type === "warn" ? "rgba(251,191,36,0.3)" : "rgba(74,222,128,0.3)"}`, borderRadius: 14, padding: "13px 20px", color: toast.type === "warn" ? "#fbbf24" : "#4ade80", fontSize: 13, fontWeight: 500, boxShadow: "0 14px 44px rgba(0,0,0,0.55)", display: "flex", alignItems: "center", gap: 10, animation: "card-fade-in 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
          <span style={{ fontSize: 15 }}>{toast.type === "warn" ? "⚠️" : "✓"}</span>{toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.12em" }}>Goals & Targets</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Define what success looks like for your day</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.09)",
            background: "rgba(255,255,255,0.03)",
            cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={showGoalsInOverview}
              onChange={(e) => updateShowGoalsInOverview(e.target.checked)}
              style={{ accentColor: "#4ade80" }}
            />
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600 }}>Show goals in Overview</span>
          </label>

          <button onClick={() => { setEditTarget(null); setShowModal(true); }} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12,
            border: "1px solid rgba(74,222,128,0.3)", cursor: "pointer",
            background: "rgba(74,222,128,0.08)", color: "#4ade80",
            fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)"
          }}>
            <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 300 }}>+</span> New Goal
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {STATS.map(({ color, bg, border, label, val, sub }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 7, fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#f1f5f9", fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Goal Cards */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "#4ade80", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Loading goals…
        </div>
      ) : progress.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", background: "rgba(12,15,28,0.5)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#334155", marginBottom: 8 }}>No goals set yet</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>Set goals to track your daily progress and build better habits</div>
          <button onClick={() => { setEditTarget(null); setShowModal(true); }} style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12,
            border: "1px solid rgba(74,222,128,0.3)", cursor: "pointer",
            background: "rgba(74,222,128,0.08)", color: "#4ade80",
            fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>+ Set your first goal</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 14 }}>
          {progress.map((g, i) => {
            const history = Array.isArray(goalHistory[g.id]) ? goalHistory[g.id] : [];
            const streak7 = streakWindowFromLogs(history, selectedDate || localYMD());
            const bestStreak = bestStreakFromLogs(history);
            return (
              <GoalCard key={g.id} goal={g} index={i}
                streak7={streak7}
                bestStreak={bestStreak}
                onEdit={g => {
                  const full = goals.find(x => x.id === g.id);
                  setEditTarget(full || g);
                  setShowModal(true);
                }}
                onDelete={handleDelete} />
            );
          })}
        </div>
      )}

      {showModal && (
        <GoalModal onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSave={handleSave} editTarget={editTarget} />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { fmtTime } from "../shared/utils";
import { SectionCard, AppIcon } from "../shared/components";

// ─── LIMIT RING ───────────────────────────────────────────────────────────────
function LimitRing({ used, limit, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const color = pct >= 1 ? "#f87171" : pct >= 0.8 ? "#fbbf24" : "#4ade80";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "'DM Serif Display',serif" }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  );
}

// ─── LIMIT CARD ───────────────────────────────────────────────────────────────
function LimitCard({ limit, onToggle, onEdit, onDelete, onUnblock, todayUsage, isBlocked }) {
  const [hov, setHov] = useState(false);
  const used = todayUsage[limit.app_name] || 0;
  const isOver = isBlocked;
  const isWarn = !isOver && used >= limit.daily_limit_seconds * 0.8;
  const pct = limit.daily_limit_seconds > 0 ? Math.min(used / limit.daily_limit_seconds, 1) : 0;
  const sc = isOver ? "#f87171" : isWarn ? "#fbbf24" : limit.is_enabled ? "#4ade80" : "#475569";
  const sl = isOver ? "Blocked" : isWarn ? "Warning" : limit.is_enabled ? "Active" : "Paused";
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(20,25,45,0.9)" : "rgba(15,18,34,0.7)",
        border: `1px solid ${isOver ? "rgba(248,113,113,0.25)" : isWarn ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 20, padding: "20px 22px", backdropFilter: "blur(20px)",
        transition: "all 0.2s ease", transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 8px 32px rgba(0,0,0,0.3)" : "none"
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AppIcon appName={limit.app_name} category="other" size={42} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f8fafc", lineHeight: 1 }}>{limit.app_name.replace(".exe", "")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}` }} />
              <span style={{ fontSize: 11, color: sc, fontWeight: 500 }}>{sl}</span>
            </div>
          </div>
        </div>
        <LimitRing used={used} limit={limit.daily_limit_seconds} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#475569" }}>{fmtTime(used)} used</span>
          <span style={{ fontSize: 11, color: "#475569" }}>limit: {fmtTime(limit.daily_limit_seconds)}</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4, width: `${pct * 100}%`,
            background: isOver ? "linear-gradient(90deg,#f87171,#ef4444)" : isWarn ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#4ade80,#22d3ee)",
            boxShadow: `0 0 6px ${sc}80`, transition: "width 1s cubic-bezier(0.34,1.56,0.64,1)"
          }} />
        </div>
        {isOver && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>⛔ Daily limit reached — app is blocked</div>}
        {isWarn && !isOver && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6 }}>⚠️ Approaching daily limit</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onToggle(limit.app_name, !limit.is_enabled)}
          style={{
            flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
            fontFamily: "'DM Sans',sans-serif", background: limit.is_enabled ? "rgba(74,222,128,0.1)" : "rgba(255, 255, 255, 0.05)",
            color: limit.is_enabled ? "#4ade80" : "#64748b"
          }}>
          {limit.is_enabled ? "⏸ Pause" : "▶ Enable"}
        </button>
        <button onClick={() => onEdit(limit)}
          style={{
            flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: "rgba(96,165,250,0.1)", color: "#60a5fa", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>
          ✏️ Edit
        </button>
        {isOver && (
          <button onClick={() => onUnblock(limit.app_name)}
            style={{
              flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
              background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
            }}>
            🔓 Unblock
          </button>
        )}
        <button onClick={() => onDelete(limit.app_name)}
          style={{
            width: 34, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 13, fontFamily: "'DM Sans',sans-serif"
          }}>✕</button>
      </div>
    </div>
  );
}

// ─── LIMIT MODAL ─────────────────────────────────────────────────────────────
function LimitModal({ onClose, onSave, knownApps, editTarget, BASE }) {
  const [app, setApp] = useState(editTarget?.app_name || "");
  const [h, setH] = useState(editTarget ? Math.floor(editTarget.daily_limit_seconds / 3600) : "");
  const [m, setM] = useState(editTarget ? Math.floor((editTarget.daily_limit_seconds % 3600) / 60) : "");
  const [saving, setSaving] = useState(false);
  const [systemApps, setSystemApps] = useState([]);
  const [showD, setShowD] = useState(false);
  const [query, setQuery] = useState(editTarget?.app_name?.replace(".exe", "") || "");

  useEffect(() => {
    if (editTarget || !BASE) return;
    fetch(`${BASE}/api/system/apps`).then(r => r.json()).then(data => setSystemApps(data.apps || [])).catch(() => setSystemApps([]));
  }, [BASE, editTarget]);

  const filtered = query.trim().length > 1 ? systemApps.filter(a =>
    (a.name && a.name.toLowerCase().includes(query.toLowerCase())) ||
    (a.exe && a.exe.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 8) : [];
  const secs = (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60;
  const targetApp = app || (query.trim().length > 0 ? (query.trim().toLowerCase().endsWith(".exe") ? query.trim() : query.trim() + ".exe") : "");
  const ok = targetApp.length > 0 && secs > 0;
  const save = async () => {
    if (!ok) return;
    setSaving(true);
    const name = targetApp.toLowerCase().replace(/\s+/g, "");
    await onSave(name, secs);
    setSaving(false);
    onClose();
  };
  const inp = {
    background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
    color: "#f8fafc", padding: "10px 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: "none", width: "100%"
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)"
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "rgba(12,15,28,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24,
        padding: "32px", width: 420, maxWidth: "90vw", boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        animation: "modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", lineHeight: 1 }}>
              {editTarget ? "Edit Limit" : "Set App Limit"}
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Define daily usage boundary</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: "none",
            background: "rgba(255, 255, 255, 0.06)", color: "#64748b", cursor: "pointer", fontSize: 16
          }}>✕</button>
        </div>
        <div style={{ marginBottom: 20, position: "relative" }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>App Name</div>
          <div style={{ position: "relative" }}>
            <input value={query} onChange={e => { setQuery(e.target.value); setShowD(true); if (!editTarget) setApp(""); }}
              placeholder="Search app or type .exe name"
              disabled={!!editTarget} style={{ ...inp, opacity: editTarget ? 0.5 : 1, cursor: editTarget ? "not-allowed" : "text" }}
              onFocus={e => { e.target.style.border = "1px solid rgba(74,222,128,0.4)"; setShowD(true); }}
              onBlur={e => {
                e.target.style.border = "1px solid rgba(255,255,255,0.1)";
                setTimeout(() => setShowD(false), 200);
              }} />
            {showD && filtered.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 110,
                background: "rgba(15,18,34,0.95)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, overflow: "hidden", backdropFilter: "blur(20px)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
              }}>
                {filtered.map(a => (
                  <div key={a.appid + a.name} onClick={() => {
                    setQuery(a.name);
                    setApp(a.exe || a.name.toLowerCase().replace(/\s+/g, "") + ".exe");
                    setShowD(false);
                  }}
                    style={{
                      padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                      alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)",
                      background: "transparent", transition: "all 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(74,222,128,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 13, color: "#f8fafc", fontWeight: 500 }}>{a.name}</span>
                    <span style={{ fontSize: 11, color: "#475569" }}>{a.exe || "auto-detect"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!editTarget && app && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#4ade80", display: "flex", alignItems: "center", gap: 6 }}>
              <span>Target: <strong>{app}</strong></span>
            </div>
          )}
          {!editTarget && knownApps.length > 0 && !app && query.length === 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {knownApps.slice(0, 6).map(a => (
                <button key={a} onClick={() => { setApp(a); setQuery(a.replace(".exe", "")); }}
                  style={{
                    padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif", border: "1px solid rgba(255,255,255,0.08)",
                    background: app === a ? "rgba(74,222,128,0.12)" : "rgba(255, 255, 255, 0.04)",
                    color: app === a ? "#4ade80" : "#64748b", transition: "all 0.15s"
                  }}>
                  {a.replace(".exe", "")}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Daily Limit</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input type="number" min="0" max="23" value={h} onChange={e => setH(e.target.value)} placeholder="0"
                style={{ ...inp, paddingRight: 36 }}
                onFocus={e => e.target.style.border = "1px solid rgba(74,222,128,0.4)"}
                onBlur={e => e.target.style.border = "1px solid rgba(255,255,255,0.1)"} />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569" }}>h</span>
            </div>
            <span style={{ color: "#e2e8f0", fontSize: 18 }}>:</span>
            <div style={{ flex: 1, position: "relative" }}>
              <input type="number" min="0" max="59" value={m} onChange={e => setM(e.target.value)} placeholder="0"
                style={{ ...inp, paddingRight: 36 }}
                onFocus={e => e.target.style.border = "1px solid rgba(74,222,128,0.4)"}
                onBlur={e => e.target.style.border = "1px solid rgba(255,255,255,0.1)"} />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569" }}>m</span>
            </div>
          </div>
          {secs > 0 && <div style={{ fontSize: 12, color: "#4ade80", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            Limit set to {fmtTime(secs)}
          </div>}
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#e2e8f0", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick presets</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[[0, 30, "30m"], [1, 0, "1h"], [2, 0, "2h"], [3, 0, "3h"]].map(([ph, pm, label]) => (
              <button key={label} onClick={() => { setH(ph); setM(pm); }}
                style={{
                  padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255, 255, 255, 0.04)", color: "#64748b", fontSize: 12, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif"
                }}>{label}</button>
            ))}
          </div>
        </div>
        <button onClick={save} disabled={!ok || saving}
          style={{
            width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: ok ? "pointer" : "not-allowed",
            background: ok ? "linear-gradient(135deg,#4ade80,#22d3ee)" : "rgba(255, 255, 255, 0.05)",
            color: ok ? "#080b14" : "#e2e8f0", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
            boxShadow: ok ? "0 0 20px rgba(74,222,128,0.3)" : "none", transition: "all 0.2s"
          }}>
          {saving ? "Saving..." : (editTarget ? "Update Limit" : "Set Limit")}
        </button>
      </div>
    </div>
  );
}

// ─── UNBLOCK MODAL ────────────────────────────────────────────────────────────
function UnblockModal({ appName, onClose, onUnblock }) {
  const [mins, setMins] = useState(30);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)"
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "rgba(12,15,28,0.98)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 24,
        padding: "32px", width: 360, maxWidth: "90vw", boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        animation: "modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔓</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", marginBottom: 6 }}>Temporary Unblock</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Allow <strong style={{ color: "#fbbf24" }}>{appName.replace(".exe", "")}</strong> for how long?</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {[15, 30, 60, 120].map(opt => (
            <button key={opt} onClick={() => setMins(opt)}
              style={{
                padding: "14px", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s",
                border: `1px solid ${mins === opt ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.07)"}`,
                background: mins === opt ? "rgba(251,191,36,0.1)" : "rgba(255, 255, 255, 0.04)",
                color: mins === opt ? "#fbbf24" : "#64748b"
              }}>
              {opt < 60 ? `${opt} min` : `${opt / 60} hr`}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255, 255, 255, 0.04)",
            color: "#64748b", fontSize: 14, fontFamily: "'DM Sans',sans-serif"
          }}>Cancel</button>
          <button onClick={() => { onUnblock(appName, mins); onClose(); }}
            style={{
              flex: 1, padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#080b14",
              fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
              boxShadow: "0 0 20px rgba(251,191,36,0.3)"
            }}>Unblock</button>
        </div>
      </div>
    </div>
  );
}

// ─── LIMITS PAGE ─────────────────────────────────────────────────────────────
export default function LimitsPage({ BASE, stats }) {
  const [limits, setLimits] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [view, setView] = useState("limits");
  const [loadingL, setLoadingL] = useState(true);
  const [toast, setToast] = useState(null);

  const usage = stats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});
  const showT = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const fetchAll = useCallback(async () => {
    try {
      const [lr, br] = await Promise.all([
        fetch(`${BASE}/limits/all`).then(r => r.json()),
        fetch(`${BASE}/limits/blocked`).then(r => r.json()),
      ]);
      setLimits(Array.isArray(lr) ? lr : []);
      setBlocked(Array.isArray(br) ? br : []);
    } catch (e) { setLimits([]); setBlocked([]); }
    setLoadingL(false);
  }, [BASE]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 30_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const save = async (name, secs) => {
    await fetch(`${BASE}/limits/set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, limit_seconds: secs }) });
    await fetchAll();
    showT(`Limit set for ${name.replace(".exe", "")}`);
  };
  const toggle = async (name, en) => {
    await fetch(`${BASE}/limits/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, enabled: en }) });
    await fetchAll();
    showT(en ? `Enabled` : `Paused`);
  };
  const del = async (name) => {
    await fetch(`${BASE}/limits/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name }) });
    await fetchAll();
    showT(`Limit removed`, "warn");
  };
  const unblock = async (name, minutes) => {
    await fetch(`${BASE}/limits/unblock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_name: name, minutes }) });
    await fetchAll();
    showT(`Unblocked for ${minutes}m`, "warn");
  };

  const knownApps = Array.from(new Set(stats.map(s => s.app))).filter(a => !limits.find(l => l.app_name === a));
  const blockedNow = limits.filter(l => blocked.includes(l.app_name) && l.is_enabled);
  const nearLimit = limits.filter(l => { const u = usage[l.app_name] || 0; return u >= l.daily_limit_seconds * 0.8 && u < l.daily_limit_seconds; });
  const displayList = view === "blocked" ? blockedNow : limits;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 200,
          background: toast.type === "warn" ? "rgba(251,191,36,0.12)" : "rgba(74,222,128,0.1)",
          border: `1px solid ${toast.type === "warn" ? "rgba(251,191,36,0.35)" : "rgba(74,222,128,0.3)"}`,
          borderRadius: 12, padding: "12px 20px", color: toast.type === "warn" ? "#fbbf24" : "#4ade80",
          fontSize: 13, fontWeight: 500, backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "modal-in 0.3s ease"
        }}>
          {toast.type === "warn" ? "⚠️ " : "✓ "}{toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 4 }}>
          {[["limits", `All (${limits.length})`], ["blocked", `Blocked (${blockedNow.length})`]].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)}
              style={{
                padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                fontSize: 12, fontWeight: 500, background: view === v ? "rgba(74,222,128,0.1)" : "transparent", color: view === v ? "#4ade80" : "#475569"
              }}>
              {lbl}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditTarget(null); setShowModal(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12,
            border: "1px solid rgba(74,222,128,0.25)", cursor: "pointer", background: "rgba(74,222,128,0.08)",
            color: "#4ade80", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Limit
        </button>
      </div>

      {/* Stats summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {[
          { color: "#4ade80", bg: "rgba(74,222,128,0.06)", border: "rgba(74,222,128,0.15)", label: "Active Limits", val: limits.filter(l => l.is_enabled).length, sub: `${limits.length} total configured` },
          { color: "#f87171", bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.15)", label: "Blocked Now", val: blockedNow.length, sub: "apps hit their limit today" },
          { color: "#fbbf24", bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.15)", label: "Near Limit", val: nearLimit.length, sub: "apps above 80% of limit" }
        ].map(({ color, bg, border, label, val, sub }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{val}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {loadingL ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#e2e8f0", fontSize: 14 }}>Loading limits...</div>
      ) : displayList.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", background: "rgba(15,18,30,0.5)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{view === "blocked" ? "✅" : "🛡️"}</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#475569", marginBottom: 8 }}>
            {view === "blocked" ? "No apps blocked right now" : "No limits configured yet"}
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 24 }}>
            {view === "blocked" ? "All apps are within their daily limits" : "Set limits to take control of your screen time"}
          </div>
          {view === "limits" && (
            <button onClick={() => { setEditTarget(null); setShowModal(true); }}
              style={{
                padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(74,222,128,0.25)",
                background: "rgba(74,222,128,0.08)", color: "#4ade80", cursor: "pointer",
                fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
              }}>+ Set your first limit</button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {displayList.map(l => (
            <LimitCard key={l.app_name} limit={l} onToggle={toggle}
              onEdit={t => { setEditTarget(t); setShowModal(true); }} onDelete={del}
              onUnblock={n => setUnblockTarget(n)} todayUsage={usage} isBlocked={blocked.includes(l.app_name)} />
          ))}
        </div>
      )}

      {/* System block list */}
      {view === "blocked" && blocked.length > 0 && (
        <SectionCard title="System Block List">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {blocked.map((b, i) => {
              const name = b.app_name || b;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 12
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 6px #f87171" }} />
                    <span style={{ fontSize: 14, color: "#f8fafc", fontWeight: 500 }}>{name.replace(".exe", "")}</span>
                  </div>
                  <button onClick={() => setUnblockTarget(name)}
                    style={{
                      padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
                    }}>
                    🔓 Unblock
                  </button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {showModal && <LimitModal onClose={() => { setShowModal(false); setEditTarget(null); }} onSave={save} knownApps={knownApps} editTarget={editTarget} BASE={BASE} />}
      {unblockTarget && <UnblockModal appName={unblockTarget} onClose={() => setUnblockTarget(null)} onUnblock={unblock} />}
    </div>
  );
}

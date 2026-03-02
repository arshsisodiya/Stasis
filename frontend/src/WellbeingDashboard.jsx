import { useState, useEffect, useRef, useCallback } from "react";
import SettingsPage from "./pages/SettingsPage";
import OverviewPage from "./pages/OverviewPage";
import AppsPage from "./pages/AppsPage";
import ActivityPage from "./pages/ActivityPage";
import LimitsPage from "./pages/LimitsPage";
import { Skeleton, SkeletonCard, TabPanel } from "./shared/components";
import { localYMD, yesterday, fmtTime, fmtTimeFull } from "./shared/utils";
import { useCountUp, useLiveClock } from "./shared/hooks";

// ─── DATE NAVIGATOR ───────────────────────────────────────────────────────────
function DateNavigator({ selectedDate, onChange, availableDates, heatmap }) {
  const today = localYMD();
  const dateSet = new Set(availableDates);
  const sorted = [...availableDates].sort();
  const days = Array.from({ length: 14 }, (_, i) => {
    const we = new Date(selectedDate + "T12:00:00"); we.setDate(we.getDate() + 6);
    const ce = we > new Date(today + "T12:00:00") ? new Date(today + "T12:00:00") : we;
    const s = new Date(ce); s.setDate(s.getDate() - 13 + i);
    return localYMD(s);
  });
  const prev = () => { const e = sorted.filter(d => d < selectedDate); if (e.length) onChange(e[e.length - 1]); };
  const next = () => { const l = sorted.filter(d => d > selectedDate && d <= today); if (l.length) onChange(l[0]); };
  const canP = sorted.some(d => d < selectedDate), canN = sorted.some(d => d > selectedDate && d <= today);

  const dotColor = (d) => {
    const entry = heatmap?.[d];
    if (!entry) return null;
    const { screenTime, productivityPct } = entry;
    const intensity = screenTime < 1800 ? 0.4 : screenTime < 7200 ? 0.7 : 1.0;
    if (productivityPct >= 50) return `rgba(52,211,153,${intensity})`;
    if (productivityPct >= 25) return `rgba(251,191,36,${intensity})`;
    return `rgba(148,163,184,${intensity})`;
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, background: "rgba(15,18,30,0.6)",
      border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "8px 12px", backdropFilter: "blur(20px)"
    }}>
      <button onClick={prev} disabled={!canP} style={{
        width: 26, height: 26, borderRadius: 7, border: "none", fontSize: 15, flexShrink: 0,
        background: canP ? "rgba(255, 255, 255, 0.06)" : "transparent", color: canP ? "#475569" : "rgba(255, 255, 255, 0.12)",
        cursor: canP ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center"
      }}>‹</button>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
        {days.map(d => {
          const has = dateSet.has(d), isSel = d === selectedDate, isT = d === today;
          const p = new Date(d + "T12:00:00");
          const dc = dotColor(d);
          const isGlowing = isSel && dc;
          return (
            <button key={d} onClick={() => has && onChange(d)} disabled={!has}
              title={!has ? "No data tracked" : undefined}
              style={{
                flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                padding: "5px 7px", borderRadius: 8, minWidth: 36,
                border: isSel ? "1px solid rgba(74,222,128,0.4)" : isT ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                background: isSel ? "rgba(74,222,128,0.12)" : "transparent", cursor: has ? "pointer" : "default",
                opacity: has ? 1 : 0.35, transition: "all 0.2s"
              }}>
              <span style={{ fontSize: 8, color: isSel ? "#4ade80" : "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                {p.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? "#4ade80" : has ? "#e2e8f0" : "rgba(255, 255, 255, 0.12)", lineHeight: 1.2 }}>
                {p.toLocaleDateString("en-US", { day: "numeric" })}
              </span>
              <span style={{ fontSize: 8, color: isSel ? "#4ade8088" : "#e2e8f0", textTransform: "uppercase" }}>
                {p.toLocaleDateString("en-US", { month: "short" })}
              </span>
              {has
                ? <div style={{
                  width: 6, height: 6, borderRadius: "50%", marginTop: 2,
                  background: dc || "rgba(74,222,128,0.4)",
                  boxShadow: isGlowing ? `0 0 8px ${dc}` : dc ? `0 0 4px ${dc}88` : "none",
                  transition: "background 0.3s, box-shadow 0.3s",
                }} />
                : <div style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 2, border: "1px solid rgba(255,255,255,0.12)", background: "transparent" }} />
              }
            </button>
          );
        })}
      </div>
      <button onClick={next} disabled={!canN} style={{
        width: 30, height: 30, borderRadius: 8, border: "none", fontSize: 16, flexShrink: 0,
        background: canN ? "rgba(255, 255, 255, 0.06)" : "transparent", color: canN ? "#475569" : "rgba(255, 255, 255, 0.12)",
        cursor: canN ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center"
      }}>›</button>
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      minHeight: "100vh", background: "#080b14", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans',sans-serif"
    }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 24, animation: "float 3s ease-in-out infinite" }}>🌱</div>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#f8fafc", marginBottom: 12, fontWeight: 400 }}>
          No data yet
        </h2>
        <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          The tracker hasn't recorded any activity yet. Make sure <strong style={{ color: "#475569" }}>main.py</strong> is running
          and <strong style={{ color: "#475569" }}>api_server.py</strong> is active on port 7432.
        </p>
        <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 16, padding: "16px 20px", textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Quick start</div>
          {["python main.py", "python api_server.py", "npm run dev"].map(cmd => (
            <div key={cmd} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#e2e8f0", fontSize: 12 }}>$</span>
              <code style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{cmd}</code>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.reload()}
          style={{
            marginTop: 20, padding: "10px 24px", borderRadius: 12, border: "1px solid rgba(74,222,128,0.25)",
            background: "rgba(74,222,128,0.08)", color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif"
          }}>
          Retry
        </button>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function WellbeingDashboard({ onDisconnect, initialData = null }) {
  const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

  const [data, setData] = useState(null);
  const [stats, setStats] = useState([]);
  const [prevStats, setPrevStats] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [focusData, setFocusData] = useState(null);
  const [limits, setLimits] = useState([]);
  const [loading, setLoading] = useState(!initialData);
  const [noData, setNoData] = useState(false);
  const [mounted, setMounted] = useState(!!initialData);
  const [activeTab, setActiveTab] = useState("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDate, setSelectedDate] = useState(localYMD());
  const [availableDates, setAvailableDates] = useState([]);
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [heatmapData, setHeatmapData] = useState({});
  const [ignoredApps, setIgnoredApps] = useState(new Set());
  // Version fetched from API (same as SettingsPage — never hardcoded)
  const [appVersion, setAppVersion] = useState(null);

  const { elapsed, isToday } = useLiveClock(selectedDate);

  // Keyboard shortcuts
  useEffect(() => {
    const TABS = ["overview", "apps", "activity", "limits"];
    const handler = e => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= TABS.length && !e.ctrlKey && !e.metaKey && !e.altKey
        && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        setActiveTab(TABS[n - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Fetch version from API (same endpoint as SettingsPage)
  useEffect(() => {
    fetch(`${BASE}/api/update/status`)
      .then(r => r.json())
      .then(d => { if (d?.current_version) setAppVersion(d.current_version); })
      .catch(() => { });
  }, [BASE]);

  const cache = useRef((() => {
    if (initialData) {
      const today = localYMD();
      return { [today]: { ...initialData, fetchedAt: Date.now() } };
    }
    return {};
  })());
  const inflight = useRef({});

  const applyData = useCallback((entry) => {
    const { wb, ds, hr, fc, prev, lim } = entry;
    if (!wb || wb.error || wb.totalScreenTime === 0 || (!wb.totalScreenTime && !ds.length)) {
      setData({ totalScreenTime: 0, totalIdleTime: 0, totalKeystrokes: 0, totalClicks: 0, totalSessions: 0, productivityPercent: 0, mostUsedApp: 'N/A' });
      setStats([]); setHourly(new Array(24).fill(0)); setFocusData({ score: 0 });
      setPrevStats([]); setLimits([]); setTrackedSeconds(0);
      setNoData(false); setLoading(false);
      setTimeout(() => setMounted(true), 100);
      return;
    }
    setNoData(false);
    setData(wb); setStats(ds); setHourly(hr); setFocusData(fc);
    setPrevStats(Array.isArray(prev) ? prev : []);
    setLimits(Array.isArray(lim) ? lim : []);
    setTrackedSeconds(wb.totalScreenTime || 0);
    setLoading(false);
    setTimeout(() => setMounted(true), 100);
  }, []);

  const fetchDate = useCallback(async (date) => {
    if (inflight.current[date]) return inflight.current[date];
    const yd = yesterday(date);
    const promise = Promise.all([
      fetch(`${BASE}/api/wellbeing?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/daily-stats?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/hourly?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/focus?date=${date}`).then(r => r.json()),
      fetch(`${BASE}/api/daily-stats?date=${yd}`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/limits/all`).then(r => r.json()).catch(() => []),
    ]).then(([wb, ds, hr, fc, prev, lim]) => {
      const entry = { wb, ds, hr, fc, prev, lim, fetchedAt: Date.now() };
      cache.current[date] = entry;
      delete inflight.current[date];
      return entry;
    }).catch(err => {
      delete inflight.current[date];
      throw err;
    });
    inflight.current[date] = promise;
    return promise;
  }, [BASE]);

  const prefetchNeighbors = useCallback((date, allDates) => {
    const idx = allDates.indexOf(date);
    const neighbors = [allDates[idx - 1], allDates[idx + 1]].filter(Boolean);
    neighbors.forEach(d => {
      if (!cache.current[d] && !inflight.current[d]) {
        fetchDate(d).catch(() => { });
      }
    });
  }, [fetchDate]);

  useEffect(() => {
    fetch(`${BASE}/api/available-dates`).then(r => r.json()).then(d => setAvailableDates(d))
      .catch(() => setAvailableDates([localYMD()]));
    fetch(`${BASE}/api/heatmap`).then(r => r.json()).then(d => setHeatmapData(d)).catch(() => { });
    fetch(`${BASE}/api/ignored-apps`).then(r => r.json()).then(d => {
      setIgnoredApps(new Set((Array.isArray(d) ? d : []).map(a => a.toLowerCase())));
    }).catch(() => { });
  }, []);

  useEffect(() => {
    const today = localYMD();
    const isTodayView = selectedDate === today;
    const CACHE_TTL = isTodayView ? 60_000 : Infinity;
    const cached = cache.current[selectedDate];
    const cacheValid = cached && (Date.now() - cached.fetchedAt) < CACHE_TTL;

    if (cacheValid) {
      applyData(cached);
    } else {
      if (!data) setLoading(true);
      fetchDate(selectedDate)
        .then(applyData)
        .catch(err => {
          if (err instanceof TypeError && onDisconnect) {
            onDisconnect();
          } else {
            setNoData(true);
            setLoading(false);
          }
        });
    }

    if (availableDates.length > 0) {
      const t = setTimeout(() => prefetchNeighbors(selectedDate, availableDates), 800);
      return () => clearTimeout(t);
    }
  }, [selectedDate, availableDates]);

  useEffect(() => {
    const today = localYMD();
    if (selectedDate !== today) return;
    const iv = setInterval(async () => {
      try {
        delete cache.current[today];
        const entry = await fetchDate(today);
        if (selectedDate === today) applyData(entry);
      } catch (err) {
        if (err instanceof TypeError && onDisconnect) onDisconnect();
      }
    }, 60_000);
    return () => clearInterval(iv);
  }, [selectedDate, fetchDate, applyData]);

  // Derived values
  const peakHour = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
  const countKey = `${selectedDate}-${activeTab}`;

  // Merge focusData into data for OverviewPage
  const enrichedData = data ? {
    ...data,
    focusScore: focusData?.score ?? 0,
    deepWorkSeconds: focusData?.deepWorkSeconds ?? 0,
  } : null;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "apps", label: "Apps" },
    { id: "activity", label: "Activity" },
    { id: "limits", label: "🛡️ Limits", accent: "#60a5fa" },
  ];

  if (loading) return null; // Loading screen overlay handles this — no skeleton flash

  if (noData) return <EmptyState />;

  return (
    <div style={{
      height: "100vh", width: "100%", background: "#080b14", fontFamily: "'DM Sans',sans-serif",
      color: "#e2e8f0", position: "relative", overflow: "hidden",
      animation: "db-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
    }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{width:100%;height:100vh;margin:0;padding:0;overflow:hidden;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
        @keyframes pulse-glow{0%,100%{opacity:0.15;}50%{opacity:0.28;}}
        @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}
        @keyframes modal-in{from{opacity:0;transform:scale(0.92) translateY(16px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes banner-in{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
        @keyframes tick{from{opacity:0.6;}to{opacity:1;}}
        @keyframes drawer-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes drawer-slide-in { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes card-fade-in { from{opacity:0;transform:translateY(12px) scale(0.99);} to{opacity:1;transform:none;} }
        @keyframes center-fade-in { from{opacity:0;transform:scale(0.88) translateY(4px);} to{opacity:1;transform:scale(1) translateY(0);} }
        @keyframes legend-slide-in { from{opacity:0;transform:translateX(10px);} to{opacity:1;transform:translateX(0);} }
        @keyframes db-enter { from{opacity:0;transform:scale(1.015);filter:blur(3px);} to{opacity:1;transform:scale(1);filter:blur(0);} }
        .orb-float{animation:float 8s ease-in-out infinite;}
        .orb-float-2{animation:float 11s ease-in-out infinite reverse;}
        .tab-btn{padding:8px 16px;border-radius:10px;border:1px solid transparent;background:transparent;
          color:#475569;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;
          transition:all 0.25s ease;letter-spacing:0.02em;}
        .tab-btn:hover{color:#94a3b8;background:rgba(255,255,255,0.04);}
        .tab-btn.active-green{color:#4ade80!important;background:rgba(74,222,128,0.1)!important;border-color:rgba(74,222,128,0.25)!important;}
        .tab-btn.active-blue{color:#60a5fa!important;background:rgba(96,165,250,0.1)!important;border-color:rgba(96,165,250,0.25)!important;}
        .kbd-hint{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:10px;color:#334155;margin-left:6px;}
        .metric-card{animation:card-fade-in 0.45s cubic-bezier(0.34,1.2,0.64,1) both;}
        .db-scroll-wrapper::-webkit-scrollbar{width:4px;}
        .db-scroll-wrapper::-webkit-scrollbar-track{background:transparent;}
        .db-scroll-wrapper::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
        @media(max-width:900px){
          .grid-4{grid-template-columns:1fr 1fr!important;}
          .grid-4-sm{grid-template-columns:1fr 1fr!important;}
        }
        @media(max-width:600px){
          .grid-4{grid-template-columns:1fr!important;}
          .grid-4-sm{grid-template-columns:1fr 1fr!important;}
          .header-row{flex-direction:column!important;gap:16px!important;}
          .tab-group{width:100%!important;justify-content:center!important;}
        }
      `}</style>

      {/* ── SCROLLABLE AREA ── */}
      <div className="db-scroll-wrapper" style={{ height: "100%", width: "100%", overflowY: "auto", overflowX: "hidden" }}>
        {/* Ambient orbs */}
        <div className="orb-float" style={{
          position: "fixed", top: "-10%", left: "-5%", width: 500, height: 500,
          borderRadius: "50%", pointerEvents: "none", zIndex: 0, transition: "background 1.2s ease",
          background: activeTab === "limits" ? "radial-gradient(circle,rgba(251,191,36,0.1) 0%,transparent 70%)" : activeTab === "apps" ? "radial-gradient(circle,rgba(96,165,250,0.12) 0%,transparent 70%)" : "radial-gradient(circle,rgba(74,222,128,0.12) 0%,transparent 70%)"
        }} />
        <div className="orb-float-2" style={{
          position: "fixed", bottom: "-10%", right: "-5%", width: 600, height: 600,
          borderRadius: "50%", pointerEvents: "none", zIndex: 0, transition: "background 1.2s ease",
          background: activeTab === "activity" ? "radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)" : activeTab === "limits" ? "radial-gradient(circle,rgba(248,113,113,0.09) 0%,transparent 70%)" : "radial-gradient(circle,rgba(96,165,250,0.1) 0%,transparent 70%)"
        }} />
        <div style={{
          position: "fixed", top: "40%", right: "20%", width: 300, height: 300, borderRadius: "50%",
          pointerEvents: "none", zIndex: 0, animation: "pulse-glow 6s ease-in-out infinite", transition: "background 1.2s ease",
          background: activeTab === "activity" ? "radial-gradient(circle,rgba(244,114,182,0.1) 0%,transparent 70%)" : "radial-gradient(circle,rgba(244,114,182,0.07) 0%,transparent 70%)"
        }} />

        <div style={{
          position: "relative", zIndex: 1, maxWidth: 1200, width: "100%", margin: "0 auto", padding: "32px 24px",
          opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(20px)", transition: "opacity 0.7s ease,transform 0.7s ease"
        }}>

          {/* ── HEADER ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 36 }}>
            <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              {/* Brand */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%", background: isToday ? "#4ade80" : "#60a5fa",
                    boxShadow: isToday ? "0 0 10px #4ade80" : "0 0 10px #60a5fa", animation: "pulse-glow 2s ease infinite", flexShrink: 0
                  }} />
                  <span style={{ fontSize: 11, color: isToday ? "#4ade80" : "#60a5fa", textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>
                    {isToday ? "Live Tracking" : "Historical View"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 0, lineHeight: 1 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 40, fontWeight: 400, color: "#f8fafc", lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}>
                    Sta<em style={{ color: "#4ade80", fontStyle: "italic" }}>sis</em>
                  </h1>
                  <span style={{ fontSize: 12, color: "#2d3e52", marginLeft: 10, fontWeight: 400, fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.05em", alignSelf: "flex-end", paddingBottom: 3 }}>
                    Your Focus Core
                  </span>
                </div>
              </div>

              {/* Tabs + Hamburger */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="tab-group" style={{ display: "flex", gap: 4, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 4 }}>
                  {TABS.map((t, i) => (
                    <button key={t.id}
                      className={`tab-btn ${activeTab === t.id ? (t.accent ? "active-blue" : "active-green") : ""}`}
                      onClick={() => setActiveTab(t.id)}
                      title={`Press ${i + 1}`}>
                      {t.label}
                      <span className="kbd-hint">{i + 1}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowSettings("drawer")} title="Menu"
                  style={{
                    width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255, 255, 255, 0.04)", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 5, padding: 0, flexShrink: 0, transition: "all 0.2s ease"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}>
                  {[18, 14, 18].map((w, i) => (
                    <span key={i} style={{ display: "block", borderRadius: 2, background: "#64748b", width: w, height: 2, transition: "all 0.2s" }} />
                  ))}
                </button>
              </div>
            </div>

            {/* Context line */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#475569" }}>
                {activeTab === "limits" ? "App time limits & blocking" :
                  new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </span>
              {isToday && activeTab !== "limits" && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
                  color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
                  borderRadius: 8, padding: "3px 10px", fontWeight: 500
                }}>
                  tracked {fmtTime(trackedSeconds)} today
                </span>
              )}
              {isToday && (
                <span style={{
                  fontSize: 12, color: "#475569", fontFamily: "monospace",
                  animation: "tick 1s ease infinite alternate",
                  background: "rgba(255, 255, 255, 0.05)", padding: "3px 10px", borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.09)", letterSpacing: "0.05em"
                }}>
                  {fmtTimeFull(elapsed)}
                </span>
              )}
            </div>

            {activeTab !== "limits" && (
              <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} availableDates={availableDates} heatmap={heatmapData} />
            )}
          </div>

          {/* ── OVERVIEW ── */}
          <TabPanel active={activeTab === "overview"}>
            <OverviewPage
              data={enrichedData}
              stats={stats}
              prevStats={prevStats}
              limits={limits}
              hourly={hourly}
              peakHour={peakHour}
              countKey={countKey}
              selectedDate={selectedDate}
              onGoToLimits={() => setActiveTab("limits")}
            />
          </TabPanel>

          {/* ── APPS ── */}
          <TabPanel active={activeTab === "apps"}>
            <AppsPage
              BASE={BASE}
              stats={stats}
              prevStats={prevStats}
              selectedDate={selectedDate}
              ignoredApps={ignoredApps}
            />
          </TabPanel>

          {/* ── ACTIVITY ── */}
          <TabPanel active={activeTab === "activity"}>
            <ActivityPage
              BASE={BASE}
              selectedDate={selectedDate}
              data={data || { totalScreenTime: 0, totalSessions: 0, totalKeystrokes: 0, totalClicks: 0 }}
              stats={stats}
              prevStats={prevStats}
              hourly={hourly}
              peakHour={peakHour}
              countKey={countKey}
            />
          </TabPanel>

          {/* ── LIMITS ── */}
          <TabPanel active={activeTab === "limits"}>
            <LimitsPage BASE={BASE} stats={stats} />
          </TabPanel>

          {/* Footer */}
          <div style={{
            textAlign: "center", marginTop: 40, fontSize: 11, color: "#1e293b", display: "flex",
            alignItems: "center", justifyContent: "center", gap: 16
          }}>
            <span style={{ letterSpacing: "0.04em" }}>Stasis · Your Focus Core</span>
            <span style={{ color: "#1a2035" }}>·</span>
            <span>Press 1–4 to switch tabs</span>
          </div>
        </div>
      </div>

      {/* ── HAMBURGER DRAWER ── */}
      {showSettings === "drawer" && (
        <>
          <div onClick={() => setShowSettings(null)}
            style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", animation: "drawer-fade-in 0.22s ease" }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 160, width: 280,
            background: "rgba(8, 11, 20, 0.97)", borderLeft: "1px solid rgba(255,255,255,0.08)",
            display: "flex", flexDirection: "column",
            boxShadow: "-24px 0 80px rgba(15,18,34,0.7)",
            animation: "drawer-slide-in 0.28s cubic-bezier(0.34,1.1,0.64,1)"
          }}>
            {/* Drawer header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", lineHeight: 1, letterSpacing: "-0.02em" }}>
                  Sta<span style={{ color: "#4ade80", fontStyle: "italic" }}>sis</span>
                </div>
                <div style={{ fontSize: 10, color: "#2d3d52", marginTop: 4, letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 500 }}>Your Focus Core</div>
              </div>
              <button onClick={() => setShowSettings(null)}
                style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255, 255, 255, 0.04)", color: "#475569", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Drawer menu items */}
            <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
              {[
                { icon: "⚙️", label: "General Settings", sub: "Tracking & app preferences", section: "general" },
                { icon: "✈️", label: "Telegram Integration", sub: "Remote control setup", section: "telegram" },
                { icon: "🔐", label: "Security", sub: "Encryption & access control", section: "security" },
                { icon: "ℹ️", label: "About & Privacy", sub: "About, licenses, policy", section: "about" },
                { icon: "🚀", label: "Updates", sub: "Version & changelog", section: "updates", },

              ].map(({ icon, label, sub, section }) => (
                <button key={section}
                  onClick={() => setShowSettings(section)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                    background: "transparent", color: "#475569", transition: "all 0.15s ease"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; e.currentTarget.style.color = "#f8fafc"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#475569"; }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#e2e8f0", marginTop: 2 }}>{sub}</div>
                  </div>
                  <span style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.12)" }}>›</span>
                </button>
              ))}
            </nav>

            {/* Drawer footer — version fetched from API, never hardcoded */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Stasis{appVersion ? ` v${appVersion}` : ""}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.1)", letterSpacing: "0.04em" }}>Wellbeing &amp; Remote Sync</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SETTINGS PAGE (full modal) ── */}
      {showSettings && showSettings !== "drawer" && (
        <SettingsPage
          initialSection={showSettings}
          onClose={() => setShowSettings(null)}
        />
      )}
    </div>
  );
}

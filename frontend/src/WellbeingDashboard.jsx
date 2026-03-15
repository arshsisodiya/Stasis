import { useState, useEffect, useRef, useCallback, useReducer, memo, useMemo } from "react";
import SettingsPage from "./pages/SettingsPage";
import OverviewPage from "./pages/OverviewPage";
import AppsPage from "./pages/AppsPage";
import ActivityPage from "./pages/ActivityPage";
import LimitsPage from "./pages/LimitsPage";
import GoalsPage from "./pages/GoalsPage";
import WeeklyReportPage from "./pages/WeeklyReportPage";
import DaySummary from "./pages/DaySummary";
import { Skeleton, SkeletonCard, TabPanel, AppIcon } from "./shared/components";
import { localYMD, yesterday, fmtTime, fmtTimeFull } from "./shared/utils";
import { useCountUp, useLiveClock } from "./shared/hooks";

// ─── useReducer — atomic state for all dashboard data ─────────────────────────
const initialDashState = {
  data: null, stats: [], prevStats: [], prevWellbeing: null,
  hourly: [], focusData: null, limits: [], trackedSeconds: 0,
  loading: true, noData: false, mounted: false,
};

function dashReducer(state, action) {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, loading: true, noData: false };
    case "LOAD_EMPTY":
      return {
        ...state,
        data: { totalScreenTime: 0, totalIdleTime: 0, totalKeystrokes: 0, totalClicks: 0, totalSessions: 0, productivityPercent: 0, mostUsedApp: "N/A" },
        stats: [], hourly: new Array(24).fill(0), focusData: { score: 0 },
        prevStats: [], prevWellbeing: null, limits: [], trackedSeconds: 0,
        loading: false, noData: false, mounted: true,
      };
    case "LOAD_DATA": {
      const { wb, ds, hr, fc, prev, prevWb, lim } = action.payload;
      return {
        ...state,
        data: wb, stats: ds, hourly: hr, focusData: fc,
        prevStats: Array.isArray(prev) ? prev : [],
        prevWellbeing: prevWb && typeof prevWb.totalScreenTime === "number" ? prevWb : null,
        limits: Array.isArray(lim) ? lim : [],
        trackedSeconds: wb.totalScreenTime || 0,
        loading: false, noData: false, mounted: true,
      };
    }
    case "LOAD_ERROR":
      return { ...state, loading: false, noData: true };
    default:
      return state;
  }
}

// ─── NOISE TEXTURE OVERLAY ────────────────────────────────────────────────────
function NoiseOverlay() {
  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: 3, pointerEvents: "none", opacity: 0.03,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundRepeat: "repeat", backgroundSize: "180px 180px",
    }} />
  );
}
const MemoNoiseOverlay = memo(NoiseOverlay);

// ─── ANIMATED TAB PANEL ───────────────────────────────────────────────────────
function AnimatedTabPanel({ active, children }) {
  const [rendered, setRendered] = useState(active);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active) {
      setRendered(true);
      wasActive.current = true;
    } else {
      // keep rendered briefly so fade-out can play; then unmount
      const t = setTimeout(() => { setRendered(false); wasActive.current = false; }, 320);
      return () => clearTimeout(t);
    }
  }, [active]);

  if (!rendered) return null;

  return (
    <div style={{
      opacity: active ? 1 : 0,
      transform: active ? "translateY(0)" : "translateY(8px)",
      transition: active
        ? "opacity 0.32s ease, transform 0.32s cubic-bezier(0.16,1,0.3,1)"
        : "opacity 0.18s ease, transform 0.18s ease",
      willChange: "opacity, transform",
    }}>
      {children}
    </div>
  );
}

// ─── SPARKLINE SVG ────────────────────────────────────────────────────────────
let _sparkUID = 0;
export function Sparkline({ values = [], color = "#4ade80", width = 72, height = 26 }) {
  // Each instance gets a unique gradient ID to avoid SVG defs collisions
  const uid = useRef(`sg${++_sparkUID}`).current;
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: pad + ((1 - (v - min) / range) * (height - pad * 2)),
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${height} L ${pts[0].x.toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} style={{ overflow: "visible", display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
}

// ─── DATE NAVIGATOR ───────────────────────────────────────────────────────────
const DateNavigator = memo(function DateNavigator({ selectedDate, onChange, availableDates, heatmap }) {
  const today = localYMD();
  const dateSet = new Set(availableDates);
  const sorted = [...availableDates].sort();
  const DAY_COUNT = 14;
  const days = Array.from({ length: DAY_COUNT }, (_, i) => {
    const we = new Date(selectedDate + "T12:00:00");
    we.setDate(we.getDate() + Math.floor(DAY_COUNT / 2) - 1);
    const ce = we > new Date(today + "T12:00:00") ? new Date(today + "T12:00:00") : we;
    const s = new Date(ce); s.setDate(s.getDate() - (DAY_COUNT - 1) + i);
    return localYMD(s);
  });
  const prev = () => { const e = sorted.filter(d => d < selectedDate); if (e.length) onChange(e[e.length - 1]); };
  const next = () => { const l = sorted.filter(d => d > selectedDate && d <= today); if (l.length) onChange(l[0]); };
  const canP = sorted.some(d => d < selectedDate);
  const canN = sorted.some(d => d > selectedDate && d <= today);
  const isHistorical = selectedDate !== today;

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
      display: "flex", alignItems: "center", gap: 5,
      background: "rgba(15,18,30,0.95)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "8px 8px", width: "100%",
    }}>
      <button onClick={prev} disabled={!canP} style={{
        width: 26, height: 26, borderRadius: 7, border: "none", fontSize: 15, flexShrink: 0,
        background: canP ? "rgba(255,255,255,0.06)" : "transparent",
        color: canP ? "#64748b" : "rgba(255,255,255,0.1)",
        cursor: canP ? "pointer" : "not-allowed",
        display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, color 0.15s",
      }}>‹</button>

      <div style={{ display: "flex", gap: 2, overflowX: "auto", flex: 1, scrollbarWidth: "none", justifyContent: "space-evenly" }}>
        {days.map(d => {
          const has = dateSet.has(d), isSel = d === selectedDate, isT = d === today;
          const p = new Date(d + "T12:00:00");
          const dc = dotColor(d);
          return (
            <button key={d} onClick={() => has && onChange(d)} disabled={!has}
              title={!has ? "No data tracked" : undefined}
              style={{
                flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                padding: "5px 4px", borderRadius: 8, minWidth: 0, maxWidth: 52,
                border: isSel ? "1px solid rgba(74,222,128,0.4)" : isT ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                background: isSel ? "rgba(74,222,128,0.12)" : "transparent",
                cursor: has ? "pointer" : "default",
                opacity: has ? 1 : 0.3, transition: "background 0.2s, border-color 0.2s, opacity 0.2s",
              }}>
              <span style={{ fontSize: 8, color: isSel ? "#4ade80" : "#475569", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                {p.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? "#4ade80" : has ? "#e2e8f0" : "rgba(255,255,255,0.1)", lineHeight: 1.2 }}>
                {p.toLocaleDateString("en-US", { day: "numeric" })}
              </span>
              <span style={{ fontSize: 8, color: isSel ? "#4ade8080" : "#475569", textTransform: "uppercase" }}>
                {p.toLocaleDateString("en-US", { month: "short" })}
              </span>
              {has
                ? <div style={{ width: 5, height: 5, borderRadius: "50%", marginTop: 2, background: dc || "rgba(74,222,128,0.4)", boxShadow: isSel && dc ? `0 0 6px ${dc}` : "none", transition: "all 0.3s" }} />
                : <div style={{ width: 5, height: 5, borderRadius: "50%", marginTop: 2, border: "1px solid rgba(255,255,255,0.1)" }} />
              }
            </button>
          );
        })}
      </div>

      <button onClick={next} disabled={!canN} style={{
        width: 26, height: 26, borderRadius: 7, border: "none", fontSize: 15, flexShrink: 0,
        background: canN ? "rgba(255,255,255,0.06)" : "transparent",
        color: canN ? "#64748b" : "rgba(255,255,255,0.1)",
        cursor: canN ? "pointer" : "not-allowed",
        display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, color 0.15s",
      }}>›</button>

      {/* "Today ↩" jump — only shown when browsing history */}
      {isHistorical && dateSet.has(today) && (
        <button className="hover-green-outline" onClick={() => onChange(today)} style={{
          flexShrink: 0, padding: "4px 10px", borderRadius: 7,
          border: "1px solid rgba(74,222,128,0.28)", background: "rgba(74,222,128,0.07)",
          color: "#4ade80", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          textTransform: "uppercase", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          whiteSpace: "nowrap", transition: "background 0.2s, border-color 0.2s",
        }}>
          Today ↩
        </button>
      )}
    </div>
  );
});

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ minHeight: "100vh", background: "#080b14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" }}>
      <MemoNoiseOverlay />
      <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 24, animation: "float 3s ease-in-out infinite" }}>🌱</div>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#f8fafc", marginBottom: 12, fontWeight: 400 }}>No data yet</h2>
        <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          The tracker hasn't recorded any activity yet. Make sure <strong style={{ color: "#64748b" }}>main.py</strong> is running and <strong style={{ color: "#64748b" }}>api_server.py</strong> is active on port 7432.
        </p>
        <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 16, padding: "16px 20px", textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Quick start</div>
          {["python main.py", "python api_server.py", "npm run dev"].map(cmd => (
            <div key={cmd} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#475569", fontSize: 12 }}>$</span>
              <code style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{cmd}</code>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.reload()} style={{
          marginTop: 20, padding: "10px 24px", borderRadius: 12, border: "1px solid rgba(74,222,128,0.25)",
          background: "rgba(74,222,128,0.08)", color: "#4ade80", cursor: "pointer", fontSize: 13,
          fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        }}>Retry</button>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function WellbeingDashboard({ onDisconnect, initialData = null }) {
  const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

  const [dashState, dispatch] = useReducer(dashReducer, {
    ...initialDashState,
    loading: !initialData,
    mounted: !!initialData,
  });
  const { data, stats, prevStats, prevWellbeing, hourly, focusData, limits, trackedSeconds, loading, noData, mounted } = dashState;

  const [activeTab, setActiveTab] = useState("overview");
  const [activeInsightTab, setActiveInsightTab] = useState("goals");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDate, setSelectedDate] = useState(localYMD());
  const [availableDates, setAvailableDates] = useState([]);
  const [heatmapData, setHeatmapData] = useState({});
  const [sparkData, setSparkData] = useState({});
  const [ignoredApps, setIgnoredApps] = useState(new Set());
  const [appVersion, setAppVersion] = useState(null);
  const [showYesterdayComparison, setShowYesterdayComparison] = useState(true);

  const scrollRef = useRef(null);
  const { elapsed, isToday } = useLiveClock(selectedDate);

  // Scroll to top on date change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedDate]);

  // Keyboard shortcuts
  useEffect(() => {
    const TABS = ["overview", "apps", "activity", "insights"];
    const handler = e => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= TABS.length && !e.ctrlKey && !e.metaKey && !e.altKey
        && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName))
        setActiveTab(TABS[n - 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Version + settings
  useEffect(() => {
    fetch(`${BASE}/api/init-bundle`).then(r => r.json())
      .then(d => {
        if (d?.updateStatus?.current_version) setAppVersion(d.updateStatus.current_version);
        if (d?.settings?.show_yesterday_comparison !== undefined) setShowYesterdayComparison(d.settings.show_yesterday_comparison);
        if (d?.availableDates) setAvailableDates(d.availableDates);
        if (d?.heatmap) setHeatmapData(d.heatmap);
        if (d?.sparkSeries) setSparkData(d.sparkSeries);
        if (d?.ignoredApps) setIgnoredApps(new Set((Array.isArray(d.ignoredApps) ? d.ignoredApps : []).map(a => a.toLowerCase())));
      }).catch(() => { });
  }, [BASE, showSettings]);

  const cache = useRef(initialData ? { [localYMD()]: { ...initialData, fetchedAt: Date.now() } } : {});
  const inflight = useRef({});

  const applyData = useCallback((entry) => {
    const { wb, ds, hr, fc, prev, prevWb, lim } = entry;
    if (!wb || wb.error || wb.totalScreenTime === 0 || (!wb.totalScreenTime && !ds.length)) {
      dispatch({ type: "LOAD_EMPTY" });
      return;
    }
    dispatch({ type: "LOAD_DATA", payload: { wb, ds, hr, fc, prev, prevWb, lim } });
  }, []);

  const fetchDate = useCallback(async (date) => {
    if (inflight.current[date]) return inflight.current[date];
    const promise = fetch(`${BASE}/api/dashboard-bundle?date=${date}`)
      .then(r => r.json())
      .then(bundle => {
        const entry = {
          wb: bundle.wb, ds: bundle.ds, hr: bundle.hr, fc: bundle.fc,
          prev: bundle.prev, lim: bundle.lim, prevWb: bundle.prevWb,
          fetchedAt: Date.now(),
        };
        cache.current[date] = entry;
        delete inflight.current[date];
        return entry;
      })
      .catch(err => { delete inflight.current[date]; throw err; });
    inflight.current[date] = promise;
    return promise;
  }, [BASE]);

  const prefetchNeighbors = useCallback((date, allDates) => {
    const idx = allDates.indexOf(date);
    [allDates[idx - 1], allDates[idx + 1]].filter(Boolean).forEach(d => {
      if (!cache.current[d] && !inflight.current[d]) fetchDate(d).catch(() => { });
    });
  }, [fetchDate]);

  // init-bundle above handles available-dates, heatmap, spark-series, and ignored-apps

  useEffect(() => {
    const today = localYMD();
    const CACHE_TTL = selectedDate === today ? 60_000 : Infinity;
    const cached = cache.current[selectedDate];
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
      applyData(cached);
    } else {
      if (!data) dispatch({ type: "LOAD_START" });
      fetchDate(selectedDate).then(applyData).catch(err => {
        if (err instanceof TypeError && onDisconnect) onDisconnect();
        else dispatch({ type: "LOAD_ERROR" });
      });
    }
    if (availableDates.length > 0) {
      const t = setTimeout(() => prefetchNeighbors(selectedDate, availableDates), 800);
      return () => clearTimeout(t);
    }
  }, [selectedDate, availableDates]);

  // Live refresh today
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const peakHour = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
  const countKey = `${selectedDate}-${activeTab}`;
  const enrichedData = data ? { ...data, focusScore: focusData?.score ?? 0, deepWorkSeconds: focusData?.deepWorkSeconds ?? 0 } : null;

  // 7-day sparkline series — all metrics sourced from /api/spark-series
  const sparkSeries = (() => {
    const days = Object.keys(sparkData).sort().slice(-7);
    return {
      screenTime: days.map(d => sparkData[d]?.screenTime || 0),
      productivity: days.map(d => sparkData[d]?.productivityPct || 0),
      focus: days.map(d => sparkData[d]?.focusScore || 0),
      inputActivity: days.map(d => sparkData[d]?.inputActivity || 0),
    };
  })();

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "apps", label: "Apps" },
    { id: "activity", label: "Activity" },
    { id: "insights", label: "✨ Insights", accent: true },
  ];

  const INSIGHT_TABS = useMemo(() => ([
    { id: "goals", label: "Goals" },
    { id: "limits", label: "Limits" },
    { id: "reports", label: "Reports" },
  ]), []);

  if (loading) return null;
  if (noData) return <EmptyState />;

  return (
    <div style={{
      height: "100vh", width: "100%", background: "#080b14",
      fontFamily: "'DM Sans',sans-serif", color: "#e2e8f0",
      position: "relative", overflow: "hidden",
      animation: "db-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
    }}>
      <MemoNoiseOverlay />

      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{width:100%;height:100vh;margin:0;padding:0;overflow:hidden;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px;}
        ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.14);}
        @keyframes pulse-glow{0%,100%{opacity:0.15;}50%{opacity:0.3;}}
        @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}
        @keyframes banner-in{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
        @keyframes tick{from{opacity:0.55;}to{opacity:1;}}
        @keyframes drawer-fade-in{from{opacity:0}to{opacity:1}}
        @keyframes drawer-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes card-fade-in{from{opacity:0;transform:translateY(14px) scale(0.98);}to{opacity:1;transform:none;}}
        @keyframes db-enter{from{opacity:0;transform:scale(1.015);filter:blur(3px);}to{opacity:1;transform:scale(1);filter:blur(0);}}
        .orb-float{animation:float 8s ease-in-out infinite;}
        .orb-float-2{animation:float 11s ease-in-out infinite reverse;}
        .tab-btn{padding:7px 14px;border-radius:9px;border:1px solid transparent;background:transparent;
          color:#475569;font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:500;cursor:pointer;
          transition:all 0.22s ease;letter-spacing:0.02em;display:flex;align-items:center;}
        .tab-btn:hover{color:#94a3b8;background:rgba(255,255,255,0.04);}
        .tab-btn.active-green{color:#4ade80!important;background:rgba(74,222,128,0.1)!important;border-color:rgba(74,222,128,0.25)!important;}
        .tab-btn.active-blue{color:#60a5fa!important;background:rgba(96,165,250,0.1)!important;border-color:rgba(96,165,250,0.25)!important;}
        .kbd-hint{display:none;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:9px;color:#334155;margin-left:5px;}
        .tab-group:hover .kbd-hint{display:none;}
        .metric-card{animation:card-fade-in 0.45s cubic-bezier(0.34,1.2,0.64,1) both;}
        .db-scroll-wrapper::-webkit-scrollbar{width:4px;}
        .db-scroll-wrapper::-webkit-scrollbar-track{background:transparent;}
        .db-scroll-wrapper::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px;}
        @media(prefers-reduced-motion:reduce){
          .orb-float,.orb-float-2{animation:none!important;}
          .metric-card,.tab-btn{animation:none!important;transition:none!important;}
        }
        @media(max-width:900px){.grid-4{grid-template-columns:1fr 1fr!important;}.grid-4-sm{grid-template-columns:1fr 1fr!important;}}
        @media(max-width:600px){
          .grid-4{grid-template-columns:1fr!important;}
          .grid-4-sm{grid-template-columns:1fr 1fr!important;}
          .header-row{flex-direction:column!important;gap:16px!important;}
          .tab-group{width:100%!important;justify-content:center!important;}
          .date-bar-row{flex-direction:column!important;}
        }
      `}</style>

      {/* ── AMBIENT ORBS — shift to indigo in historical mode ── */}
      <div className="orb-float" style={{
        position: "fixed", top: "-10%", left: "-5%", width: 500, height: 500,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0, transition: "background 1.4s ease",
        background: !isToday
          ? "radial-gradient(circle,rgba(99,102,241,0.1) 0%,transparent 70%)"
          : (activeTab === "insights" && activeInsightTab === "limits")
            ? "radial-gradient(circle,rgba(251,191,36,0.1) 0%,transparent 70%)"
            : activeTab === "apps"
              ? "radial-gradient(circle,rgba(96,165,250,0.12) 0%,transparent 70%)"
              : "radial-gradient(circle,rgba(74,222,128,0.12) 0%,transparent 70%)",
      }} />
      <div className="orb-float-2" style={{
        position: "fixed", bottom: "-10%", right: "-5%", width: 600, height: 600,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0, transition: "background 1.4s ease",
        background: !isToday
          ? "radial-gradient(circle,rgba(79,70,229,0.08) 0%,transparent 70%)"
          : activeTab === "activity"
            ? "radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)"
            : (activeTab === "insights" && activeInsightTab === "limits")
              ? "radial-gradient(circle,rgba(248,113,113,0.09) 0%,transparent 70%)"
              : "radial-gradient(circle,rgba(96,165,250,0.1) 0%,transparent 70%)",
      }} />
      <div style={{
        position: "fixed", top: "40%", right: "20%", width: 300, height: 300,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        animation: "pulse-glow 6s ease-in-out infinite", transition: "background 1.4s ease",
        background: activeTab === "activity"
          ? "radial-gradient(circle,rgba(244,114,182,0.1) 0%,transparent 70%)"
          : "radial-gradient(circle,rgba(244,114,182,0.055) 0%,transparent 70%)",
      }} />

      {/* ── SCROLLABLE AREA ── */}
      <div ref={scrollRef} className="db-scroll-wrapper"
        style={{ height: "100%", width: "100%", overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 4 }}>
        <div style={{
          maxWidth: 1280, width: "100%", margin: "0 auto", padding: "28px 24px",
          opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(20px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}>

          {/* ── HEADER ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              {/* Brand */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: isToday ? "#4ade80" : "#818cf8",
                    boxShadow: isToday ? "0 0 10px #4ade80" : "0 0 10px #818cf8",
                    animation: "pulse-glow 2s ease infinite", flexShrink: 0,
                    transition: "background 0.8s ease, box-shadow 0.8s ease",
                  }} />
                  <span style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600,
                    color: isToday ? "#4ade80" : "#818cf8",
                    transition: "color 0.8s ease",
                  }}>
                    {isToday ? "Live Tracking" : "Historical View"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, fontWeight: 400, color: "#f8fafc", lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}>
                    Sta<em style={{ color: isToday ? "#4ade80" : "#818cf8", fontStyle: "italic", transition: "color 0.8s ease" }}>sis</em>
                  </h1>
                  <span style={{ fontSize: 12, color: "#1e3a52", marginLeft: 10, fontWeight: 400, letterSpacing: "0.05em", alignSelf: "flex-end", paddingBottom: 3 }}>
                    Your Focus Core
                  </span>
                </div>
              </div>

              {/* Tabs + Hamburger */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="tab-group" style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 13, padding: 3 }}>
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
                <button className="hover-surface" onClick={() => setShowSettings("drawer")} title="Menu" style={{
                  width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.04)", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, padding: 0, flexShrink: 0, transition: "all 0.2s ease",
                }}>
                  {[18, 14, 18].map((w, i) => (
                    <span key={i} style={{ display: "block", borderRadius: 2, background: "#64748b", width: w, height: 2, transition: "all 0.2s" }} />
                  ))}
                </button>
              </div>
            </div>

            {/* Context line */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#475569" }}>
                {activeTab === "insights" && activeInsightTab === "limits" ? "App time limits & blocking"
                  : activeTab === "insights" && activeInsightTab === "goals" ? "Personal goals & daily targets"
                  : activeTab === "insights" && activeInsightTab === "reports" ? "Weekly usage summary & insights"
                  : new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </span>
              {isToday && activeTab !== "insights" && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
                  color: "#4ade80", background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.18)",
                  borderRadius: 8, padding: "3px 10px", fontWeight: 500,
                }}>
                  tracked {fmtTime(trackedSeconds)} today
                </span>
              )}
              {isToday && (
                <span style={{
                  fontSize: 11, color: "#475569", fontFamily: "monospace",
                  animation: "tick 1s ease infinite alternate",
                  background: "rgba(255,255,255,0.04)", padding: "3px 9px", borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.07)", letterSpacing: "0.05em",
                }}>
                  {fmtTimeFull(elapsed)}
                </span>
              )}
            </div>

            {activeTab === "insights" && (
              <div style={{ display: "inline-flex", gap: 4, alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 4, width: "fit-content" }}>
                {INSIGHT_TABS.map(t => {
                  const isActive = activeInsightTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveInsightTab(t.id)}
                      style={{
                        border: "1px solid transparent",
                        background: isActive ? "rgba(96,165,250,0.14)" : "transparent",
                        color: isActive ? "#93c5fd" : "#64748b",
                        fontSize: 12,
                        fontWeight: 600,
                        borderColor: isActive ? "rgba(96,165,250,0.35)" : "transparent",
                        borderRadius: 8,
                        padding: "6px 12px",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Date navigator + DaySummary */}
            {activeTab !== "insights" && (
              <div className="date-bar-row" style={{ display: "flex", gap: 12, alignItems: "stretch", width: "100%" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} availableDates={availableDates} heatmap={heatmapData} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DaySummary
                    data={data} stats={stats} hourly={hourly}
                    prevWellbeing={prevWellbeing} focusData={focusData}
                    sessionDuration={isToday ? (data?.sessionDuration || 0) : 0}
                    dateKey={selectedDate}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── TAB CONTENT with fluid transitions ── */}
          <AnimatedTabPanel active={activeTab === "overview"}>
            <OverviewPage
              data={enrichedData}
              stats={stats}
              prevStats={prevStats}
              prevWellbeing={prevWellbeing}
              showComparison={showYesterdayComparison}
              limits={limits}
              hourly={hourly}
              peakHour={peakHour}
              countKey={countKey}
              selectedDate={selectedDate}
              onGoToLimits={() => { setActiveTab("insights"); setActiveInsightTab("limits"); }}
              onGoToday={() => setSelectedDate(localYMD())}
              sparkSeries={sparkSeries}
              BASE={BASE}
            />
          </AnimatedTabPanel>

          <AnimatedTabPanel active={activeTab === "apps"}>
            <AppsPage BASE={BASE} stats={stats} prevStats={prevStats} selectedDate={selectedDate} ignoredApps={ignoredApps} />
          </AnimatedTabPanel>

          <AnimatedTabPanel active={activeTab === "activity"}>
            <ActivityPage
              BASE={BASE} selectedDate={selectedDate}
              data={data || { totalScreenTime: 0, totalSessions: 0, totalKeystrokes: 0, totalClicks: 0 }}
              stats={stats} prevStats={prevStats} prevWellbeing={prevWellbeing}
              showComparison={showYesterdayComparison} hourly={hourly} peakHour={peakHour} countKey={countKey}
            />
          </AnimatedTabPanel>

          <AnimatedTabPanel active={activeTab === "insights"}>
            {activeInsightTab === "goals" && (
              <GoalsPage selectedDate={selectedDate} />
            )}
            {activeInsightTab === "limits" && (
              <LimitsPage BASE={BASE} stats={stats} />
            )}
            {activeInsightTab === "reports" && (
              <WeeklyReportPage />
            )}
          </AnimatedTabPanel>

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 48, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <a className="hover-fade" href="https://github.com/arshsisodiya/Stasis" target="_blank" rel="noopener noreferrer"
              style={{ letterSpacing: "0.04em", opacity: 0.35, textDecoration: "none", color: "#475569", transition: "opacity 0.15s ease, transform 0.15s ease", cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
              >
              Stasis{appVersion ? ` v${appVersion}` : ""} · © {new Date().getFullYear()} Arsh Sisodiya
            </a>
          </div>
        </div>
      </div>

      {/* ── SETTINGS DRAWER ── */}
      {showSettings === "drawer" && (
        <>
          <div onClick={() => setShowSettings(null)} style={{
            position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(var(--glass-blur))", animation: "drawer-fade-in 0.22s ease",
          }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 160, width: 280,
            background: "rgba(8,11,20,0.97)", borderLeft: "1px solid rgba(255,255,255,0.07)",
            display: "flex", flexDirection: "column",
            boxShadow: "var(--shadow-soft)",
            animation: "drawer-slide-in 0.28s cubic-bezier(0.34,1.1,0.64,1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#f8fafc", lineHeight: 1, letterSpacing: "-0.02em" }}>
                  Sta<span style={{ color: "#4ade80", fontStyle: "italic" }}>sis</span>
                </div>
                <div style={{ fontSize: 10, color: "#2d3d52", marginTop: 4, letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 500 }}>Your Focus Core</div>
              </div>
              <button onClick={() => setShowSettings(null)} style={{
                width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.04)", color: "#475569", cursor: "pointer",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>
            <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
              {[
                { icon: "⚙️", label: "General Settings", sub: "Tracking & app preferences", section: "general" },
                { icon: "✈️", label: "Telegram Integration", sub: "Remote control setup", section: "telegram" },
                { icon: "🔐", label: "Security", sub: "Encryption & access control", section: "security" },
                { icon: "ℹ️", label: "About & Privacy", sub: "About, licenses, policy", section: "about" },
                { icon: "🚀", label: "Updates", sub: "Version & changelog", section: "updates" },
              ].map(({ icon, label, sub, section }) => (
                <button key={section} className="hover-surface" onClick={() => setShowSettings(section)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                  background: "transparent", color: "#475569", transition: "all 0.15s ease",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>{sub}</div>
                  </div>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.1)" }}>›</span>
                </button>
              ))}
            </nav>
            <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ fontSize: 10, color: "#334155", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Stasis{appVersion ? ` v${appVersion}` : ""}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.07)", letterSpacing: "0.04em" }}>Wellbeing &amp; Remote Sync</div>
              </div>
            </div>
          </div>
        </>
      )}

      {showSettings && showSettings !== "drawer" && (
        <SettingsPage initialSection={showSettings} onClose={() => setShowSettings(null)} />
      )}
    </div>
  );
}
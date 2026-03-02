import { useState, useEffect } from "react";
import { CATEGORY_COLORS, BROWSER_EXES } from "../shared/constants";
import { fmtTime, trendPct } from "../shared/utils";
import { AppIcon, CategoryChip, TrendBadge, SectionCard } from "../shared/components";

// ─── APP ROW ─────────────────────────────────────────────────────────────────
function AppRow({ app, active, maxActive, main, sub, index, prevActive }) {
  const pct = maxActive > 0 ? (active / maxActive) * 100 : 0;
  const col = CATEGORY_COLORS[main] || CATEGORY_COLORS.other;
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  const trend = trendPct(active, prevActive);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), 80 + index * 60);
    return () => clearTimeout(t);
  }, [index]);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 12,
        opacity: vis ? 1 : 0, transform: vis ? "translateX(0)" : "translateX(-20px)",
        transition: `opacity 0.4s ease ${index * 0.04}s, transform 0.4s ease ${index * 0.04}s, background 0.15s`,
        background: hov ? "rgba(255, 255, 255, 0.04)" : "transparent"
      }}>
      <AppIcon appName={app} category={main} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {app.replace(".exe", "")}
            </span>
            <CategoryChip main={main} sub={sub} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
            <TrendBadge pct={trend} />
            <span style={{ fontSize: 12, color: "#64748b" }}>{fmtTime(active)}</span>
          </div>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4,
            background: `linear-gradient(90deg,${col.primary},${col.primary}99)`,
            boxShadow: `0 0 6px ${col.primary}80`, width: `${pct}%`,
            transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1)"
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── BROWSER ROW ─────────────────────────────────────────────────────────────
function BrowserRow({ browsers, maxActive, index, BASE, selectedDate, prevActive }) {
  const [expanded, setExpanded] = useState(false);
  const [sites, setSites] = useState(null);
  const [loadingSites, setLoadingSites] = useState(false);
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);

  const totalActive = browsers.reduce((s, b) => s + b.active, 0);
  const pct = maxActive > 0 ? (totalActive / maxActive) * 100 : 0;
  const col = CATEGORY_COLORS.neutral;
  const trend = trendPct(totalActive, prevActive);

  useEffect(() => {
    const t = setTimeout(() => setVis(true), 80 + index * 60);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (expanded) {
      setLoadingSites(true);
      fetch(`${BASE}/api/site-stats?date=${selectedDate}&app=${browsers[0].app}`)
        .then(r => r.json())
        .then(data => { setSites(Array.isArray(data) ? data : []); setLoadingSites(false); })
        .catch(() => { setSites([]); setLoadingSites(false); });
    }
  }, [selectedDate, BASE, browsers[0].app, expanded]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && sites === null) {
      setLoadingSites(true);
      fetch(`${BASE}/api/site-stats?date=${selectedDate}&app=${browsers[0].app}`)
        .then(r => r.json())
        .then(data => { setSites(Array.isArray(data) ? data : []); setLoadingSites(false); })
        .catch(() => { setSites([]); setLoadingSites(false); });
    }
  };

  return (
    <div style={{
      opacity: vis ? 1 : 0, transform: vis ? "translateX(0)" : "translateX(-20px)",
      transition: `opacity 0.4s ease ${index * 0.04}s, transform 0.4s ease ${index * 0.04}s`,
    }}>
      <div
        onClick={handleExpand}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 12,
          background: hov || expanded ? "rgba(255, 255, 255, 0.04)" : "transparent",
          cursor: "pointer", transition: "background 0.15s",
        }}>
        <AppIcon appName={browsers[0].app} category="neutral" size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>
                {browsers[0].app.replace(".exe", "").charAt(0).toUpperCase() + browsers[0].app.replace(".exe", "").slice(1)}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                padding: "2px 8px", borderRadius: 20,
                background: col.bg, border: `1px solid ${col.primary}30`, color: col.primary,
                letterSpacing: "0.02em", flexShrink: 0,
              }}>🌐 browser</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
              <TrendBadge pct={trend} />
              <span style={{ fontSize: 12, color: "#64748b" }}>{fmtTime(totalActive)}</span>
              <span style={{
                fontSize: 11, color: expanded ? col.primary : "#475569",
                transition: "transform 0.2s, color 0.2s",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                display: "inline-block",
              }}>▾</span>
            </div>
          </div>
          <div style={{ height: 4, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: `linear-gradient(90deg,${col.primary},${col.primary}99)`,
              boxShadow: `0 0 6px ${col.primary}80`, width: `${pct}%`,
              transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1)"
            }} />
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{
          marginLeft: 48, marginTop: 2, marginBottom: 4, paddingLeft: 12,
          borderLeft: `2px solid ${col.primary}30`,
          animation: "legend-slide-in 0.2s ease both",
        }}>
          {loadingSites ? (
            <div style={{ padding: "12px 0", fontSize: 12, color: "#475569" }}>Loading site data…</div>
          ) : !sites || sites.length === 0 ? (
            <div style={{ padding: "12px 0", fontSize: 12, color: "#475569" }}>No site data available</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 8, paddingBottom: 4 }}>
              {(() => {
                const maxSite = Math.max(...sites.map(s => s.seconds), 1);
                return sites.slice(0, 10).map((site, si) => {
                  const sitePct = (site.seconds / maxSite) * 100;
                  return (
                    <div key={site.domain || si} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "5px 8px", borderRadius: 8, transition: "background 0.12s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontSize: 12, flexShrink: 0 }}>🌐</span>
                      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, minWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {site.domain}
                      </span>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <div style={{ width: `${sitePct}%`, height: "100%", borderRadius: 2, background: `${col.primary}99`, transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#475569", flexShrink: 0, minWidth: 36, textAlign: "right" }}>{fmtTime(site.seconds)}</span>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── APPS PAGE ────────────────────────────────────────────────────────────────
export default function AppsPage({ BASE, stats, prevStats, selectedDate, ignoredApps }) {
  const [appFilter, setAppFilter] = useState("all");

  const prevMap = prevStats.reduce((a, s) => { a[s.app] = (a[s.app] || 0) + s.active; return a; }, {});
  const sorted = [...stats].sort((a, b) => b.active - a.active);

  return (
    <SectionCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.15em" }}>Time by App</div>
        <div style={{ fontSize: 11, color: "#e2e8f0" }}>vs yesterday</div>
      </div>

      {/* Category filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {["all", "productive", "communication", "entertainment", "system", "other"].map(cat => {
          const col = cat === "all" ? { primary: "#475569", bg: "rgba(148,163,184,0.08)" } : (CATEGORY_COLORS[cat] || CATEGORY_COLORS.other);
          const isActive = appFilter === cat;
          const cnt = cat === "all" ? sorted.length : sorted.filter(s => s.main === cat).length;
          if (cat !== "all" && cnt === 0) return null;
          return (
            <button key={cat} onClick={() => setAppFilter(cat)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20,
                border: `1px solid ${isActive ? col.primary + "55" : "rgba(255,255,255,0.07)"}`,
                background: isActive ? col.bg : "rgba(255, 255, 255, 0.04)",
                color: isActive ? col.primary : "#475569", fontSize: 12, fontWeight: 500,
                cursor: "pointer", transition: "all 0.18s", fontFamily: "'DM Sans',sans-serif"
              }}>
              {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              <span style={{ fontSize: 10, opacity: 0.7 }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* App list */}
      {(() => {
        const groupedAppsMap = {};
        for (const s of stats) {
          if (ignoredApps.has(s.app.toLowerCase())) continue;
          if (!groupedAppsMap[s.app]) {
            groupedAppsMap[s.app] = { ...s, active: 0, idle: 0, categories: new Set(), browsers: [] };
          }
          groupedAppsMap[s.app].active += s.active;
          groupedAppsMap[s.app].idle += s.idle;
          if (BROWSER_EXES.has(s.app.toLowerCase())) {
            groupedAppsMap[s.app].browsers.push(s);
          }
          groupedAppsMap[s.app].categories.add(s.main);
          const _dt = groupedAppsMap[s.app]._domCount || 0;
          if (s.active > _dt) {
            groupedAppsMap[s.app]._domCount = s.active;
            groupedAppsMap[s.app].main = s.main;
            groupedAppsMap[s.app].sub = s.sub;
          }
        }

        const allGrouped = Object.values(groupedAppsMap);
        const filteredGrouped = appFilter === "all" ? allGrouped : allGrouped.filter(s => s.categories.has(appFilter));

        if (filteredGrouped.length === 0) {
          return <div style={{ textAlign: "center", padding: "40px 0", color: "#e2e8f0", fontSize: 13 }}>No apps in this category</div>;
        }

        filteredGrouped.sort((a, b) => b.active - a.active);
        const maxAllA = filteredGrouped.length > 0 ? filteredGrouped[0].active || 1 : 1;

        return filteredGrouped.map((item, i) => {
          const isBrowser = BROWSER_EXES.has(item.app.toLowerCase());
          if (isBrowser) {
            return <BrowserRow key={item.app} browsers={item.browsers} maxActive={maxAllA} index={i} BASE={BASE} selectedDate={selectedDate} prevActive={prevMap[item.app]} />;
          }
          return <AppRow key={item.app} {...item} maxActive={maxAllA} index={i} prevActive={prevMap[item.app]} />;
        });
      })()}
    </SectionCard>
  );
}

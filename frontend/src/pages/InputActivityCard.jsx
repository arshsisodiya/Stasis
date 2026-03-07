import { fmtTime } from "../shared/utils";
import { useCountUp } from "../shared/hooks";
import { SectionCard, AppIcon } from "../shared/components";

// ─── INPUT ACTIVITY CARD ──────────────────────────────────────────────────────
// Props:
//   data     – wellbeing data { totalKeystrokes, totalClicks }
//   stats    – array of app stat rows (for Top Apps list)
//   countKey – key to re-trigger count-up animation
export default function InputActivityCard({ data, stats, countKey }) {
  const kC = useCountUp(data?.totalKeystrokes || 0, 1600, countKey);
  const clC = useCountUp(data?.totalClicks || 0, 1600, countKey);

  // frontend/src/pages/OverviewPage.jsx

  const mergedStats = Object.values(stats.reduce((acc, curr) => {
    const normApp = curr.app;
    if (!acc[normApp]) {
      acc[normApp] = { ...curr };
      acc[normApp]._dom_active = curr.active;
    } else {
      acc[normApp].active += curr.active;
      // Keeps the color properties of the most dominant activity category
      if (curr.active > acc[normApp]._dom_active) {
        acc[normApp].main = curr.main;
        acc[normApp]._dom_active = curr.active;
      }
    }
    return acc;
  }, {}));

  const topApps = mergedStats.sort((a, b) => b.active - a.active).slice(0, 3);

  const topMax = topApps[0]?.active || 1;

  return (
    <SectionCard
      className="metric-card"
      style={{
        borderLeft: "3px solid #a78bfa",
        background: "linear-gradient(135deg,rgba(167,139,250,0.04) 0%,rgba(15,18,34,0.7) 60%)",
        minHeight: 190, animationDelay: "180ms",
      }}
    >
      <div style={{
        fontSize: 11, color: "#a78bfa", textTransform: "uppercase",
        letterSpacing: "0.15em", marginBottom: 16, fontWeight: 600,
      }}>
        Input Activity
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Keystrokes */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>⌨️ Keystrokes</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>
              {kC.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: "linear-gradient(90deg,#4ade80,#22d3ee)",
              width: `${Math.min(100, (data.totalKeystrokes / 20000) * 100)}%`,
              transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
          </div>
        </div>

        {/* Clicks */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>🖱️ Clicks</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>
              {clC.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 4, background: "rgba(255, 255, 255, 0.06)" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: "linear-gradient(90deg,#60a5fa,#a78bfa)",
              width: `${Math.min(100, (data.totalClicks / 8000) * 100)}%`,
              transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1) 0.2s",
            }} />
          </div>
        </div>

        {/* Top Apps */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 2 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>Top Apps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topApps.map((app, idx) => (
              <div key={app.app} style={{
                display: "flex", alignItems: "center", gap: 8,
                animation: `legend-slide-in 0.3s ease ${idx * 0.08}s both`,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: idx === 0 ? "#fbbf24" : idx === 1 ? "#94a3b8" : "#cd7f32",
                  width: 14, textAlign: "center", flexShrink: 0,
                }}>{idx + 1}</span>
                <AppIcon appName={app.app} category={app.main || "other"} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 500, color: "#f8fafc",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {app.app.replace(".exe", "")}
                    </span>
                    <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0, marginLeft: 6 }}>
                      {fmtTime(app.active)}
                    </span>
                  </div>
                  <div style={{ height: 2, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      background: idx === 0
                        ? "linear-gradient(90deg,#fbbf24,#f59e0b)"
                        : idx === 1
                          ? "linear-gradient(90deg,#94a3b8,#64748b)"
                          : "linear-gradient(90deg,#cd7f32,#a0522d)",
                      width: `${(app.active / topMax) * 100}%`,
                      transition: "width 1s cubic-bezier(0.34,1.56,0.64,1)",
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

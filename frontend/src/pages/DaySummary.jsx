import { AppIcon } from "../shared/components";
import { fmtTime } from "../shared/utils";
import { useState } from "react";

// ─── DATE DOT LEGEND ──────────────────────────────────────────────────────────
export function DateDotLegend() {
    const [show, setShow] = useState(false);
    return (
        <div style={{ position: "relative", flexShrink: 0 }}>
            <button
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                onClick={() => setShow(s => !s)}
                style={{
                    width: 22, height: 22, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)", color: "#475569", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                    transition: "all 0.2s"
                }}
            >?</button>
            {show && (
                <div style={{
                    position: "absolute", bottom: "calc(100% + 10px)", right: 0,
                    background: "rgba(8,11,20,0.97)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12, padding: "12px 14px", zIndex: 100,
                    whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    animation: "center-fade-in 0.15s ease both", minWidth: 180
                }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Activity Legend</div>
                    {[
                        { color: "rgba(52,211,153,1)", label: "Productive (≥50%)" },
                        { color: "rgba(251,191,36,1)", label: "Mixed (25–49%)" },
                        { color: "rgba(148,163,184,1)", label: "Low productivity (<25%)" },
                    ].map(({ color, label }) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}88`, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}</span>
                        </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: "#475569" }}>No data tracked</span>
                    </div>
                    <div style={{ fontSize: 9, color: "#334155", marginTop: 8 }}>Brightness = screen time amount</div>
                    <div style={{
                        position: "absolute", bottom: -6, right: 8,
                        width: 10, height: 10, transform: "rotate(45deg)",
                        background: "rgba(8,11,20,0.97)", border: "1px solid rgba(255,255,255,0.12)",
                        borderTop: "none", borderLeft: "none"
                    }} />
                </div>
            )}
        </div>
    );
}

// ─── DAY SUMMARY ─────────────────────────────────────────────────────────────
export default function DaySummary({ data, stats, hourly }) {
    if (!data || data.totalScreenTime === 0) return null;
    const topApp = [...(stats || [])].sort((a, b) => b.active - a.active)[0];
    const maxH = Math.max(...hourly, 1);

    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 16, background: "rgba(15,18,30,0.6)",
            border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "8px 16px", backdropFilter: "blur(20px)",
            flex: 1, minWidth: 0, animation: "legend-slide-in 0.4s ease both", height: "100%"
        }}>
            <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                <div>
                    <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Time</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", fontFamily: "'DM Serif Display',serif" }}>{fmtTime(data.totalScreenTime)}</div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />
                <div>
                    <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Score</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80", fontFamily: "'DM Serif Display',serif" }}>{data.productivityPercent}%</div>
                </div>
            </div>

            <div style={{ flex: 1, height: 32, display: "flex", alignItems: "flex-end", gap: 1.5, minWidth: 60, padding: "0 4px" }}>
                {hourly.map((v, i) => (
                    <div key={i} style={{
                        flex: 1, height: `${Math.max((v / maxH) * 100, 10)}%`,
                        background: v > 0 ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.03)",
                        borderRadius: 1, transition: "height 0.4s ease"
                    }} />
                ))}
            </div>

            {topApp && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
                    <AppIcon appName={topApp.app} category={topApp.main} size={26} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 700 }}>Top App</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {topApp.app.replace(".exe", "")}
                        </div>
                    </div>
                </div>
            )}
            <DateDotLegend />
        </div>
    );
}

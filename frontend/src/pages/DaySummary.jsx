import { fmtTime } from "../shared/utils";
import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const STYLES = `
  @keyframes ds-fadein {
    from { opacity:0; transform:translateY(3px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes ds-bar-grow {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }
  @keyframes ds-tick-out {
    to { opacity:0; transform:translateY(-6px); }
  }
  @keyframes ds-tick-in {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes ds-nudge-pulse {
    0%,100% { opacity:.45; } 50% { opacity:1; }
  }
  @keyframes ds-num-count {
    from { opacity:0; transform:translateY(4px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .ds-root {
    display:flex; align-items:stretch;
    background:rgba(10,13,24,0.78);
    border:1px solid rgba(255,255,255,0.07);
    border-radius:14px;
    backdrop-filter:blur(24px);
    overflow:hidden;
    flex:1; min-width:0; height:100%;
    animation:ds-fadein 0.4s cubic-bezier(0.16,1,0.3,1) both;
  }
  .ds-inner {
    display:flex; align-items:stretch;
    width:100%; height:100%;
  }
  .ds-divider {
    width:1px;
    background:rgba(255,255,255,0.055);
    flex-shrink:0;
  }
  .ds-label {
    font-size:8px;
    font-family:'DM Mono','SF Mono',monospace;
    font-weight:500;
    text-transform:uppercase;
    letter-spacing:0.12em;
    color:#4a6080;
    line-height:1;
    margin-bottom:4px;
  }
  .ds-dot-btn { background:rgba(255,255,255,0.08) !important; }
  .ds-dot-btn:hover { background:rgba(255,255,255,0.18) !important; }
  .ds-nudge-wrap:hover { background:rgba(255,255,255,0.035) !important; }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Full hour labels — 2pm not 2p
function fmtHourFull(h) {
    if (h === 0) return "12am";
    if (h < 12) return `${h}am`;
    if (h === 12) return "12pm";
    return `${h - 12}pm`;
}

function fmtHourLong(h) {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
}

// ─── 1. HOURLY SPARKLINE ──────────────────────────────────────────────────────
const HourlySparkline = memo(function HourlySparkline({ hourly, animKey }) {
    if (!hourly || hourly.length < 24) return null;

    const max = Math.max(...hourly, 1);
    const peakIdx = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
    const now = new Date().getHours();

    const zoneColor = (i) => {
        if (i >= 5 && i < 12) return "#60a5fa";
        if (i >= 12 && i < 18) return "#34d399";
        if (i >= 18 && i < 23) return "#a78bfa";
        return "#334155";
    };

    const BAR_W = 4;
    const GAP = 1;
    const H = 24;
    const totalW = 24 * (BAR_W + GAP) - GAP;

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 0,
            padding: "0 14px", flexShrink: 0, justifyContent: "center"
        }}>
            <div className="ds-label">Today's rhythm</div>

            <svg
                key={animKey}
                width={totalW} height={H + 11}
                style={{ display: "block", overflow: "visible" }}
            >
                {hourly.map((val, i) => {
                    const barH = val > 0 ? Math.max(2, Math.round((val / max) * H)) : 1;
                    const x = i * (BAR_W + GAP);
                    const y = H - barH;
                    const isPeak = i === peakIdx && val > 0;
                    const isPast = i <= now;
                    const color = zoneColor(i);
                    const opacity = isPast ? (isPeak ? 1 : 0.55) : 0.15;

                    return (
                        <g key={i}>
                            <rect
                                x={x} y={y} width={BAR_W} height={barH}
                                rx={1}
                                fill={color}
                                opacity={opacity}
                                style={{
                                    transformOrigin: `${x + BAR_W / 2}px ${H}px`,
                                    animation: `ds-bar-grow 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 10}ms both`
                                }}
                            />
                            {isPeak && (
                                <circle
                                    cx={x + BAR_W / 2} cy={y - 3}
                                    r={2} fill={color} opacity={0.9}
                                />
                            )}
                        </g>
                    );
                })}

                {/* "now" cursor */}
                {now < 24 && (
                    <line
                        x1={now * (BAR_W + GAP) + BAR_W / 2} y1={0}
                        x2={now * (BAR_W + GAP) + BAR_W / 2} y2={H}
                        stroke="rgba(255,255,255,0.11)" strokeWidth={1} strokeDasharray="2 2"
                    />
                )}

                {/* x-axis ticks: 6am, 12pm, 6pm */}
                {[6, 12, 18].map(h => (
                    <text
                        key={h}
                        x={h * (BAR_W + GAP) + BAR_W / 2}
                        y={H + 10}
                        textAnchor="middle"
                        fontSize={6.5}
                        fill="#3a5068"
                        fontFamily="'DM Mono',monospace"
                    >
                        {fmtHourFull(h)}
                    </text>
                ))}
            </svg>

            {hourly[peakIdx] > 0 && (
                <div style={{
                    fontSize: 8.5, color: "#3d5570",
                    fontFamily: "'DM Mono',monospace",
                    marginTop: 3, lineHeight: 1
                }}>
                    peak {fmtHourFull(peakIdx)}
                    <span style={{ color: zoneColor(peakIdx), marginLeft: 3 }}>↑</span>
                </div>
            )}
        </div>
    );
});

// ─── 2. DAY DELTA ─────────────────────────────────────────────────────────────
const DayDelta = memo(function DayDelta({ data, prevWellbeing, animKey }) {
    const hasPrev = prevWellbeing
        && prevWellbeing.totalScreenTime > 0
        && typeof prevWellbeing.productivityPercent === "number";

    const prodToday = data.productivityPercent || 0;
    const timeToday = data.totalScreenTime || 0;

    if (!hasPrev) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", gap: 5,
                padding: "0 14px", flexShrink: 0, justifyContent: "center", minWidth: 90
            }}>
                <div className="ds-label">vs yesterday</div>
                <div style={{
                    fontSize: 10.5, color: "#3a5068",
                    fontFamily: "'DM Mono',monospace", lineHeight: 1.5
                }}>
                    No prior<br />data yet
                </div>
            </div>
        );
    }

    const prodPrev = prevWellbeing.productivityPercent;
    const timePrev = prevWellbeing.totalScreenTime;
    const prodDiff = Math.round(prodToday - prodPrev);
    const timeDiff = Math.round((timeToday - timePrev) / 60); // minutes

    const Row = ({ diff, unit, title, isProd }) => {
        const up = diff > 0;
        const same = diff === 0;

        const goodColor = "#34d399";
        const badColor = "#f87171";
        const warnColor = "#fbbf24";
        const sameColor = "#60a5fa"; // blue for "same" — neutral, not invisible

        let color;
        if (same) color = sameColor;
        else if (isProd) color = up ? goodColor : badColor;
        else color = up ? warnColor : goodColor;

        // Format value
        let valStr;
        if (same) {
            valStr = null; // handled separately
        } else {
            const abs = Math.abs(diff);
            if (unit === "m" && abs >= 60) {
                const h = Math.floor(abs / 60);
                const m = abs % 60;
                valStr = m > 0 ? `${h}h${m}m` : `${h}h`;
            } else {
                valStr = `${abs}${unit}`;
            }
        }

        return (
            <div style={{
                display: "flex", alignItems: "center", gap: 5,
                animation: `ds-num-count 0.35s cubic-bezier(0.16,1,0.3,1) ${isProd ? "0ms" : "60ms"} both`
            }}
                key={animKey}
            >
                <span style={{
                    fontSize: 14, fontWeight: 700, lineHeight: 1,
                    fontFamily: "'DM Sans',sans-serif",
                    color, minWidth: 44, letterSpacing: "-0.01em"
                }}>
                    {same ? (
                        // Always show something when same — "=" with "same" label
                        <span style={{ fontSize: 13 }}>= same</span>
                    ) : (
                        <>
                            <span style={{ fontSize: 10, marginRight: 1, opacity: 0.8 }}>
                                {up ? "↑" : "↓"}
                            </span>
                            {valStr}
                        </>
                    )}
                </span>
                <span style={{
                    fontSize: 9, color: "#4a6080",
                    fontFamily: "'DM Mono',monospace",
                    textTransform: "uppercase", letterSpacing: "0.08em"
                }}>
                    {title}
                </span>
            </div>
        );
    };

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 6,
            padding: "0 14px", flexShrink: 0, justifyContent: "center", minWidth: 108
        }}>
            <div className="ds-label">vs yesterday</div>
            <Row diff={prodDiff} unit="%" title="focus" isProd={true} />
            <Row diff={timeDiff} unit="m" title="screen" isProd={false} />
        </div>
    );
});

// ─── BREAK NUDGE ─────────────────────────────────────────────────────────────
function getNudge(totalScreenTime, totalIdleTime) {
    const screenMins = Math.round((totalScreenTime || 0) / 60);
    const idleRatio = totalScreenTime > 0 ? (totalIdleTime || 0) / totalScreenTime : 1;

    if (screenMins >= 480 && idleRatio < 0.1)
        return { icon: "🪴", title: "8h, barely idle", msg: "Seriously. Stand up.", color: "#f87171", critical: true };
    if (screenMins >= 480)
        return { icon: "🛋️", title: "8h today", msg: "Your chair misses you less.", color: "#c084fc", critical: false };
    if (screenMins >= 360 && idleRatio < 0.08)
        return { icon: "☕", title: "6h, no real break", msg: "Coffee. Stretch. Outside.", color: "#fb923c", critical: false };
    if (screenMins >= 360)
        return { icon: "🚶", title: "6h today", msg: "Walk around. Hydrate.", color: "#34d399", critical: false };
    if (screenMins >= 240 && idleRatio < 0.05)
        return { icon: "🌿", title: "4h eyes on screen", msg: "Look out the window.", color: "#fbbf24", critical: false };
    return null;
}

function BreakNudge({ nudge }) {
    return (
        <div
            className="ds-nudge-wrap"
            style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "0 14px", flexShrink: 0,
                borderLeft: "1px solid rgba(255,255,255,0.055)",
                background: "transparent", transition: "background 0.2s",
                cursor: "default", position: "relative", height: "100%", minWidth: 148
            }}
        >
            <div style={{
                position: "absolute", left: 0, top: "18%", bottom: "18%",
                width: 2, borderRadius: "0 2px 2px 0",
                background: nudge.color, opacity: .5,
                animation: nudge.critical ? "ds-nudge-pulse 1.8s ease-in-out infinite" : "none"
            }} />
            <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{nudge.icon}</span>
            <div>
                <div className="ds-label" style={{ color: nudge.color, marginBottom: 4 }}>
                    {nudge.title}
                </div>
                <div style={{
                    fontSize: 11.5, color: "#5a7290",
                    fontFamily: "'DM Sans',sans-serif",
                    fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap"
                }}>
                    {nudge.msg}
                </div>
            </div>
        </div>
    );
}

// ─── INSIGHT TICKER ───────────────────────────────────────────────────────────
function InsightTicker({ insights }) {
    const [idx, setIdx] = useState(0);
    const [anim, setAnim] = useState("idle");
    const timer = useRef(null);
    const n = insights.length;

    const goTo = useCallback((i) => {
        clearInterval(timer.current);
        setAnim("out");
        setTimeout(() => { setIdx(i); setAnim("in"); setTimeout(() => setAnim("idle"), 320); }, 230);
    }, []);

    const advance = useCallback(() => {
        setAnim("out");
        setTimeout(() => {
            setIdx(p => (p + 1) % n);
            setAnim("in");
            setTimeout(() => setAnim("idle"), 320);
        }, 230);
    }, [n]);

    useEffect(() => {
        if (n <= 1) return;
        timer.current = setInterval(advance, 5800);
        return () => clearInterval(timer.current);
    }, [n, advance]);

    useEffect(() => { setIdx(0); setAnim("idle"); }, [insights.length]);

    if (n === 0) return <div style={{ flex: 1 }} />;

    const text = insights[idx % n];
    const fs = text.length > 92 ? 10.5 : text.length > 68 ? 11.5 : 12.5;

    const animStyle =
        anim === "out" ? { animation: "ds-tick-out 0.23s ease both" } :
            anim === "in" ? { animation: "ds-tick-in  0.32s cubic-bezier(0.16,1,0.3,1) both" } : {};

    return (
        <div style={{
            flex: 1, minWidth: 0, padding: "0 14px",
            display: "flex", flexDirection: "column",
            justifyContent: "center", gap: 5, overflow: "hidden"
        }}>
            <div className="ds-label">Today's insight</div>
            <div style={{ overflow: "hidden", minHeight: 30 }}>
                <div style={{
                    fontSize: fs, color: "#7a8fa8",
                    fontFamily: "'DM Sans',sans-serif",
                    fontWeight: 450, lineHeight: 1.45,
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                    ...animStyle
                }}>
                    {text}
                </div>
            </div>
            {n > 1 && (
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    {Array.from({ length: Math.min(n, 9) }).map((_, i) => (
                        <button
                            key={i}
                            className="ds-dot-btn"
                            onClick={() => goTo(i)}
                            style={{
                                width: i === idx ? 16 : 4, height: 4, borderRadius: 2,
                                background: i === idx ? "#60a5fa" : undefined,
                                border: "none", padding: 0, cursor: "pointer",
                                transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)", flexShrink: 0
                            }}
                        />
                    ))}
                    {n > 9 && (
                        <span style={{
                            fontSize: 8, color: "#2a3a4e", marginLeft: 2,
                            fontFamily: "'DM Mono',monospace"
                        }}>+{n - 9}</span>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── DATE DOT LEGEND (kept as no-op export for any external imports) ──────────
export function DateDotLegend() { return null; }


// ─── INSIGHT GENERATOR ───────────────────────────────────────────────────────
// Tones: [N] neutral/factual  [S] serious/direct  [W] witty/human
// Each category has a balanced mix so not every line is a joke
function generateInsights(data, stats, hourly, prevWellbeing, focusData) {
    const insights = [];
    if (!data || data.totalScreenTime === 0) return insights;

    const totalSeconds = data.totalScreenTime || 0;
    const prodPct = data.productivityPercent || 0;
    const nb = s => s.replace(/(\d+)\s*([apmAPMhminutesteconds]+)/g, "$1\u00A0$2");
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // ── 1. Yesterday delta ──
    if (prevWellbeing?.productivityPercent != null && prevWellbeing.totalScreenTime > 0) {
        const diff = Math.round(prodPct - prevWellbeing.productivityPercent);
        if (diff >= 15) insights.push(pick([
            `You're ${diff}% more focused than yesterday. Keep the momentum.`,           // [S]
            `Up ${diff}% from yesterday — whatever changed, notice it.`,                 // [N]
            `Yesterday's you would be jealous right now. ${diff}% better. 🚀`,           // [W]
        ]));
        else if (diff > 0) insights.push(pick([
            `Slightly ahead of yesterday. Small gains compound.`,                         // [S]
            `Up ${diff}% on yesterday — close, but moving in the right direction.`,       // [N]
            `Quietly edging out yesterday's version of you. 🤫`,                          // [W]
        ]));
        else if (diff === 0) insights.push(pick([
            `Same productivity as yesterday. Consistency is its own kind of progress.`,   // [S]
            `Matching yesterday's output exactly. Steady state.`,                         // [N]
            `Carbon copy of yesterday. Clone behaviour. 🧬`,                              // [W]
        ]));
        else if (diff > -15) insights.push(pick([
            `A small dip from yesterday — happens to everyone. Refocus where you can.`,   // [S]
            `Down ${Math.abs(diff)}% from yesterday. Still within a normal range.`,       // [N]
            `Barely behind yesterday's pace. Nothing a good stretch won't fix.`,          // [W]
        ]));
        else insights.push(pick([
            `Focus dropped ${Math.abs(diff)}% from yesterday. Worth reflecting on why.`,  // [S]
            `Down ${Math.abs(diff)}% from yesterday. Lower intensity day.`,               // [N]
            `Not every day is a highlight reel. Rest is a feature, not a bug. 🔋`,        // [W]
        ]));
    }

    // ── 2. Peak hour ──
    if (hourly?.length === 24) {
        const peakIdx = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
        if (hourly[peakIdx] > 0) {
            const hour = fmtHourLong(peakIdx);
            insights.push(pick([
                `Your sharpest hour was ${hour}. That's a pattern worth protecting.`,       // [S]
                `Peak activity at ${hour} today.`,                                           // [N]
                `If you could bottle ${hour} and sell it, you'd retire early. ✨`,           // [W]
            ]));
        }

        const ms = hourly.slice(6, 12).reduce((a, b) => a + b, 0);
        const as2 = hourly.slice(12, 18).reduce((a, b) => a + b, 0);
        const es = hourly.slice(18, 24).reduce((a, b) => a + b, 0);
        const mx = Math.max(ms, as2, es);
        if (mx > 0) {
            if (mx === ms) insights.push(pick([
                "Most of your work happened before noon. Protect your mornings.",            // [S]
                "Morning hours drove the most activity today.",                              // [N]
                "A morning person in their natural habitat. ☀️ Rare and powerful.",          // [W]
            ]));
            else if (mx === as2) insights.push(pick([
                "Your best work happened in the afternoon today.",                           // [N]
                "Afternoon was your strongest window. Worth scheduling important work then.",// [S]
                "The 2 PM slump? Never heard of it, apparently. ⚡",                         // [W]
            ]));
            else insights.push(pick([
                "Evening was your most active period today.",                                // [N]
                "Late-day focus can be powerful — just watch the sleep impact.",             // [S]
                "Most people are watching Netflix right now. You're in the zone. 🦉",        // [W]
            ]));
        }
    }

    // ── 3. Context switching ──
    if (focusData?.switchPenalty > 0) {
        const sw = Math.round(focusData.switchPenalty / 0.5);
        if (sw > 30) insights.push(pick([
            `${sw} context switches is a lot. Each one costs recovery time.`,              // [S]
            `You switched apps roughly ${sw} times today.`,                                // [N]
            `${sw} app switches. Your tabs have a richer social life than most people. 🔀`,// [W]
        ]));
        else if (sw > 15) insights.push(pick([
            `Around ${sw} context switches. Consider batching similar tasks.`,             // [S]
            `Approximately ${sw} app switches today.`,                                     // [N]
            `${sw} transitions today. Circus performer energy. 🎪`,                        // [W]
        ]));
        else if (sw < 8 && prodPct >= 50) insights.push(pick([
            "Low context switching and solid output — that's the combination to aim for.", // [S]
            "Fewer than 8 app switches today. Clean, focused work pattern.",               // [N]
            "Barely switching apps. That's focus in its purest form. 🧘",                  // [W]
        ]));
    }

    // ── 4. Keyboard energy ──
    if (data.totalKeystrokes > 1200) {
        const keys = data.totalKeystrokes.toLocaleString();
        insights.push(pick([
            `${keys} keystrokes logged. High output day by input volume.`,                 // [N]
            `${keys} keystrokes — your hands did a lot of work today.`,                    // [S]
            `${keys} keystrokes. Your keyboard deserves a thank-you note. ⌨️`,             // [W]
        ]));
    } else if (data.totalKeystrokes > 400) {
        insights.push(pick([
            "Moderate keyboard activity today.",                                            // [N]
            "Input was steady — not frantic, not idle.",                                   // [S]
            "Fingers working, just not sprinting. Reasonable pace.",                       // [W]
        ]));
    }

    // ── 5. Idle time ──
    if (data.totalIdleTime > 0) {
        const idlePct = Math.round((data.totalIdleTime / (totalSeconds + data.totalIdleTime)) * 100);
        if (idlePct >= 25) insights.push(pick([
            `${idlePct}% idle time today — rest is part of the process.`,                 // [N]
            "Taking time away from the screen is healthy. Don't discount idle time.",      // [S]
            `${idlePct}% idle. The brain processes things offline too. 🧠`,               // [W]
        ]));
    }

    // ── 6. Focus score ──
    if (focusData?.score > 0) {
        const s = focusData.score;
        if (s >= 80) insights.push(pick([
            `Focus score of ${s} — that's an exceptionally strong day.`,                  // [S]
            `Focus at ${s} today.`,                                                        // [N]
            `Focus score ${s}? That's not a number, that's a mood. 🎯`,                   // [W]
        ]));
        else if (s >= 60) insights.push(pick([
            `Focus at ${s} — solid and consistent.`,                                       // [N]
            `A ${s} focus score means you showed up and delivered.`,                       // [S]
            `${s} on focus. Well-spent brain. 💡`,                                         // [W]
        ]));
        else if (s >= 35) insights.push(pick([
            `Focus score of ${s}. Moderate — there's room to improve tomorrow.`,          // [S]
            `${s} focus today. A middling day, but still a day of work.`,                  // [N]
            `${s} focus. Not your best chapter, but you're still writing. 📖`,             // [W]
        ]));
        else insights.push(pick([
            `Low focus score of ${s} today. Worth checking what caused the drift.`,       // [S]
            `Focus at ${s}. A tough day — it happens.`,                                    // [N]
            `${s} focus. Even scattered days leave a mark — you showed up. ✌️`,            // [W]
        ]));
    }

    // ── 7. Category split ──
    if (stats?.length > 0) {
        const catMap = {};
        for (const s of stats) catMap[s.main] = (catMap[s.main] || 0) + s.active;
        const unprodPct = Math.round(((catMap["unproductive"] || 0) / totalSeconds) * 100);
        const prodTimePct = Math.round(((catMap["productive"] || 0) / totalSeconds) * 100);

        if (unprodPct <= 8 && prodTimePct >= 60) insights.push(pick([
            "Over 60% of screen time on productive apps. Strong day.",                     // [S]
            `${prodTimePct}% of your time was in productive apps.`,                        // [N]
            "Barely any distracting apps today. Who even are you? 👀",                     // [W]
        ]));
        else if (unprodPct >= 35) insights.push(pick([
            `${unprodPct}% of screen time went to entertainment. Worth being intentional about.`, // [S]
            `${unprodPct}% on non-productive apps today.`,                                 // [N]
            "The algorithm won some battles today. Human. 🍿",                             // [W]
        ]));
    }

    // ── 8. Session count ──
    if (data.totalSessions > 8) insights.push(pick([
        `${data.totalSessions} work sessions today — you kept coming back.`,             // [N]
        `Returning to focused work ${data.totalSessions} times takes real discipline.`,  // [S]
        `${data.totalSessions} sessions. You just kept showing up. That's the game. 🔁`, // [W]
    ]));

    // ── 9. Strong day reinforcement ──
    if (prodPct >= 80 && (focusData?.score || 0) >= 70) insights.push(pick([
        "High productivity and high focus in the same day. That's rare.",                // [S]
        "One of your stronger days by most measures.",                                   // [N]
        "Today is the kind of day worth remembering. You brought it. 🌟",               // [W]
    ]));

    // Shuffle
    for (let i = insights.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [insights[i], insights[j]] = [insights[j], insights[i]];
    }
    return insights;
}

// ─── DAY SUMMARY (ROOT) ──────────────────────────────────────────────────────
export default function DaySummary({ data, stats, hourly, prevWellbeing, focusData, dateKey }) {
    // dateKey — pass the selected date string (e.g. "2025-01-15") from parent
    // so all animated children remount and re-animate when the date changes
    if (!data || data.totalScreenTime === 0) return null;

    const [insights, setInsights] = useState([]);

    useEffect(() => {
        setInsights(generateInsights(data, stats, hourly, prevWellbeing, focusData));
    }, [
        data?.productivityPercent,
        stats?.length,
        prevWellbeing?.productivityPercent,
        focusData?.score,
        hourly?.length,
        dateKey,
    ]);

    const nudge = useMemo(
        () => getNudge(data.totalScreenTime, data.totalIdleTime),
        [Math.floor((data.totalScreenTime || 0) / 60), Math.floor((data.totalIdleTime || 0) / 60)]
    );

    return (
        <>
            <style>{STYLES}</style>
            {/* ds-root has overflow:visible so legend tooltip is never clipped */}
            <div className="ds-root">
                <div className="ds-inner">

                    {/* ── 1. Hourly Sparkline ── */}
                    <HourlySparkline hourly={hourly} animKey={dateKey} />

                    <div className="ds-divider" />

                    {/* ── 2. Day Delta ── */}
                    <DayDelta data={data} prevWellbeing={prevWellbeing} animKey={dateKey} />

                    <div className="ds-divider" />

                    {/* ── 3. Insight Ticker ── */}
                    <InsightTicker insights={insights} />

                    {/* ── 4. Break Nudge ── */}
                    {nudge && <BreakNudge nudge={nudge} />}

                </div>

            </div>
        </>
    );
}
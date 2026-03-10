import { fmtTime } from "../shared/utils";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

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
    color:#2a3a4e;
    line-height:1;
    margin-bottom:4px;
  }
  .ds-dot-btn { background:rgba(255,255,255,0.08) !important; }
  .ds-dot-btn:hover { background:rgba(255,255,255,0.18) !important; }
  .ds-nudge-wrap:hover { background:rgba(255,255,255,0.035) !important; }
`;

// ─── 1. HOURLY SPARKLINE ──────────────────────────────────────────────────────
// Shows 24-bar rhythm of the day. Peak hour is highlighted.
// Bars are colored by time-of-day zone (morning/afternoon/evening).
function HourlySparkline({ hourly }) {
    if (!hourly || hourly.length < 24) return null;

    const max = Math.max(...hourly, 1);
    const peakIdx = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
    const now = new Date().getHours();

    // Zone colors
    const zoneColor = (i) => {
        if (i >= 5 && i < 12) return "#60a5fa"; // morning  — blue
        if (i >= 12 && i < 18) return "#34d399"; // afternoon — green
        if (i >= 18 && i < 23) return "#a78bfa"; // evening  — purple
        return "#334155";                          // night    — muted
    };

    const BAR_W = 4;
    const GAP = 1;
    const H = 24;
    const totalW = 24 * (BAR_W + GAP) - GAP;

    function fmtHour(h) {
        if (h === 0) return "12a";
        if (h < 12) return `${h}a`;
        if (h === 12) return "12p";
        return `${h - 12}p`;
    }

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 0,
            padding: "0 14px", flexShrink: 0, justifyContent: "center"
        }}>
            <div className="ds-label">Today's rhythm</div>

            {/* SVG sparkline */}
            <svg
                width={totalW} height={H + 10}
                style={{ display: "block", overflow: "visible" }}
            >
                {hourly.map((val, i) => {
                    const barH = val > 0 ? Math.max(2, Math.round((val / max) * H)) : 1;
                    const x = i * (BAR_W + GAP);
                    const y = H - barH;
                    const isPeak = i === peakIdx && val > 0;
                    const isPast = i <= now;
                    const color = zoneColor(i);
                    const opacity = isPast ? (isPeak ? 1 : 0.55) : 0.18;

                    return (
                        <g key={i}>
                            <rect
                                x={x} y={y} width={BAR_W} height={barH}
                                rx={1}
                                fill={isPeak ? color : color}
                                opacity={opacity}
                                style={{
                                    transformOrigin: `${x + BAR_W / 2}px ${H}px`,
                                    animation: `ds-bar-grow 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 12}ms both`
                                }}
                            />
                            {/* peak dot */}
                            {isPeak && (
                                <circle
                                    cx={x + BAR_W / 2} cy={y - 3}
                                    r={2} fill={color}
                                    opacity={0.9}
                                />
                            )}
                        </g>
                    );
                })}

                {/* "now" cursor line */}
                {now < 24 && (
                    <line
                        x1={now * (BAR_W + GAP) + BAR_W / 2}
                        y1={0}
                        x2={now * (BAR_W + GAP) + BAR_W / 2}
                        y2={H}
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                    />
                )}

                {/* x-axis hour ticks: 6a, 12p, 6p */}
                {[6, 12, 18].map(h => (
                    <text
                        key={h}
                        x={h * (BAR_W + GAP) + BAR_W / 2}
                        y={H + 9}
                        textAnchor="middle"
                        fontSize={6}
                        fill="#2a3a4e"
                        fontFamily="'DM Mono',monospace"
                    >
                        {fmtHour(h)}
                    </text>
                ))}
            </svg>

            {/* peak label */}
            {hourly[peakIdx] > 0 && (
                <div style={{
                    fontSize: 8.5, color: "#3d5570",
                    fontFamily: "'DM Mono',monospace",
                    marginTop: 2, lineHeight: 1
                }}>
                    peak {fmtHour(peakIdx)}
                    <span style={{ color: zoneColor(peakIdx), marginLeft: 3 }}>↑</span>
                </div>
            )}
        </div>
    );
}

// ─── 2. DAY DELTA BLOCK ───────────────────────────────────────────────────────
// Compares today vs yesterday: productivity % delta + screen time delta.
// Always visible, concrete numbers, no vague labels.
function DayDelta({ data, prevWellbeing }) {
    const hasPrev = prevWellbeing && prevWellbeing.totalScreenTime > 0
        && typeof prevWellbeing.productivityPercent === "number";

    const prodToday = data.productivityPercent || 0;
    const timeToday = data.totalScreenTime || 0;

    if (!hasPrev) {
        // First-time / no history — show a minimal "no comparison" state
        return (
            <div style={{
                display: "flex", flexDirection: "column", gap: 5,
                padding: "0 14px", flexShrink: 0, justifyContent: "center", minWidth: 90
            }}>
                <div className="ds-label">vs yesterday</div>
                <div style={{
                    fontSize: 10.5, color: "#2a3a4e",
                    fontFamily: "'DM Mono',monospace", lineHeight: 1.4
                }}>
                    No prior<br />data yet
                </div>
            </div>
        );
    }

    const prodPrev = prevWellbeing.productivityPercent;
    const timePrev = prevWellbeing.totalScreenTime;

    const prodDiff = Math.round(prodToday - prodPrev);           // percentage points
    const timeDiff = Math.round((timeToday - timePrev) / 60);   // minutes

    // Color + arrow per delta
    const chip = (diff, unit, fmt) => {
        const up = diff > 0;
        const same = diff === 0;
        const isProd = unit === "%";

        // For productivity: up = good (green). For screen time: up = neutral/warn (amber).
        const goodColor = "#34d399";
        const badColor = "#f87171";
        const warnColor = "#fbbf24";
        const dimColor = "#3d5570";

        let color;
        if (same) {
            color = dimColor;
        } else if (isProd) {
            color = up ? goodColor : badColor;
        } else {
            // screen time up = mild warning, down = mild good
            color = up ? warnColor : goodColor;
        }

        const arrow = same ? "—" : up ? "↑" : "↓";
        const sign = same ? "" : up ? "+" : "";
        const label = `${sign}${fmt(Math.abs(diff))}${unit}`;

        return { color, arrow, label, same };
    };

    const prodChip = chip(prodDiff, "%", v => v);
    const timeChip = chip(timeDiff, "m", v => v >= 60 ? `${Math.floor(v / 60)}h${v % 60 > 0 ? `${v % 60}` : ""}` : v);

    const Row = ({ chipData, title }) => (
        <div style={{
            display: "flex", alignItems: "center", gap: 5,
        }}>
            <span style={{
                fontSize: 14, fontWeight: 700, lineHeight: 1,
                fontFamily: "'DM Sans',sans-serif",
                color: chipData.color,
                minWidth: 40
            }}>
                {chipData.same ? "—" : (
                    <>
                        <span style={{ fontSize: 10, marginRight: 1 }}>{chipData.arrow}</span>
                        {chipData.label}
                    </>
                )}
            </span>
            <span style={{
                fontSize: 9, color: "#2a3a4e",
                fontFamily: "'DM Mono',monospace",
                textTransform: "uppercase", letterSpacing: "0.08em"
            }}>
                {title}
            </span>
        </div>
    );

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 6,
            padding: "0 14px", flexShrink: 0, justifyContent: "center", minWidth: 100
        }}>
            <div className="ds-label">vs yesterday</div>
            <Row chipData={prodChip} title="focus" />
            <Row chipData={timeChip} title="screen" />
        </div>
    );
}

// ─── BREAK NUDGE ─────────────────────────────────────────────────────────────
function getNudge(totalScreenTime, totalIdleTime) {
    // Use idle time as a proxy for "time since last break"
    // No idle + long screen time = been sitting a while
    const screenMins = Math.round((totalScreenTime || 0) / 60);
    const idleMins = Math.round((totalIdleTime || 0) / 60);

    // If there's been very little idle time relative to screen time, flag it
    const idleRatio = totalScreenTime > 0 ? (totalIdleTime || 0) / totalScreenTime : 1;

    if (screenMins >= 480 && idleRatio < 0.1)
        return { icon: "🪴", title: "8h, barely idle", msg: "Seriously. Stand up.", color: "#f87171", critical: true };
    if (screenMins >= 480)
        return { icon: "🛋️", title: "8h today", msg: "Your chair misses you less.", color: "#c084fc", critical: false };
    if (screenMins >= 360 && idleRatio < 0.08)
        return { icon: "☕", title: "6h no real break", msg: "Coffee. Stretch. Outside.", color: "#fb923c", critical: false };
    if (screenMins >= 360)
        return { icon: "🚶", title: "6h today", msg: "Walk around. Hydrate.", color: "#34d399", critical: false };
    if (screenMins >= 240 && idleRatio < 0.05)
        return { icon: "🌿", title: "4h, eyes on screen", msg: "Look out the window.", color: "#fbbf24", critical: false };
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
            {/* left accent */}
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

// ─── DATE DOT LEGEND ─────────────────────────────────────────────────────────
export function DateDotLegend() {
    const [show, setShow] = useState(false);
    return (
        <div style={{ position: "relative", flexShrink: 0, alignSelf: "center", marginRight: 11 }}>
            <button
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                onClick={() => setShow(s => !s)}
                style={{
                    width: 20, height: 20, borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.025)",
                    color: "#2a3a4e", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, fontFamily: "'DM Mono',monospace",
                    transition: "all 0.2s"
                }}
            >?</button>
            {show && (
                <div style={{
                    position: "absolute", bottom: "calc(100% + 10px)", right: 0,
                    background: "rgba(7,9,18,0.97)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 12, padding: "12px 14px", zIndex: 100,
                    whiteSpace: "nowrap", boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
                    animation: "ds-fadein 0.15s ease both", minWidth: 190
                }}>
                    <div className="ds-label" style={{ color: "#3d5570", marginBottom: 10 }}>Activity Legend</div>
                    {[
                        { color: "rgba(52,211,153,1)", label: "Productive (≥50%)" },
                        { color: "rgba(251,191,36,1)", label: "Mixed (25–49%)" },
                        { color: "rgba(148,163,184,1)", label: "Low productivity (<25%)" },
                    ].map(({ color, label }) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}77`, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "#4e637a", fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
                        </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: "#2a3a4e", fontFamily: "'DM Sans',sans-serif" }}>No data tracked</span>
                    </div>
                    <div style={{ fontSize: 8, color: "#1a2433", marginTop: 8, fontFamily: "'DM Mono',monospace" }}>Brightness = screen time</div>
                    {/* caret */}
                    <div style={{
                        position: "absolute", bottom: -6, right: 8,
                        width: 10, height: 10, transform: "rotate(45deg)",
                        background: "rgba(7,9,18,0.97)", border: "1px solid rgba(255,255,255,0.09)",
                        borderTop: "none", borderLeft: "none"
                    }} />
                </div>
            )}
        </div>
    );
}

// ─── INSIGHT GENERATOR ───────────────────────────────────────────────────────
function fmtHour(h) {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
}

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
        if (diff >= 15) insights.push(pick([`Yesterday's you would be jealous — you're ${diff}% more focused today. 🚀`, `Whatever you had for breakfast, keep eating it. Up ${diff}% from yesterday.`, `Plot twist: you're actually crushing it. ${diff}% ahead of yesterday.`]));
        else if (diff > 0) insights.push(pick([`Quietly edging out yesterday's version of you. Every percent counts. 🤫`, `Up ${diff}% on yesterday. Slow and steady still wins.`, `A little better than yesterday. The streak is real.`]));
        else if (diff < -15) insights.push(pick([`Yesterday set a high bar. Today's chillier — and that's okay. 🔋`, `Not every day is a highlight reel. Rest is a feature, not a bug.`, `Down ${Math.abs(diff)}% from yesterday. Recharge mode: activated.`]));
        else if (diff < 0) insights.push(pick([`Barely behind yesterday's pace. Nothing a good stretch won't fix.`, `Almost matching yesterday — close enough to count.`, `Tiny dip from yesterday. You're still in the game.`]));
    }

    // ── 2. Peak hour ──
    if (hourly?.length === 24) {
        const peakIdx = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
        if (hourly[peakIdx] > 0) {
            const hour = fmtHour(peakIdx);
            insights.push(pick([`Your brain peaked at ${hour}. That's your personal golden hour. ✨`, `${hour} was chef's kiss for focus today. Guard that slot.`, `If you could bottle ${hour} and sell it, you'd retire early.`]));
        }

        const ms = hourly.slice(6, 12).reduce((a, b) => a + b, 0);
        const as2 = hourly.slice(12, 18).reduce((a, b) => a + b, 0);
        const es = hourly.slice(18, 24).reduce((a, b) => a + b, 0);
        const mx = Math.max(ms, as2, es);
        if (mx > 0) {
            if (mx === ms) insights.push(pick(["A morning person in their natural habitat. ☀️ Rare.", "You hit the ground running. Mornings are your power hours.", "Scientifically a morning person. Disgusting. Impressive."]));
            else if (mx === as2) insights.push(pick(["Afternoon warrior — you warm up slow and then *go*. ⚡", "Peak performance unlocked after lunch. Classic.", "The 2 PM slump? Never heard of it, apparently."]));
            else insights.push(pick(["Night owl energy detected. The best ideas hit at 11 PM. 🦉", "Evening mode: on. Your brain runs on a different timezone.", "Most people are watching Netflix. You're in the zone. Respect."]));
        }
    }

    // ── 3. Context switching ──
    if (focusData?.switchPenalty > 0) {
        const sw = Math.round(focusData.switchPenalty / 0.5);
        if (sw > 30) insights.push(pick([`${sw} app switches. Your tabs have a richer social life than most. 🔀`, `Jumping contexts ${sw} times is basically cardio for your brain. Exhausting cardio.`, `You've context-switched ${sw} times. Your attention is a pinball. 🎰`]));
        else if (sw > 15) insights.push(pick([`About ${sw} app switches — multitasking or just chaotic? (no judgment)`, `${sw} context switches. You're technically doing a lot. Technically.`, `Juggling ${sw} transitions. Certified circus performer.`]));
        else if (sw < 8 && prodPct >= 50) insights.push(pick(["Barely switching apps. That's focus in its purest form. 🧘", "Low context switching + solid productivity = you're onto something.", "You stayed in the zone today. Truly rare behavior in 2025."]));
    }

    // ── 4. Keyboard energy ──
    if (data.totalKeystrokes > 1200)
        insights.push(pick([`${data.totalKeystrokes.toLocaleString()} keystrokes. Your keyboard deserves a thank-you note. ⌨️`, `You've typed ${data.totalKeystrokes.toLocaleString()} times. That's dedication (or very strong opinions).`, `${data.totalKeystrokes.toLocaleString()} keystrokes and counting. The doc is eating well.`]));
    else if (data.totalKeystrokes > 400)
        insights.push(pick(["Measured typing. Quality over quantity. Probably.", "Fingers working, just not sprinting. Good pace.", "Decent keyboard energy — not overwhelming, not asleep."]));

    // ── 5. Idle reframe ──
    if (data.totalIdleTime > 0) {
        const idlePct = Math.round((data.totalIdleTime / (totalSeconds + data.totalIdleTime)) * 100);
        if (idlePct >= 22)
            insights.push(pick([`${idlePct}% idle time — the brain processes things offline too. 🧠`, "You took plenty of breathing room. Deliberate rest is a strategy.", "Idle time isn't wasted time. Your subconscious was solving things."]));
    }

    // ── 6. Focus score ──
    if (focusData?.score > 0) {
        const s = focusData.score;
        if (s >= 80) insights.push(pick([`Focus score ${s}? That's not a number, that's a mood. 🎯`, `${s} focus score. You could charge for this level of output.`, `Focus at ${s}. Whatever you're doing — keep doing it.`]));
        else if (s >= 60) insights.push(pick([`Focus at ${s}. Solid. Not perfect, but real.`, `${s} on focus today. That's a well-spent brain. 💡`, `${s} focus score — you showed up and delivered.`]));
        else if (s < 35) insights.push(pick([`Focus at ${s}. Even scattered days leave a mark — you showed up.`, `${s} isn't where you want, but it's data, not a verdict.`, `Low focus day? Tomorrow's settings. Today still happened. ✌️`]));
    }

    // ── 7. Category split ──
    if (stats?.length > 0) {
        const catMap = {};
        for (const s of stats) catMap[s.main] = (catMap[s.main] || 0) + s.active;
        const unprodPct = Math.round(((catMap["unproductive"] || 0) / totalSeconds) * 100);
        const prodTimePct = Math.round(((catMap["productive"] || 0) / totalSeconds) * 100);
        if (unprodPct <= 8 && prodTimePct >= 60) insights.push(pick(["Barely any distracting apps today. Who ARE you? 👀", "Almost zero entertainment apps. Monk mode confirmed.", "You kept distractions to a minimum. Quietly impressive."]));
        else if (unprodPct >= 35) insights.push(pick([`${unprodPct}% distraction time. The algorithm won some battles today. 🍿`, "Not the most focused split, but humans need downtime too.", "A chunk on entertainment — balanced or drifting, only you know."]));
    }

    // ── 8. Earned praise ──
    if (prodPct >= 80 && (focusData?.score || 0) >= 70)
        insights.push(pick(["Genuinely one of your better days. Take a moment to appreciate that. 🌟", "High productivity + high focus is a rare combo. Savour it.", "Today is the kind of day worth remembering. You brought it."]));

    if (data.totalSessions > 8)
        insights.push(pick([`${data.totalSessions} sessions today — you just kept coming back. That's the whole game.`, `Back ${data.totalSessions} times today. Consistency is underrated.`, `${data.totalSessions} work sessions. You're building a habit, not just a day.`]));

    // Shuffle
    for (let i = insights.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [insights[i], insights[j]] = [insights[j], insights[i]];
    }
    return insights;
}

// ─── DAY SUMMARY (ROOT) ──────────────────────────────────────────────────────
export default function DaySummary({ data, stats, hourly, prevWellbeing, focusData }) {
    if (!data || data.totalScreenTime === 0) return null;

    const [insights, setInsights] = useState([]);

    useEffect(() => {
        setInsights(generateInsights(data, stats, hourly, prevWellbeing, focusData));
    }, [
        data?.productivityPercent,
        stats?.length,
        prevWellbeing?.productivityPercent,
        focusData?.score,
        hourly?.length
    ]);

    const nudge = useMemo(
        () => getNudge(data.totalScreenTime, data.totalIdleTime),
        [Math.floor((data.totalScreenTime || 0) / 60), Math.floor((data.totalIdleTime || 0) / 60)]
    );
    return (
        <>
            <style>{STYLES}</style>
            <div className="ds-root">

                {/* ── 1. Hourly Sparkline ── */}
                <HourlySparkline hourly={hourly} />

                <div className="ds-divider" />

                {/* ── 2. Day Delta (vs yesterday) ── */}
                <DayDelta data={data} prevWellbeing={prevWellbeing} />

                <div className="ds-divider" />

                {/* ── 3. Insight Ticker ── */}
                <InsightTicker insights={insights} />

                {/* ── 4. Break Nudge (screen-time + idle based) ── */}
                {nudge && <BreakNudge nudge={nudge} />}

                {/* ── 5. Legend ── */}
                <DateDotLegend />

            </div>
        </>
    );
}
import { fmtTime } from "../shared/utils";
import { useState, useEffect, useRef } from "react";

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

// ─── BREAK NUDGE LOGIC ────────────────────────────────────────────────────────
function getBreakNudge(totalScreenTime, sessionDuration) {
    const screenMins = Math.round((totalScreenTime || 0) / 60);
    const sessionMins = Math.round((sessionDuration || 0) / 60);

    // Session-based nudges (more urgent — unbroken stretch)
    if (sessionMins >= 120) return {
        level: "critical",
        icon: "🪴",
        label: "2h no break",
        message: "Your eyes need air. Seriously.",
        color: "#f87171",
        glow: "rgba(248,113,113,0.3)"
    };
    if (sessionMins >= 90) return {
        level: "high",
        icon: "☕",
        label: "90min streak",
        message: "Coffee break, now.",
        color: "#fb923c",
        glow: "rgba(251,146,60,0.25)"
    };
    if (sessionMins >= 60) return {
        level: "medium",
        icon: "🌿",
        label: "1h session",
        message: "Touch some grass.",
        color: "#facc15",
        glow: "rgba(250,204,21,0.2)"
    };
    if (sessionMins >= 45) return {
        level: "low",
        icon: "🪟",
        label: "45min in",
        message: "Look outside for 20s.",
        color: "#60a5fa",
        glow: "rgba(96,165,250,0.2)"
    };

    // Immediate "Starter" nudge for feedback
    if (sessionDuration >= 15 && sessionDuration < 180) return {
        level: "low",
        icon: "🌱",
        label: "Flow Starting",
        message: "Stay focused, you're doing great.",
        color: "#4ade80",
        glow: "rgba(74,222,128,0.2)"
    };

    // Total screen time nudges (softer, cumulative)
    if (screenMins >= 480) return {
        level: "high",
        icon: "🛋️",
        label: "8h screen",
        message: "Your chair misses you less than you think.",
        color: "#c084fc",
        glow: "rgba(192,132,252,0.25)"
    };
    if (screenMins >= 360) return {
        level: "medium",
        icon: "🚶",
        label: "6h today",
        message: "Walk around. Hydrate. You're a person.",
        color: "#34d399",
        glow: "rgba(52,211,153,0.2)"
    };

    return null;
}

// ─── BREAK NUDGE PILL ─────────────────────────────────────────────────────────
function BreakNudge({ nudge }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: "flex", alignItems: "center", gap: 7,
                background: hovered ? `rgba(255,255,255,0.07)` : `rgba(255,255,255,0.04)`,
                border: `1px solid ${nudge.color}33`,
                borderRadius: 10, padding: "5px 10px",
                cursor: "default", flexShrink: 0,
                boxShadow: hovered ? `0 0 14px ${nudge.glow}` : "none",
                transition: "all 0.25s ease",
                position: "relative", overflow: "hidden"
            }}
        >
            {/* subtle pulse ring for critical */}
            {nudge.level === "critical" && (
                <div style={{
                    position: "absolute", inset: 0, borderRadius: 10,
                    border: `1px solid ${nudge.color}55`,
                    animation: "nudge-pulse 2s ease-in-out infinite"
                }} />
            )}
            <span style={{ fontSize: 15, lineHeight: 1 }}>{nudge.icon}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ fontSize: 8, color: nudge.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1 }}>
                    {nudge.label}
                </div>
                <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 500, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                    {nudge.message}
                </div>
            </div>
        </div>
    );
}

// ─── FOCUS VIBE METER ─────────────────────────────────────────────────────────
// Replaces the raw "Time + Score" stat blocks with something more meaningful:
// a single "vibe" reading that combines session quality, prod%, and switching.
function FocusVibe({ data, focusData, sessionDuration }) {
    const prodPct = data.productivityPercent || 0;
    const sessionMins = Math.round((sessionDuration || 0) / 60);
    const score = focusData?.score || 0;
    const switches = focusData?.switchPenalty ? Math.round(focusData.switchPenalty / 0.5) : 0;

    // Compute a vibe from combined signals
    let vibe, emoji, color, sub;
    if (prodPct >= 70 && score >= 65 && switches < 15) {
        vibe = "Deep Work"; emoji = "🔥"; color = "#34d399";
        sub = "You're locked in";
    } else if (prodPct >= 50 && score >= 40) {
        vibe = "Solid Flow"; emoji = "⚡"; color = "#60a5fa";
        sub = "Good momentum";
    } else if (switches > 25 && prodPct < 50) {
        vibe = "Scattered"; emoji = "🌀"; color = "#facc15";
        sub = "Too many tabs?";
    } else if (sessionMins > 90 && prodPct < 40) {
        vibe = "Grinding"; emoji = "😮‍💨"; color = "#fb923c";
        sub = "Long but drifting";
    } else if (prodPct < 30) {
        vibe = "Chill Mode"; emoji = "🌊"; color = "#94a3b8";
        sub = "Low intensity day";
    } else {
        vibe = "Steady"; emoji = "🎯"; color = "#a78bfa";
        sub = "Consistent effort";
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Vibe</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji}</span>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'DM Sans',sans-serif", lineHeight: 1 }}>{vibe}</div>
                    <div style={{ fontSize: 9, color: "#475569", lineHeight: 1.2 }}>{sub}</div>
                </div>
            </div>
        </div>
    );
}

// ─── STREAK BADGE ─────────────────────────────────────────────────────────────
// Shows the current unbroken session as a live ticker — much more useful than raw total
function SessionClock({ sessionDuration }) {
    const mins = Math.floor((sessionDuration || 0) / 60);
    if (mins < 1) return null; // Show after 1 minute

    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const isLong = mins >= 60;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Session</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: isLong ? "#fb923c" : "#34d399",
                    boxShadow: `0 0 6px ${isLong ? "#fb923c" : "#34d399"}88`,
                    animation: "session-blink 2s ease-in-out infinite"
                }} />
                <div style={{
                    fontSize: 15, fontWeight: 700,
                    color: isLong ? "#fb923c" : "#f8fafc",
                    fontFamily: "'DM Sans',sans-serif", lineHeight: 1
                }}>{label}</div>
            </div>
        </div>
    );
}

// ─── INSIGHT GENERATOR ────────────────────────────────────────────────────────
function fmtHour(h) {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
}

function generateInsights(data, stats, hourly, prevWellbeing, focusData, sessionDuration) {
    const insights = [];
    if (!data || data.totalScreenTime === 0) return insights;

    const totalSeconds = data.totalScreenTime || 0;
    const prodPct = data.productivityPercent || 0;
    const productiveSeconds = Math.round(totalSeconds * prodPct / 100);
    const sessionMins = Math.round((sessionDuration || 0) / 60);

    const nb = (s) => s.replace(/(\d+)\s*([apmAPMhminutesteconds]+)/g, "$1\u00A0$2");
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // ── 1. Yesterday comparison (behavioral delta, not raw numbers) ──
    if (prevWellbeing && typeof prevWellbeing.productivityPercent === "number" && prevWellbeing.totalScreenTime > 0) {
        const prevProd = prevWellbeing.productivityPercent;
        const diff = Math.round(prodPct - prevProd);

        if (diff >= 15) insights.push(pick([
            `Yesterday's you would be jealous right now. You're ${diff}% more focused today. 🚀`,
            `Plot twist: you're actually crushing it. ${diff}% more productive than yesterday.`,
            `Whatever you ate for breakfast — keep eating it. Up ${diff}% from yesterday.`
        ]));
        else if (diff > 0) insights.push(pick([
            `Slightly edging out yesterday's version of you. Every percent counts.`,
            `A little better than yesterday. Quietly winning. 🤫`,
            `Up ${diff}% on yesterday — the streak is real.`
        ]));
        else if (diff < -15) insights.push(pick([
            `Yesterday set a high bar. Today's a bit chillier — and that's okay.`,
            `Not every day is a highlight reel. Rest is also a feature, not a bug.`,
            `Down ${Math.abs(diff)}% from yesterday. Recharge mode activated? 🔋`
        ]));
        else if (diff < 0) insights.push(pick([
            `Just a tiny dip from yesterday. Nothing a good stretch can't fix.`,
            `Almost matching yesterday — close enough to count.`,
            `Barely behind yesterday's pace. You're still in the game.`
        ]));
    }

    // ── 2. Peak hour — the "when you're a genius" moment ──
    if (hourly && hourly.length === 24) {
        const peakIdx = hourly.reduce((pi, v, i) => v > hourly[pi] ? i : pi, 0);
        if (hourly[peakIdx] > 0) {
            const hour = fmtHour(peakIdx);
            insights.push(pick([
                `Your brain peaked at ${hour}. That's your personal golden hour. ✨`,
                `${hour} was chef's kiss for focus today. Protect that time slot.`,
                `If you could bottle ${hour} and sell it, you'd retire early.`
            ]));
        }

        // Morning vs afternoon vs evening personality
        const morningSum = hourly.slice(6, 12).reduce((a, b) => a + b, 0);
        const afternoonSum = hourly.slice(12, 18).reduce((a, b) => a + b, 0);
        const eveningSum = hourly.slice(18, 24).reduce((a, b) => a + b, 0);
        const max = Math.max(morningSum, afternoonSum, eveningSum);
        if (max > 0) {
            if (max === morningSum) insights.push(pick([
                "A morning person in their natural habitat. ☀️ Rare and powerful.",
                "You hit the ground running. Mornings are your power hours.",
                "Scientifically a morning person. Disgusting. Impressive."
            ]));
            else if (max === afternoonSum) insights.push(pick([
                "Afternoon warrior. You warm up slow and then *go*. ⚡",
                "Peak performance unlocked after lunch. Classic.",
                "The 2 PM slump? Never heard of it, apparently."
            ]));
            else insights.push(pick([
                "Night owl energy detected. The best ideas do hit at 11 PM. 🦉",
                "Evening mode: activated. Your brain runs on a different timezone.",
                "Most people are watching Netflix. You're in the zone. Respect."
            ]));
        }
    }

    // ── 3. Context switching personality ──
    if (focusData && typeof focusData.switchPenalty === "number" && focusData.switchPenalty > 0) {
        const approxSwitches = Math.round(focusData.switchPenalty / 0.5);
        if (approxSwitches > 30) insights.push(pick([
            `${approxSwitches} app switches today. Your tabs have a richer social life than most people. 🔀`,
            `Switching apps ${approxSwitches} times is basically cardio for your brain. Exhausting cardio.`,
            `You've jumped contexts ${approxSwitches} times. Your attention is a pinball. 🎰`
        ]));
        else if (approxSwitches > 15) insights.push(pick([
            `About ${approxSwitches} app switches — multitasking or just chaotic? (it's okay, we don't judge)`,
            `${approxSwitches} context switches. You're technically doing a lot. Technically.`,
            `Juggling ${approxSwitches} transitions today. Circus performer vibes.`
        ]));
        else if (approxSwitches < 8 && prodPct >= 50) insights.push(pick([
            "Barely switching apps. That's focus in its purest form. 🧘",
            "Low context switching + good productivity = you're onto something.",
            "You stayed in the zone today. Truly rare behavior in 2025."
        ]));
    }

    // ── 4. Keyboard activity (energy gauge) ──
    if (data.totalKeystrokes > 1000) {
        const keys = data.totalKeystrokes.toLocaleString();
        insights.push(pick([
            `${keys} keystrokes. Your keyboard deserves a thank-you note. ⌨️`,
            `You've typed ${keys} times today. That's dedication (or very strong opinions).`,
            `${keys} keystrokes and counting. The document is eating well today.`
        ]));
    } else if (data.totalKeystrokes > 300) {
        insights.push(pick([
            "Decent keyboard energy today. Not overwhelming, not asleep.",
            "Measured typing. Quality over quantity. Probably.",
            "Your fingers are working, just not sprinting."
        ]));
    }

    // ── 5. Session length awareness ──
    if (sessionMins >= 90) insights.push(pick([
        `You've been locked in for ${sessionMins} minutes straight. Heroic. Also concerning. 🫡`,
        `${sessionMins} minutes without a real break. Your future self wants a word.`,
        `That's a ${sessionMins}-minute unbroken session. Legend behavior. Please stand up though.`
    ]));
    else if (sessionMins >= 50) insights.push(pick([
        `${sessionMins} minutes into this session and still going. Solid endurance.`,
        `You've been at it for ${sessionMins} minutes. A break is coming — plan for it.`,
        `Almost an hour into this stretch. Your momentum is real.`
    ]));

    // ── 6. Idle time reframe ──
    if (data.totalIdleTime > 0 && totalSeconds > 0) {
        const idlePct = Math.round((data.totalIdleTime / (totalSeconds + data.totalIdleTime)) * 100);
        if (idlePct >= 20) insights.push(pick([
            `${idlePct}% of your time was idle — the brain processes stuff offline too. 🧠`,
            `You took plenty of breathing room today. Deliberate rest is a strategy.`,
            `Idle time isn't wasted time. Your subconscious was probably solving things.`
        ]));
    }

    // ── 7. Focus score personality ──
    if (focusData && typeof focusData.score === "number" && focusData.score > 0) {
        const s = focusData.score;
        if (s >= 80) insights.push(pick([
            `Focus score ${s}? That's not a number, that's a mood. 🎯`,
            `${s} focus score. You could charge for this level of output.`,
            `Focus at ${s} — whatever you're doing, keep doing it.`
        ]));
        else if (s >= 60) insights.push(pick([
            `Focus at ${s}. Solid. Not perfect, but real.`,
            `${s} focus score — you showed up and delivered.`,
            `${s} on focus today. That's a well-spent brain. 💡`
        ]));
        else if (s < 35) insights.push(pick([
            `Focus score of ${s}. Even scattered days leave a mark — you showed up.`,
            `${s} isn't where you want to be, but it's a data point, not a verdict.`,
            `Low focus day? Tomorrow's settings. Today still happened. ✌️`
        ]));
    }

    // ── 8. Category mood ──
    if (stats && stats.length > 0) {
        const catMap = {};
        for (const s of stats) catMap[s.main] = (catMap[s.main] || 0) + s.active;
        const unprodTime = catMap["unproductive"] || 0;
        const unprodPct = Math.round((unprodTime / totalSeconds) * 100);
        const prodTime = catMap["productive"] || 0;
        const prodTimePct = Math.round((prodTime / totalSeconds) * 100);

        if (unprodPct <= 10 && prodTimePct >= 60) {
            insights.push(pick([
                "Barely any distracting apps today. Who ARE you? 👀",
                "Almost zero entertainment apps. Monk mode confirmed.",
                "You kept distractions to a minimum. Quietly impressive."
            ]));
        } else if (unprodPct >= 35) {
            insights.push(pick([
                `A third of your time went to entertainment. Balanced or off-track — only you know. 🍿`,
                `${unprodPct}% distraction time. The algorithm won some battles today.`,
                "Not the most focused split today, but humans need downtime too."
            ]));
        }
    }

    // ── 9. Positive reinforcement (earned, not generic) ──
    if (prodPct >= 80 && (focusData?.score || 0) >= 70) insights.push(pick([
        "Genuinely one of your better days. Take a moment to appreciate that. 🌟",
        "Today is the kind of day worth remembering. You brought it.",
        "High productivity + high focus? That's a rare combo. Savour it."
    ]));

    if (data.totalSessions > 8) insights.push(pick([
        `${data.totalSessions} sessions today. You just kept coming back. That's the whole game.`,
        `Back ${data.totalSessions} times today. Consistency is underrated.`,
        `${data.totalSessions} distinct work sessions — you're building a habit, not just a day.`
    ]));

    // Shuffle
    for (let i = insights.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [insights[i], insights[j]] = [insights[j], insights[i]];
    }
    return insights;
}

// ─── ROTATING INSIGHT TICKER ──────────────────────────────────────────────────
function InsightTicker({ insights }) {
    const [idx, setIdx] = useState(0);
    const [phase, setPhase] = useState("visible");
    const timerRef = useRef(null);
    const n = insights.length;

    useEffect(() => {
        if (n <= 1) return;
        timerRef.current = setInterval(() => {
            setPhase("exit");
            setTimeout(() => {
                setIdx(prev => (prev + 1) % n);
                setPhase("enter");
                setTimeout(() => setPhase("visible"), 50);
            }, 350);
        }, 5500);
        return () => clearInterval(timerRef.current);
    }, [n]);

    useEffect(() => { setIdx(0); setPhase("visible"); }, [insights.length]);

    if (n === 0) return null;
    const text = insights[idx % n];
    const fontSize = text.length > 95 ? 10.5 : text.length > 72 ? 12 : 13;

    const transform =
        phase === "exit" ? "translateY(-100%)" :
            phase === "enter" ? "translateY(100%)" :
                "translateY(0)";
    const opacity = phase === "visible" ? 1 : 0;

    return (
        <div style={{ flex: 1, minWidth: 60, overflow: "hidden", height: "100%", display: "flex", alignItems: "center", padding: "0 8px" }}>
            <div style={{
                transform, opacity,
                transition: phase === "enter" ? "none" : "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                width: "100%"
            }}>
                <div style={{
                    fontSize, color: "#cbd5e1", fontWeight: 500,
                    fontFamily: "'DM Sans',sans-serif",
                    lineHeight: 1.4, wordWrap: "break-word"
                }}>
                    {text}
                </div>
            </div>
        </div>
    );
}

// ─── DAY SUMMARY ─────────────────────────────────────────────────────────────
export default function DaySummary({ data, stats, hourly, prevWellbeing, focusData, sessionDuration }) {
    if (!data || data.totalScreenTime === 0) return null;

    const [insights, setInsights] = useState([]);
    useEffect(() => {
        const result = generateInsights(data, stats, hourly, prevWellbeing, focusData, sessionDuration);
        setInsights(result);
    }, [
        data?.productivityPercent,
        stats?.length,
        prevWellbeing?.productivityPercent,
        focusData?.score,
        Math.floor(sessionDuration / 300), // Update insights every 5 minutes
        hourly?.length
    ]);

    const nudge = getBreakNudge(data.totalScreenTime, sessionDuration);

    return (
        <>
            {/* Keyframes injected once */}
            <style>{`
                @keyframes nudge-pulse {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.03); }
                }
                @keyframes session-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.35; }
                }
            `}</style>

            <div style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(15,18,30,0.6)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: "8px 16px",
                backdropFilter: "blur(20px)",
                flex: 1, minWidth: 0,
                animation: "legend-slide-in 0.4s ease both",
                height: "100%"
            }}>

                {/* ── Focus Vibe (replaces raw Time + Score) ── */}
                <FocusVibe data={data} focusData={focusData} sessionDuration={sessionDuration} />

                {/* ── Session Clock (live unbroken session) ── */}
                {sessionDuration >= 60 && (
                    <>
                        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch", flexShrink: 0 }} />
                        <SessionClock sessionDuration={sessionDuration} />
                    </>
                )}

                <div style={{ width: 1, background: "rgba(255,255,255,0.06)", alignSelf: "stretch", flexShrink: 0 }} />

                {/* ── Rotating Insight Ticker ── */}
                <InsightTicker insights={insights} />

                {/* ── Break Nudge (replaces Top App) ── */}
                {nudge && (
                    <>
                        <div style={{ width: 1, background: "rgba(255,255,255,0.06)", alignSelf: "stretch", flexShrink: 0 }} />
                        <BreakNudge nudge={nudge} />
                    </>
                )}

                <DateDotLegend />
            </div>
        </>
    );
}
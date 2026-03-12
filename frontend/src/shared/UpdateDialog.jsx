import { useState, useEffect } from "react";

const C = {
    bg: "#080b14",
    surface: "rgba(10, 13, 24, 0.98)",
    border: "rgba(255,255,255,0.07)",
    borderMed: "rgba(255,255,255,0.11)",
    text: "#f0f4f8",
    textSub: "#94a3b8",
    textMuted: "#4a5568",
    green: "#4ade80",
    blue: "#60a5fa",
    yellow: "#fbbf24",
    cyan: "#22d3ee",
    red: "#f87171",
};

const DIALOG_CSS = `
  @keyframes ud-overlay-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ud-modal-in { from { opacity: 0; transform: scale(0.9) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes ud-slide-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ud-snooze-in { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  
  .ud-btn {
    transition: filter 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    border: none;
    font-family: 'DM Sans', sans-serif;
    font-weight: 600;
  }
  .ud-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .ud-btn:active { transform: translateY(0) scale(0.98); }
  .ud-btn:disabled { opacity: 0.45; cursor: default; filter: none; transform: none; }
  
  .ud-snooze-opt {
    transition: background 0.15s ease;
    cursor: pointer;
    border-radius: 8px;
  }
  .ud-snooze-opt:hover { background: rgba(255,255,255,0.05) !important; }
  
  .ud-scroll::-webkit-scrollbar { width: 4px; }
  .ud-scroll::-webkit-scrollbar-track { background: transparent; }
  .ud-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
`;

const SNOOZE_OPTIONS = [
  { label: "1 hour",   hours: 1,   icon: "⏰" },
  { label: "4 hours",  hours: 4,   icon: "🕓" },
  { label: "Tomorrow", hours: 24,  icon: "📅" },
  { label: "1 week",   hours: 168, icon: "📆" },
];

const REMIND_KEY = "stasis_remind_after";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function inferSectionIcon(title) {
    const t = title.toLowerCase();
    if (t.includes("fix") || t.includes("bug")) return "🐛";
    if (t.includes("feat") || t.includes("new") || t.includes("add")) return "✨";
    if (t.includes("break") || t.includes("change")) return "⚠️";
    if (t.includes("perf") || t.includes("optim")) return "⚡";
    if (t.includes("security") || t.includes("sec")) return "🔐";
    if (t.includes("docs") || t.includes("doc")) return "📖";
    if (t.includes("refactor") || t.includes("clean")) return "♻️";
    if (t.includes("remove") || t.includes("deprec")) return "🗑️";
    if (t.includes("ui") || t.includes("design") || t.includes("style")) return "🎨";
    return "✦";
}

function parseReleaseBody(body) {
    if (!body) return [];
    const lines = body.split("\n");
    const sections = [];
    let current = null;

    const ensureSection = (title = "Changes") => {
        if (!current) current = { title, icon: inferSectionIcon(title), items: [] };
        return current;
    };
    const pushCurrent = () => {
        if (current && (current.items.length > 0 || (current.note && current.note.trim()))) {
            sections.push(current);
        }
        current = null;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("#")) {
            pushCurrent();
            const title = line.replace(/^#+\s*/, "").trim();
            current = { title, icon: inferSectionIcon(title), items: [] };
            continue;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
            ensureSection("Changes").items.push(line.replace(/^[-*]\s*/, "").trim());
            continue;
        }
        const s = ensureSection("General");
        s.note = (s.note || "") + line + " ";
    }
    pushCurrent();
    return sections;
}

// ─── SNOOZE PICKER ────────────────────────────────────────────────────────────
function SnoozePicker({ onSnooze, onCancel }) {
    return (
        <div style={{
            padding: "16px 24px 20px",
            borderTop: `1px solid ${C.border}`,
            animation: "ud-snooze-in 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted, marginBottom: 10 }}>
                Remind me in…
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {SNOOZE_OPTIONS.map(opt => (
                    <button
                        key={opt.hours}
                        className="ud-snooze-opt"
                        onClick={() => onSnooze(opt.hours)}
                        style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                            background: "rgba(255,255,255,0.03)",
                            border: `1px solid ${C.border}`,
                            fontFamily: "'DM Sans', sans-serif",
                        }}
                    >
                        <span style={{ fontSize: 16 }}>{opt.icon}</span>
                        <span style={{ fontSize: 13, color: C.textSub, fontWeight: 500 }}>{opt.label}</span>
                    </button>
                ))}
            </div>
            <button
                className="ud-btn"
                onClick={onCancel}
                style={{
                    marginTop: 10, width: "100%", padding: "9px",
                    borderRadius: 8, background: "none",
                    border: `1px solid transparent`,
                    color: C.textMuted, fontSize: 12,
                }}
            >
                ← Back
            </button>
        </div>
    );
}

// ─── UPDATE DIALOG ────────────────────────────────────────────────────────────
export default function UpdateDialog({ updateState, releases, onDownload, onLater }) {
    const latestVersion = updateState?.latest_version;
    const currentVersion = updateState?.current_version;
    const [showSnooze, setShowSnooze] = useState(false);
    const [snoozed, setSnoozed] = useState(false);
    const [snoozedLabel, setSnoozedLabel] = useState("");

    const latestRelease = releases?.find(r => r.tag_name.replace(/^v/, "") === latestVersion?.replace(/^v/, ""));
    const changelog = latestRelease ? parseReleaseBody(latestRelease.body) : [];

    const handleSnooze = (hours) => {
        const remindAt = Date.now() + hours * 60 * 60 * 1000;
        localStorage.setItem(REMIND_KEY, remindAt.toString());
        const opt = SNOOZE_OPTIONS.find(o => o.hours === hours);
        setSnoozedLabel(opt?.label || `${hours}h`);
        setSnoozed(true);
        // Close after brief confirmation
        setTimeout(() => onLater(), 1400);
    };

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
            animation: "ud-overlay-in 0.3s ease",
        }}>
            <style>{DIALOG_CSS}</style>

            <div style={{
                width: "90%", maxWidth: 500,
                background: C.surface,
                border: `1px solid ${C.borderMed}`,
                borderRadius: 28,
                boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)",
                animation: "ud-modal-in 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                maxHeight: "85vh",
            }}>
                {/* Header */}
                <div style={{
                    padding: "32px 32px 24px",
                    background: "linear-gradient(180deg, rgba(74,222,128,0.05) 0%, transparent 100%)",
                    borderBottom: `1px solid ${C.border}`,
                    textAlign: "center"
                }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: 18,
                        background: "linear-gradient(135deg, rgba(74,222,128,0.2), rgba(34,211,238,0.1))",
                        border: `1px solid rgba(74,222,128,0.3)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 32, margin: "0 auto 20px",
                        boxShadow: "0 0 30px rgba(74,222,128,0.15)"
                    }}>🚀</div>
                    <h2 style={{
                        fontFamily: "'DM Serif Display', serif",
                        fontSize: 28, fontWeight: 400, color: C.text,
                        marginBottom: 8, letterSpacing: "-0.01em"
                    }}>Update Available</h2>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, color: C.textSub }}>v{currentVersion}</span>
                        <span style={{ color: C.textMuted }}>→</span>
                        <span style={{
                            fontSize: 13, fontWeight: 700, color: C.green,
                            background: "rgba(74,222,128,0.1)", padding: "2px 10px", borderRadius: 20,
                            border: "1px solid rgba(74,222,128,0.2)"
                        }}>v{latestVersion}</span>
                    </div>
                </div>

                {/* Changelog */}
                <div className="ud-scroll" style={{
                    flex: 1, overflowY: "auto", padding: "24px 32px",
                    display: "flex", flexDirection: "column", gap: 20
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textMuted }}>
                        What's New
                    </div>
                    {changelog.length > 0 ? (
                        changelog.map((section, idx) => (
                            <div key={idx} style={{ animation: `ud-slide-up 0.4s ease ${idx * 0.05}s both` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: 14 }}>{section.icon}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>{section.title}</span>
                                </div>
                                {section.note && (
                                    <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 8, marginLeft: 22 }}>
                                        {section.note}
                                    </p>
                                )}
                                <ul style={{ listStyle: "none", padding: 0, margin: 0, marginLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
                                    {section.items.map((item, i) => (
                                        <li key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
                                            <span style={{ color: C.green, marginTop: 1 }}>•</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: "center", padding: "20px 0", color: C.textMuted, fontSize: 13, fontStyle: "italic" }}>
                            Routine improvements and bug fixes.
                        </div>
                    )}
                </div>

                {/* Snooze confirmation state */}
                {snoozed ? (
                    <div style={{
                        padding: "20px 32px 28px", borderTop: `1px solid ${C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                        animation: "ud-slide-up 0.25s ease",
                    }}>
                        <span style={{ fontSize: 18 }}>✅</span>
                        <span style={{ fontSize: 13, color: C.textSub }}>
                            Got it — reminding you in <strong style={{ color: C.text }}>{snoozedLabel}</strong>
                        </span>
                    </div>
                ) : showSnooze ? (
                    <SnoozePicker onSnooze={handleSnooze} onCancel={() => setShowSnooze(false)} />
                ) : (
                    /* Footer Actions */
                    <div style={{
                        padding: "24px 32px 32px",
                        borderTop: `1px solid ${C.border}`,
                        display: "flex", gap: 12,
                    }}>
                        <button className="ud-btn" onClick={() => setShowSnooze(true)} style={{
                            flex: 1, padding: "14px", borderRadius: 12,
                            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                            color: C.textSub, fontSize: 14,
                        }}>
                            Remind Later
                        </button>
                        <button className="ud-btn" onClick={onDownload} style={{
                            flex: 1.5, padding: "14px", borderRadius: 12,
                            background: "linear-gradient(135deg, #4ade80, #22d3ee)", border: "none",
                            color: "#060a12", fontSize: 14, fontWeight: 700,
                            boxShadow: "0 10px 25px rgba(74,222,128,0.3)",
                        }}>
                            Download Now
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
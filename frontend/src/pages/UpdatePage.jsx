import { useState, useEffect, useCallback, useRef } from "react";
import { GITHUB_REPO, shouldAutoCheckUpdate, recordUpdateCheck } from "../shared/updateUtils";

// ─── CONSTANTS (mirrors SettingsPage) ────────────────────────────────────────
const BASE_URL = "http://127.0.0.1:7432";

const C = {
  bg: "#080b14",
  surface: "rgba(8, 11, 20, 0.97)",
  border: "rgba(255,255,255,0.07)",
  borderMed: "rgba(255,255,255,0.11)",
  text: "#f0f4f8",
  textSub: "#94a3b8",
  textMuted: "#4a5568",
  textDim: "rgba(255,255,255,0.12)",
  green: "#4ade80",
  greenGlow: "rgba(74,222,128,0.18)",
  blue: "#60a5fa",
  blueGlow: "rgba(96,165,250,0.15)",
  yellow: "#fbbf24",
  yellowGlow: "rgba(251,191,36,0.15)",
  red: "#f87171",
  purple: "#a78bfa",
  cyan: "#22d3ee",
};

const UPDATE_CSS = `
  @keyframes up-spin   { to { transform: rotate(360deg) } }
  @keyframes up-ping   { 0%{transform:scale(1);opacity:0.7} 70%{transform:scale(2.4);opacity:0} 100%{transform:scale(2.4);opacity:0} }
  @keyframes up-in     { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
  @keyframes up-slide  { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:none} }
  @keyframes up-pop    { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
  @keyframes up-bar    { from{width:0} to{width:var(--w)} }
  @keyframes up-shimmer{ 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes up-pulse-border {
    0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); border-color: rgba(74,222,128,0.25); }
    50%     { box-shadow: 0 0 0 4px rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.5); }
  }
  @keyframes up-progress-glow {
    0%,100% { box-shadow: 0 0 8px rgba(74,222,128,0.4); }
    50%     { box-shadow: 0 0 20px rgba(74,222,128,0.8); }
  }
  @keyframes up-download-bounce {
    0%,100% { transform: translateY(0); }
    40%     { transform: translateY(-3px); }
    60%     { transform: translateY(-1px); }
  }
  .up-release-card {
    transition: border-color 0.2s, background 0.2s, transform 0.18s;
    cursor: pointer;
  }
  .up-release-card:hover {
    border-color: rgba(255,255,255,0.14) !important;
    background: rgba(255,255,255,0.025) !important;
    transform: translateX(2px);
  }
  .up-btn {
    transition: background 0.15s, border-color 0.15s, box-shadow 0.2s, transform 0.12s;
  }
  .up-btn:hover { filter: brightness(1.1); }
  .up-btn:active { transform: scale(0.96); }
  .up-tag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
    text-transform: uppercase; border-radius: 6px;
    padding: 2px 8px; border: 1px solid;
  }
  .up-scroll::-webkit-scrollbar { width: 3px; }
  .up-scroll::-webkit-scrollbar-track { background: transparent; }
  .up-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function daysSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function semverCompare(a, b) {
  const pa = (a || "").replace(/^v/, "").split(".").map(Number);
  const pb = (b || "").replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// Parse GitHub markdown release notes into structured sections
function parseReleaseBody(body) {
  if (!body) return [];
  const lines = body.split("\n");
  const sections = [];
  let current = null;

  const ensureSection = (title = "Changes") => {
    if (!current) {
      current = { title, icon: inferSectionIcon(title), items: [] };
    }
    return current;
  };

  const pushCurrent = () => {
    if (current) {
      // Only push if it has content
      if (current.items.length > 0 || (current.note && current.note.trim())) {
        sections.push(current);
      }
      current = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Section heading (## or ###)
    if (line.startsWith("#")) {
      pushCurrent();
      const title = line.replace(/^#+\s*/, "").trim();
      current = { title, icon: inferSectionIcon(title), items: [] };
      continue;
    }

    // Bullet item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.replace(/^[-*]\s*/, "").trim();
      ensureSection("Changes").items.push(text);
      continue;
    }

    // Plain paragraph line — attach to current section as a note
    if (line && !line.startsWith("#")) {
      const s = ensureSection("General");
      s.note = (s.note || "") + line + " ";
    }
  }

  pushCurrent();
  return sections;
}

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

function tagStyleFor(title) {
  const t = title.toLowerCase();
  if (t.includes("fix") || t.includes("bug")) return { bg: "rgba(248,113,113,0.1)", bdr: "rgba(248,113,113,0.3)", color: C.red };
  if (t.includes("feat") || t.includes("new") || t.includes("add")) return { bg: "rgba(74,222,128,0.1)", bdr: "rgba(74,222,128,0.3)", color: C.green };
  if (t.includes("break") || t.includes("change")) return { bg: "rgba(251,191,36,0.1)", bdr: "rgba(251,191,36,0.3)", color: C.yellow };
  if (t.includes("perf") || t.includes("optim")) return { bg: "rgba(34,211,238,0.1)", bdr: "rgba(34,211,238,0.3)", color: C.cyan };
  if (t.includes("security")) return { bg: "rgba(167,139,250,0.1)", bdr: "rgba(167,139,250,0.3)", color: C.purple };
  return { bg: "rgba(255,255,255,0.05)", bdr: C.border, color: C.textSub };
}

// ─── PRIMITIVES ──────────────────────────────────────────────────────────────

function Skel({ h = 20, r = 10, w = "100%", style = {} }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: r,
      background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)",
      backgroundSize: "200% 100%", animation: "up-shimmer 1.6s infinite", ...style
    }} />
  );
}

function StatusDot({ color, pulse, size = 8 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0 }}>
      {pulse && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.4, animation: "up-ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />}
      <span style={{ width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 ${size + 2}px ${color}88`, display: "block" }} />
    </span>
  );
}

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────

function DownloadProgress({ progress }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <span style={{ fontSize: 11, color: C.textSub, fontWeight: 500 }}>Downloading update…</span>
        <span style={{ fontSize: 12, color: C.green, fontWeight: 700, fontFamily: "monospace" }}>{progress}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
        <div style={{
          height: "100%", borderRadius: 4,
          background: "linear-gradient(90deg,#4ade80,#22d3ee)",
          width: `${progress}%`,
          transition: "width 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          animation: "up-progress-glow 1.5s ease infinite",
        }} />
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>
        Do not close the app during installation
      </div>
    </div>
  );
}

// ─── CURRENT VERSION HERO ────────────────────────────────────────────────────

function VersionHero({ updateState, onCheck, onInstall, checking, installing }) {
  const status = updateState?.status;
  const current = updateState?.current_version;
  const latest = updateState?.latest_version;
  const progress = updateState?.progress ?? 0;

  const isUpToDate = status === "idle" && !updateState?.error && semverCompare(latest || current, current) <= 0;
  const hasUpdate = status === "update_available";
  const isDownloading = status === "downloading";
  const isReady = status === "ready";
  const isChecking = status === "checking";

  const borderAnim = hasUpdate ? "up-pulse-border 2.5s ease infinite" : "none";

  return (
    <div style={{
      background: "rgba(8,11,20,0.97)",
      border: `1px solid ${hasUpdate ? "rgba(74,222,128,0.25)" : C.border}`,
      borderRadius: 20, padding: "24px 26px",
      animation: borderAnim,
      position: "relative", overflow: "hidden",
    }}>
      {/* Ambient gradient blob */}
      <div style={{
        position: "absolute", top: -40, right: -40, width: 200, height: 200,
        borderRadius: "50%", pointerEvents: "none",
        background: hasUpdate
          ? "radial-gradient(circle,rgba(74,222,128,0.08) 0%,transparent 70%)"
          : isUpToDate
            ? "radial-gradient(circle,rgba(74,222,128,0.04) 0%,transparent 70%)"
            : "radial-gradient(circle,rgba(251,191,36,0.05) 0%,transparent 70%)",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, position: "relative" }}>
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 16, flexShrink: 0,
          background: hasUpdate
            ? "linear-gradient(135deg,rgba(74,222,128,0.18),rgba(34,211,238,0.1))"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${hasUpdate ? "rgba(74,222,128,0.3)" : C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
        }}>
          {isDownloading ? (
            <span style={{ fontSize: 22, animation: "up-download-bounce 1s ease infinite" }}>⬇️</span>
          ) : isReady ? "✅" : hasUpdate ? "🚀" : isUpToDate ? "✓" : "◈"}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Version row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: C.text, lineHeight: 1, letterSpacing: "-0.02em" }}>
              v{current || "—"}
            </span>
            {isUpToDate && !isChecking && (
              <span className="up-tag" style={{ color: C.green, background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.3)" }}>
                <StatusDot color={C.green} size={5} /> Up to date
              </span>
            )}
            {hasUpdate && (
              <span className="up-tag" style={{ color: C.yellow, background: "rgba(251,191,36,0.1)", borderColor: "rgba(251,191,36,0.3)" }}>
                ↑ v{latest} available
              </span>
            )}
            {isDownloading && (
              <span className="up-tag" style={{ color: C.blue, background: "rgba(96,165,250,0.1)", borderColor: "rgba(96,165,250,0.3)" }}>
                Downloading
              </span>
            )}
            {isReady && (
              <span className="up-tag" style={{ color: C.green, background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.3)" }}>
                Ready to install
              </span>
            )}
          </div>

          {/* Status line */}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: isDownloading ? 0 : 16, lineHeight: 1.5 }}>
            {isChecking && "Checking GitHub for updates…"}
            {isUpToDate && !isChecking && `You're on the latest release. ${updateState?.last_checked ? `Last checked ${daysSince(updateState.last_checked)}.` : ""}`}
            {hasUpdate && `A new version is available. Your current version is v${current}.`}
            {isDownloading && ""}
            {isReady && "Update downloaded. The installer will launch momentarily."}
            {updateState?.error && <span style={{ color: C.red }}>{updateState.error}</span>}
          </div>

          {isDownloading && <DownloadProgress progress={progress} />}

          {/* Action buttons */}
          {!isDownloading && !isReady && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!hasUpdate && (
                <button className="up-btn" onClick={onCheck} disabled={isChecking}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "9px 18px", borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: "rgba(255,255,255,0.05)",
                    color: C.textSub, fontSize: 13, fontWeight: 600,
                    fontFamily: "'DM Sans',sans-serif",
                    cursor: isChecking ? "not-allowed" : "pointer", opacity: isChecking ? 0.6 : 1,
                  }}>
                  {isChecking
                    ? <><span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.blue, animation: "up-spin 0.65s linear infinite", display: "block" }} /> Checking…</>
                    : <><span style={{ fontSize: 14 }}>↻</span> Check for updates</>
                  }
                </button>
              )}

              {hasUpdate && (
                <button className="up-btn" onClick={onInstall} disabled={installing}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 22px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg,#4ade80,#22d3ee)",
                    color: "#060a12", fontSize: 13, fontWeight: 700,
                    fontFamily: "'DM Sans',sans-serif",
                    cursor: installing ? "not-allowed" : "pointer",
                    boxShadow: "0 0 20px rgba(74,222,128,0.4)",
                  }}>
                  {installing
                    ? <><span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "#060a12", animation: "up-spin 0.65s linear infinite", display: "block" }} /> Starting…</>
                    : <>⬇ Download &amp; Install v{latest}</>
                  }
                </button>
              )}

              {hasUpdate && (
                <button className="up-btn" onClick={onCheck}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "9px 14px", borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.textMuted, fontSize: 12, fontWeight: 500,
                    fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                  }}>
                  ↻ Recheck
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RELEASE CARD ────────────────────────────────────────────────────────────

function ReleaseCard({ release, isCurrent, isLatest, isExpanded, onToggle }) {
  const sections = parseReleaseBody(release.body);
  const tag = (release.tag_name || "").replace(/^v/, "");
  const ago = daysSince(release.published_at);
  const prerelease = release.prerelease;

  return (
    <div className="up-release-card" onClick={onToggle}
      style={{
        background: isCurrent ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.01)",
        border: `1px solid ${isCurrent ? "rgba(74,222,128,0.2)" : C.border}`,
        borderRadius: 14, overflow: "hidden",
        animation: "up-slide 0.3s ease both",
      }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
        {/* Version pill */}
        <div style={{
          fontFamily: "monospace", fontSize: 13, fontWeight: 700,
          color: isCurrent ? C.green : isLatest ? C.text : C.textSub,
          minWidth: 58,
        }}>
          v{tag}
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
          {isCurrent && (
            <span className="up-tag" style={{ color: C.green, background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.25)" }}>
              <StatusDot color={C.green} pulse={false} size={5} /> Current
            </span>
          )}
          {isLatest && !isCurrent && (
            <span className="up-tag" style={{ color: C.cyan, background: "rgba(34,211,238,0.1)", borderColor: "rgba(34,211,238,0.25)" }}>
              Latest
            </span>
          )}
          {prerelease && (
            <span className="up-tag" style={{ color: C.yellow, background: "rgba(251,191,36,0.1)", borderColor: "rgba(251,191,36,0.25)" }}>
              Pre-release
            </span>
          )}
          {sections.slice(0, 2).map(s => {
            const ts = tagStyleFor(s.title);
            return (
              <span key={s.title} className="up-tag" style={{ color: ts.color, background: ts.bg, borderColor: ts.bdr }}>
                {s.icon} {s.title}
              </span>
            );
          })}
        </div>

        {/* Date + expand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>{ago}</span>
          <span style={{
            fontSize: 11, color: C.textMuted,
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
            display: "inline-block",
          }}>▾</span>
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{
          padding: "0 18px 18px",
          borderTop: `1px solid ${C.border}`,
          animation: "up-in 0.22s ease",
        }}
          onClick={e => e.stopPropagation()}>

          {/* Release title */}
          {release.name && release.name !== release.tag_name && (
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 14, marginBottom: 12 }}>
              {release.name}
            </div>
          )}

          {sections.length === 0 && (
            <div style={{ paddingTop: 14, fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>
              No release notes provided for this version.
            </div>
          )}

          {/* Sections */}
          {sections.map((section, si) => {
            const ts = tagStyleFor(section.title);
            return (
              <div key={si} style={{ marginTop: si === 0 ? 14 : 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{section.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: ts.color }}>
                    {section.title}
                  </span>
                  <div style={{ flex: 1, height: 1, background: `${ts.color}18` }} />
                </div>

                {section.note && (
                  <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 8, marginLeft: 22 }}>
                    {section.note.trim()}
                  </p>
                )}

                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                  {section.items.map((item, ii) => (
                    <li key={ii} style={{ display: "flex", alignItems: "flex-start", gap: 10, animation: `up-slide 0.2s ease ${ii * 0.03}s both` }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: ts.color, flexShrink: 0, marginTop: 6 }} />
                      <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {/* Footer meta */}
          <div style={{
            marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Released {fmtDate(release.published_at)}
            </span>
            {release.html_url && (
              <a href={release.html_url} target="_blank" rel="noreferrer"
                style={{
                  fontSize: 11, color: C.blue, textDecoration: "none", fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
                onClick={e => e.stopPropagation()}>
                View on GitHub ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHANGELOG FEED ──────────────────────────────────────────────────────────

function ChangelogFeed({ currentVersion, latestVersion, releases, error, onRetry }) {
  const [expandedTag, setExpandedTag] = useState(null);
  const [filter, setFilter] = useState("all"); // all | stable | prerelease

  useEffect(() => {
    // Auto-expand latest stable once releases are loaded
    if (releases && !expandedTag) {
      const latestStable = releases.find(rel => !rel.prerelease);
      if (latestStable) setExpandedTag(latestStable.tag_name);
    }
  }, [releases, expandedTag]);

  const filtered = releases
    ? releases.filter(r => filter === "all" ? true : filter === "stable" ? !r.prerelease : r.prerelease)
    : null;

  const FILTERS = [["all", "All releases"], ["stable", "Stable"], ["prerelease", "Pre-release"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.textMuted }}>Changelog</span>
          {releases && (
            <span style={{ fontSize: 10, color: C.textMuted, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "1px 7px" }}>
              {releases.length} releases
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              padding: "5px 11px", borderRadius: 7, border: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500,
              background: filter === id ? "rgba(74,222,128,0.1)" : "transparent",
              color: filter === id ? C.green : C.textMuted,
              transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* States */}
      {!releases && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
              <Skel h={14} w={48} r={6} />
              <Skel h={18} w={80} r={8} />
              <div style={{ flex: 1 }} />
              <Skel h={12} w={60} r={6} />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: "20px", borderRadius: 14, textAlign: "center",
          background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)",
        }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 4 }}>Couldn't load release history</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>{error}</div>
          <button className="up-btn" onClick={onRetry} style={{
            padding: "7px 16px", borderRadius: 9, border: `1px solid ${C.border}`,
            background: "rgba(255,255,255,0.05)", color: C.textSub, fontSize: 12,
            fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
          }}>Retry</button>
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div style={{ padding: "32px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>
          No {filter === "prerelease" ? "pre-releases" : "releases"} found.
        </div>
      )}

      {filtered && filtered.map((rel, i) => {
        const relTag = (rel.tag_name || "").replace(/^v/, "");
        const curTag = (currentVersion || "").replace(/^v/, "");
        const latTag = (latestVersion || "").replace(/^v/, "");
        return (
          <div key={rel.id} style={{ animationDelay: `${i * 0.04}s` }}>
            <ReleaseCard
              release={rel}
              isCurrent={relTag === curTag}
              isLatest={relTag === latTag}
              isExpanded={expandedTag === rel.tag_name}
              onToggle={() => setExpandedTag(t => t === rel.tag_name ? null : rel.tag_name)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── QUICK STATS STRIP ───────────────────────────────────────────────────────

function UpdateStatsStrip({ updateState, releases }) {
  const current = updateState?.current_version;
  const latest = updateState?.latest_version;
  const releaseCount = releases?.length || 0;

  // Find current release for its date
  const curRelease = releases?.find(r => (r.tag_name || "").replace(/^v/, "") === (current || "").replace(/^v/, ""));
  const latRelease = releases?.find(r => (r.tag_name || "").replace(/^v/, "") === (latest || "").replace(/^v/, ""));

  const stats = [
    { label: "Installed", value: current ? `v${current}` : "—", sub: curRelease ? fmtDate(curRelease.published_at) : null, color: C.green },
    { label: "Latest", value: latest ? `v${latest}` : "—", sub: latRelease ? fmtDate(latRelease.published_at) : null, color: C.cyan },
    { label: "Total releases", value: releaseCount ? `${releaseCount}` : "—", sub: "on GitHub", color: C.textSub },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      {stats.map(({ label, value, sub, color }) => (
        <div key={label} style={{
          background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "13px 16px", animation: "up-pop 0.3s ease",
        }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'DM Serif Display',serif", lineHeight: 1, marginBottom: 3 }}>{value}</div>
          {sub && <div style={{ fontSize: 10, color: C.textMuted }}>{sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — UpdateSection
// ═══════════════════════════════════════════════════════════════════════════════
export default function UpdateSection({ push }) {
  const [updateState, setUpdateState] = useState(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [releases, setReleases] = useState(null);
  const [relError, setRelError] = useState(null);

  // Poll local API for update status
  const fetchUpdateStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/update/status`);
      const data = await res.json();
      setUpdateState(data);
    } catch { }
  }, []);

  useEffect(() => {
    fetchUpdateStatus();
    const iv = setInterval(fetchUpdateStatus, 3000);
    return () => clearInterval(iv);
  }, [fetchUpdateStatus]);

  const fetchGithubReleases = useCallback(async () => {
    setRelError(null);
    try {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      if (!r.ok) throw new Error(`GitHub API Error: ${r.status}`);
      const data = await r.json();
      setReleases(data);
    } catch (e) {
      setRelError(e.message);
    }
  }, []);

  useEffect(() => {
    fetchGithubReleases();

    // Auto-trigger check if interval passed
    if (shouldAutoCheckUpdate()) {
      handleCheck();
    }
  }, [fetchGithubReleases]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheck = async () => {
    setChecking(true);
    try {
      await fetch(`${BASE_URL}/api/update/check`, { method: "POST" });
      recordUpdateCheck(); // Record manually triggered check too
      push("Checking for updates…", "success");
      await fetchUpdateStatus();
    } catch {
      push("Failed to reach update server", "error");
    }
    setChecking(false);
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await fetch(`${BASE_URL}/api/update/install`, { method: "POST" });
      push("Download started…", "success");
      await fetchUpdateStatus();
    } catch {
      push("Failed to start download", "error");
    }
    setInstalling(false);
  };

  return (
    <>
      <style>{UPDATE_CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, animation: "up-in 0.28s ease" }}>

        {/* ── Version hero card ── */}
        {updateState
          ? <VersionHero
            updateState={updateState}
            onCheck={handleCheck}
            onInstall={handleInstall}
            checking={checking || updateState?.status === "checking"}
            installing={installing || updateState?.status === "downloading"}
          />
          : (
            <div style={{ background: "rgba(8,11,20,0.97)", border: `1px solid ${C.border}`, borderRadius: 20, padding: "24px 26px" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <Skel h={56} w={56} r={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Skel h={22} w="40%" r={8} />
                  <Skel h={12} w="65%" r={6} />
                  <Skel h={36} w={140} r={10} />
                </div>
              </div>
            </div>
          )
        }

        {/* ── Stats strip ── */}
        {updateState && <UpdateStatsStrip updateState={updateState} releases={releases} />}

        {/* ── Changelog ── */}
        <ChangelogFeed
          currentVersion={updateState?.current_version}
          latestVersion={updateState?.latest_version}
          releases={releases}
          error={relError}
          onRetry={fetchGithubReleases}
        />
      </div>
    </>
  );
}

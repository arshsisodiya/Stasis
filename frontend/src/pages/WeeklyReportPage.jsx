import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SectionCard, AppIcon } from "../shared/components";
import { fmtTime, localYMD } from "../shared/utils";

const BASE = "http://127.0.0.1:7432";

// Earliest week you have data for — adjust this date to match your first data point
const EARLIEST_WEEK = "2024-01-01";

function weekBounds(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(), diff = day === 0 ? 6 : day - 1;
  const mon = new Date(d); mon.setDate(d.getDate() - diff);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: localYMD(mon), end: localYMD(sun) };
}

function fmtDateShort(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtWeekRange(start, end) {
  const s = new Date(start + "T12:00:00"), e = new Date(end + "T12:00:00");
  const opts = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}, ${e.getFullYear()}`;
}

function WeekOptionMenu({ options, selected, disabledValue, onSelect }) {
  return (
    <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
      {options.map((opt) => {
        const disabled = opt.value === disabledValue;
        const active = opt.value === selected;
        return (
          <button
            key={opt.value}
            onClick={() => !disabled && onSelect(opt.value)}
            disabled={disabled}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "9px 10px",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: active ? "rgba(34,211,238,0.1)" : "transparent",
              color: disabled ? "#475569" : active ? "#22d3ee" : "#cbd5e1",
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 12,
              fontFamily: "'DM Sans',sans-serif",
              opacity: disabled ? 0.45 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CATEGORY_COLORS = {
  productive: "#4ade80",
  communication: "#60a5fa",
  entertainment: "#f87171",
  browser: "#a78bfa",
  neutral: "#fbbf24",
  unproductive: "#fb7185",
  other: "#64748b",
  system: "#22d3ee",
};

function reportToText(report) {
  if (!report) return "";
  const s = report.summary || {};
  const lines = [
    `Weekly Report (${report.period?.start} -> ${report.period?.end})`,
    "",
    `Screen Time: ${fmtTime(s.total_screen_time || 0)}`,
    `Avg / Day: ${fmtTime(s.avg_daily || 0)}`,
    `Productivity: ${Math.round(s.productivity_pct || 0)}%`,
    `Focus Score: ${Math.round(s.avg_focus_score || 0)}`,
    "",
    "Top Apps:",
    ...(report.top_apps || []).slice(0, 8).map((a, i) => `${i + 1}. ${(a.app_name || "").replace(".exe", "")} - ${fmtTime(a.total_seconds || 0)}`),
    "",
    "Category Breakdown:",
    ...(report.category_breakdown || []).map((c) => `- ${c.category}: ${fmtTime(c.total_seconds || 0)}`),
    "",
    "Insights:",
    ...(report.insights || []).map((i) => `- ${i}`),
  ];
  return lines.join("\n");
}

function reportToCsv(report) {
  if (!report) return "";
  const rows = [["date", "total_seconds", "productive_pct"]];
  (report.daily_breakdown || []).forEach((d) => rows.push([d.date, d.total_seconds || 0, d.productive_pct || 0]));
  return rows.map((r) => r.join(",")).join("\n");
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function TinySparkline({ values = [], color = "#4ade80", width = 68, height = 22 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block", flexShrink: 0 }}>
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.3" fill={color} />
    </svg>
  );
}

function CategoryDonut({ categories = [] }) {
  const [hovered, setHovered] = useState(null);
  const total = categories.reduce((sum, c) => sum + (c.total_seconds || 0), 0);
  const r = 58;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 1fr) minmax(210px, 1fr)", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", minHeight: 184 }}>
        <svg width="184" height="184" viewBox="0 0 184 184">
          <circle cx="92" cy="92" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
          {categories.map((cat) => {
            const secs = cat.total_seconds || 0;
            const pct = total > 0 ? secs / total : 0;
            const seg = pct * c;
            const offset = c - acc;
            acc += seg;
            const key = (cat.category || "other").toLowerCase();
            const color = CATEGORY_COLORS[key] || "#64748b";
            const active = hovered === null || hovered === key;
            return (
              <circle
                key={cat.category}
                cx="92"
                cy="92"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={active ? "18" : "14"}
                strokeDasharray={`${seg} ${c - seg}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform="rotate(-90 92 92)"
                style={{ opacity: active ? 1 : 0.35, transition: "opacity 0.2s ease, stroke-width 0.2s ease" }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
          <text x="92" y="84" textAnchor="middle" fill="#cbd5e1" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em" }}>TOTAL</text>
          <text x="92" y="104" textAnchor="middle" fill="#f1f5f9" style={{ fontSize: "14px", fontWeight: 800 }}>{fmtTime(total)}</text>
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {categories.map((cat) => {
          const secs = cat.total_seconds || 0;
          const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
          const key = (cat.category || "other").toLowerCase();
          const color = CATEGORY_COLORS[key] || "#64748b";
          const active = hovered === null || hovered === key;
          return (
            <div
              key={cat.category}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                background: active ? "rgba(255,255,255,0.03)" : "transparent",
                border: `1px solid ${active ? "rgba(255,255,255,0.08)" : "transparent"}`,
                borderRadius: 9,
                padding: "6px 8px",
                opacity: active ? 1 : 0.45,
                transition: "all 0.2s ease",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>{cat.category || "other"}</span>
              </div>
              <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Mono',monospace" }}>{fmtTime(secs)} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Bar chart for daily breakdown ── */
function DailyBars({ days, animKey }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [animKey]);

  if (!days || !days.length) return null;

  const seconds = days.map(d => d.total_seconds || 0);
  const maxVal = Math.max(...seconds, 1);
  const maxSec = Math.max(...seconds);
  const minSec = Math.min(...seconds.filter(s => s > 0)); // lowest non-zero

  // index of peak and lowest active day
  const peakIdx = seconds.indexOf(maxSec);
  const lowestIdx = minSec > 0 ? seconds.indexOf(minSec) : -1;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150, padding: "0 4px", position: "relative" }}>
      {days.map((d, i) => {
        const pct = (seconds[i] / maxVal) * 100;
        const productive = d.productive_pct || 0;
        const color = productive >= 60 ? "#4ade80" : productive >= 40 ? "#fbbf24" : "#f87171";
        const hasData = seconds[i] > 0;
        const barHeight = mounted ? `${Math.max(pct, 4)}%` : "4%";
        const isPeak = i === peakIdx && hasData;
        const isLowest = i === lowestIdx && hasData && lowestIdx !== peakIdx;

        return (
          <div key={d.date || i} style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            height: "100%",
            justifyContent: "flex-end",
          }}>
            {/* Badge row: crown for peak, drop for lowest */}
            <div style={{ height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPeak && (
                <span style={{
                  fontSize: 11,
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0) scale(1)" : "translateY(4px) scale(0.7)",
                  transition: `opacity 0.4s ease ${i * 45 + 300}ms, transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 45 + 300}ms`,
                  filter: "drop-shadow(0 0 4px rgba(251,191,36,0.8))",
                }} title="Peak day">👑</span>
              )}
              {isLowest && (
                <span style={{
                  fontSize: 10,
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0) scale(1)" : "translateY(4px) scale(0.7)",
                  transition: `opacity 0.4s ease ${i * 45 + 300}ms, transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 45 + 300}ms`,
                  filter: "drop-shadow(0 0 3px rgba(148,163,184,0.6))",
                }} title="Lightest day">💤</span>
              )}
            </div>

            {/* Time label */}
            <span style={{
              fontSize: 9,
              color: mounted && hasData ? (isPeak ? "#fbbf24" : isLowest ? "#94a3b8" : color) : "transparent",
              fontFamily: "'DM Mono',monospace",
              fontWeight: isPeak || isLowest ? 700 : 400,
              transition: "color 0.4s ease " + (i * 40) + "ms",
              whiteSpace: "nowrap",
            }}>
              {hasData ? fmtTime(seconds[i]) : ""}
            </span>

            {/* Bar grows upward */}
            <div style={{
              width: "100%",
              flex: 1,
              display: "flex",
              alignItems: "flex-end",
              position: "relative",
            }}>
              {/* Background track */}
              <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
              }} />
              {/* Colored bar */}
              <div style={{
                width: "100%",
                height: barHeight,
                background: isPeak
                  ? `linear-gradient(180deg, #fbbf24, #f59e0b90)`
                  : isLowest
                    ? `linear-gradient(180deg, #94a3b8, #64748b70)`
                    : `linear-gradient(180deg, ${color}, ${color}70)`,
                borderRadius: 6,
                outline: isPeak ? "1.5px solid rgba(251,191,36,0.5)" : isLowest ? "1.5px solid rgba(148,163,184,0.3)" : "none",
                boxShadow: mounted && hasData
                  ? isPeak
                    ? "0 0 12px rgba(251,191,36,0.45), 0 0 24px rgba(251,191,36,0.15)"
                    : `0 0 10px ${color}40`
                  : "none",
                transition: `height 0.65s cubic-bezier(0.34,1.56,0.64,1) ${i * 45}ms, box-shadow 0.5s ease`,
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Shimmer highlight */}
                <div style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0,
                  height: "40%",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent)",
                  borderRadius: "6px 6px 0 0",
                }} />
              </div>
            </div>

            {/* Day label */}
            <span style={{
              fontSize: 10,
              color: isPeak ? "#fbbf24" : isLowest ? "#64748b" : "#334155",
              fontWeight: isPeak || isLowest ? 700 : 600,
              lineHeight: 1,
            }}>
              {DAY_LABELS[i] || ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Stat pill ── */
function StatPill({ label, value, color = "#4ade80", icon, trendValues = [] }) {
  return (
    <div style={{ flex: 1, minWidth: 130, background: `${color}06`, border: `1px solid ${color}18`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 7, opacity: 0.9 }}>
        <TinySparkline values={trendValues} color={color} />
      </div>
    </div>
  );
}

/* ── Insight card ── */
function InsightCard({ text, index }) {
  return (
    <div style={{
      animation: `card-fade-in 0.38s cubic-bezier(0.34,1.56,0.64,1) ${index * 60}ms both`,
      background: "rgba(14,18,36,0.78)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start"
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💡</span>
      <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif" }}>{text}</p>
    </div>
  );
}

/* ── Top app row ── */
function TopApp({ app, seconds, pct, maxPct, rank, trend, deltaPct }) {
  const color = rank <= 1 ? "#fbbf24" : rank <= 3 ? "#a78bfa" : "#475569";
  const trendColor = trend === "up" ? "#f87171" : trend === "down" ? "#4ade80" : trend === "new" ? "#22d3ee" : "#64748b";
  const trendText = trend === "up" ? `↑ ${Math.abs(deltaPct || 0)}%` : trend === "down" ? `↓ ${Math.abs(deltaPct || 0)}%` : trend === "new" ? "new" : "flat";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 18, textAlign: "center", fontSize: 11, fontWeight: 800, color, fontFamily: "'DM Mono',monospace" }}>{rank}</span>
      <AppIcon appName={app} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.replace(".exe", "")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
            <span style={{ fontSize: 10, color: trendColor, fontFamily: "'DM Mono',monospace", textTransform: "lowercase" }}>{trendText}</span>
            <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{fmtTime(seconds)}</span>
          </div>
        </div>
        <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, width: `${Math.min((seconds / maxPct) * 100, 100)}%`, background: `linear-gradient(90deg,${color},${color}88)`, boxShadow: `0 0 6px ${color}40`, transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)" }} />
        </div>
      </div>
    </div>
  );
}

/* ── Limit event row ── */
function LimitRow({ app, hits, edits }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AppIcon appName={app} size={24} />
        <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{app.replace(".exe", "")}</span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {hits > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", fontFamily: "'DM Mono',monospace" }}>{hits} hit{hits > 1 ? "s" : ""}</span>}
        {edits > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", fontFamily: "'DM Mono',monospace" }}>{edits} edit{edits > 1 ? "s" : ""}</span>}
      </div>
    </div>
  );
}

/* ── Goal badge ── */
function GoalBadge({ goal }) {
  const rate = goal.total_days > 0 ? Math.round((goal.days_met / goal.total_days) * 100) : 0;
  const color = rate >= 80 ? "#4ade80" : rate >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ background: `${color}0a`, border: `1px solid ${color}22`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{goal.label || goal.goal_type}</div>
        <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{goal.days_met}/{goal.total_days} days met</div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'DM Serif Display',serif" }}>{rate}%</div>
    </div>
  );
}

/* ── Smooth animated wrapper that fades + slides on week change ── */
function AnimatedContent({ children, animKey }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, [animKey]);

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0px)" : "translateY(12px)",
      transition: "opacity 0.32s ease, transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}>
      {children}
    </div>
  );
}

export default function WeeklyReportPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  // Always store the Monday of the current week to avoid drift
  const [weekMonday, setWeekMonday] = useState(() => weekBounds(localYMD()).start);
  const [sending, setSending] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [weekMenuOpen, setWeekMenuOpen] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [compareWeekA, setCompareWeekA] = useState(() => weekBounds(localYMD()).start);
  const [compareWeekB, setCompareWeekB] = useState(() => {
    const d = new Date(weekBounds(localYMD()).start + "T12:00:00");
    d.setDate(d.getDate() - 7);
    return localYMD(d);
  });
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [verbosity, setVerbosity] = useState("standard");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showT = (msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const week = weekBounds(weekMonday);          // same as { start: weekMonday, end: ... }
  const currentWeekMonday = weekBounds(localYMD()).start;
  const earliestMonday = weekBounds(EARLIEST_WEEK).start;

  const isCurrentWeek = weekMonday === currentWeekMonday;
  // Compare as date strings (YYYY-MM-DD lexicographic order == chronological order)
  const canGoBack = weekMonday > earliestMonday;
  const canGoForward = weekMonday < currentWeekMonday;

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then((r) => r.json())
      .then((d) => setVerbosity((d.weekly_report_verbosity || "standard").toLowerCase()))
      .catch(() => {});

    fetch(`${BASE}/api/weekly-report/available-weeks`)
      .then((r) => r.json())
      .then((d) => {
        const options = Array.isArray(d) ? d : [];
        setAvailableWeeks(options);
        if (options.length > 0) {
          setCompareWeekA((prev) => options.some((x) => x.value === prev) ? prev : options[0].value);
          setCompareWeekB((prev) => options.some((x) => x.value === prev && x.value !== (options[0]?.value)) ? prev : (options[1]?.value || options[0].value));
        }
      })
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/weekly-report?week_of=${weekMonday}&verbosity=${verbosity}`);
      const j = await r.json();
      setReport(j.error ? null : j);
    } catch { setReport(null); }
    setLoading(false);
  }, [weekMonday, verbosity]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const navigateWeek = (dir) => {
    if (dir === -1 && !canGoBack) return;
    if (dir === 1 && !canGoForward) return;
    // Add/subtract exactly 7 days from the Monday — no drift possible
    const d = new Date(weekMonday + "T12:00:00");
    d.setDate(d.getDate() + dir * 7);
    setWeekMonday(localYMD(d));
  };

  const sendTelegram = async () => {
    setSending(true);
    try {
      const r = await fetch(`${BASE}/api/weekly-report/send-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_of: weekMonday }),
      });
      const j = await r.json();
      if (j.ok) showT("Report sent to Telegram!");
      else showT(j.error || "Failed to send", "warn");
    } catch (e) {
      if (e instanceof TypeError && e.message.toLowerCase().includes("fetch")) {
        showT("Server unreachable — is the backend running?", "warn");
      } else {
        showT("Failed to send report", "warn");
      }
    }
    setSending(false);
  };

  const downloadJson = () => {
    try {
      downloadBlob(`stasis-weekly-report-${week.start}.json`, "application/json", JSON.stringify(report, null, 2));
      showT("JSON downloaded");
    } catch {
      showT("Failed to download JSON", "warn");
    }
  };

  const downloadCsv = () => {
    try {
      downloadBlob(`stasis-weekly-report-${week.start}.csv`, "text/csv;charset=utf-8", reportToCsv(report));
      showT("CSV downloaded");
    } catch {
      showT("Failed to download CSV", "warn");
    }
  };

  const exportPdf = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const text = reportToText(report);
      const lines = doc.splitTextToSize(text, 520);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Stasis Weekly Report", 40, 46);
      doc.setFont("courier", "normal");
      doc.setFontSize(10);
      doc.text(lines, 40, 70);
      doc.save(`stasis-weekly-report-${week.start}.pdf`);
      showT("PDF downloaded");
    } catch {
      showT("Failed to export PDF", "warn");
    }
  };

  const compareWeeks = async () => {
    setCompareLoading(true);
    try {
      const r = await fetch(`${BASE}/api/weekly-report/compare?week_a=${compareWeekA}&week_b=${compareWeekB}`);
      const j = await r.json();
      setCompareData(j.error ? null : j);
      if (j.error) showT(j.error, "warn");
    } catch {
      showT("Failed to compare weeks", "warn");
    }
    setCompareLoading(false);
  };

  const s = report?.summary;
  const topMax = report?.top_apps?.[0]?.total_seconds || 1;
  const trend = useMemo(() => {
    const list = report?.trends || [];
    return {
      screen: list.map(x => x.screen_time || 0),
      avg: list.map(x => x.avg_daily || 0),
      prod: list.map(x => x.productivity_pct || 0),
      focus: list.map(x => x.focus_score || 0),
    };
  }, [report]);

  const navBtn = (enabled) => ({
    width: 34, height: 34, borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: enabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)",
    color: enabled ? "#94a3b8" : "#2d3748",
    cursor: enabled ? "pointer" : "not-allowed",
    fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.18s ease",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        @keyframes card-fade-in { from { opacity:0; transform:translateY(14px) scale(0.98); } to { opacity:1; transform:none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 400,
          background: toast.type === "warn" ? "rgba(14,11,4,0.98)" : "rgba(4,11,8,0.98)",
          border: `1px solid ${toast.type === "warn" ? "rgba(251,191,36,0.3)" : "rgba(74,222,128,0.3)"}`,
          borderRadius: 14, padding: "13px 20px",
          color: toast.type === "warn" ? "#fbbf24" : "#4ade80",
          fontSize: 13, fontWeight: 500,
          boxShadow: "0 14px 44px rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", gap: 10,
          animation: "card-fade-in 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <span style={{ fontSize: 15 }}>{toast.type === "warn" ? "⚠️" : "✓"}</span>{toast.msg}
        </div>
      )}

      {/* Header with navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.12em" }}>Weekly Report</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{fmtWeekRange(week.start, week.end)}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* ← Previous */}
          <button
            onClick={() => navigateWeek(-1)}
            disabled={!canGoBack}
            title={!canGoBack ? "No earlier data available" : "Previous week"}
            style={navBtn(canGoBack)}
          >←</button>

          {/* This Week indicator OR jump-back button */}
          {isCurrentWeek ? (
            <div style={{
              padding: "7px 14px", borderRadius: 10,
              border: "1px solid rgba(34,211,238,0.3)",
              background: "rgba(34,211,238,0.08)",
              color: "#22d3ee",
              fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              userSelect: "none",
            }}>
              This Week
            </div>
          ) : (
            <button
              onClick={() => setWeekMonday(currentWeekMonday)}
              title="Jump to current week"
              style={{
                padding: "7px 14px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                transition: "all 0.18s ease",
              }}
            >↩ Current Week</button>
          )}

          {/* → Next */}
          <button
            onClick={() => navigateWeek(1)}
            disabled={!canGoForward}
            title={!canGoForward ? "Can't go past the current week" : "Next week"}
            style={navBtn(canGoForward)}
          >→</button>

          <div style={{ position: "relative" }}>
            <button onClick={() => setCompareOpen(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 999,
              border: "1px solid rgba(167,139,250,0.3)",
              background: "rgba(167,139,250,0.08)", color: "#a78bfa",
              fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              cursor: "pointer"
            }}>⇄ Compare</button>

            {compareOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 35,
                width: 320, background: "rgba(9,13,24,0.98)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.55)", padding: 12
              }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Compare Two Weeks</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>Week 1</div>
                    <button onClick={() => setWeekMenuOpen(weekMenuOpen === "a" ? null : "a")}
                      style={{ width: "100%", textAlign: "left", background: "rgba(255,255,255,0.04)", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 10px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
                      {availableWeeks.find((x) => x.value === compareWeekA)?.label || "Select week"}
                    </button>
                    {weekMenuOpen === "a" && (
                      <div style={{ marginTop: 6 }}>
                        <WeekOptionMenu options={availableWeeks} selected={compareWeekA} disabledValue={compareWeekB} onSelect={(value) => { setCompareWeekA(value); setWeekMenuOpen(null); }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>Week 2</div>
                    <button onClick={() => setWeekMenuOpen(weekMenuOpen === "b" ? null : "b")}
                      style={{ width: "100%", textAlign: "left", background: "rgba(255,255,255,0.04)", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 10px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
                      {availableWeeks.find((x) => x.value === compareWeekB)?.label || "Select week"}
                    </button>
                    {weekMenuOpen === "b" && (
                      <div style={{ marginTop: 6 }}>
                        <WeekOptionMenu options={availableWeeks} selected={compareWeekB} disabledValue={compareWeekA} onSelect={(value) => { setCompareWeekB(value); setWeekMenuOpen(null); }} />
                      </div>
                    )}
                  </div>
                  <button onClick={async () => { await compareWeeks(); setCompareOpen(false); }} disabled={compareLoading || compareWeekA === compareWeekB}
                    style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.08)", color: compareWeekA === compareWeekB ? "#475569" : "#22d3ee", cursor: compareWeekA === compareWeekB ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                    {compareLoading ? "Comparing..." : "Compare Weeks"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button onClick={() => setExportOpen(v => !v)} disabled={!report} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 10,
              border: "1px solid rgba(96,165,250,0.3)",
              cursor: report ? "pointer" : "not-allowed",
              background: "rgba(96,165,250,0.08)", color: "#60a5fa",
              fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              opacity: report ? 1 : 0.45,
            }}>⬇️ Export ▾</button>

            {exportOpen && report && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30,
                minWidth: 180, background: "rgba(9,13,24,0.98)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.55)", overflow: "hidden"
              }}>
                {[
                  { label: "Download PDF", action: async () => { await exportPdf(); setExportOpen(false); } },
                  { label: "Download CSV", action: () => { downloadCsv(); setExportOpen(false); } },
                  { label: "Download JSON", action: () => { downloadJson(); setExportOpen(false); } },
                  { label: sending ? "Send Telegram (sending...)" : "Send to Telegram", action: async () => { await sendTelegram(); setExportOpen(false); } },
                ].map((item) => (
                  <button key={item.label} onClick={item.action}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 12px", border: "none",
                      background: "transparent", color: "#cbd5e1", cursor: "pointer",
                      fontSize: 12, fontFamily: "'DM Sans',sans-serif"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "#475569", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "#22d3ee", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Generating report…
        </div>
      ) : !report ? (
        <div style={{ textAlign: "center", padding: "80px 24px", background: "rgba(12,15,28,0.5)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#334155", marginBottom: 8 }}>No data for this week</div>
          <div style={{ fontSize: 13, color: "#475569" }}>Try navigating to a week with activity data</div>
        </div>
      ) : (
        <AnimatedContent animKey={weekMonday}>
          {compareData?.diff && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.16)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontSize: 10, color: "#60a5fa", textTransform: "uppercase" }}>Screen Δ</div>
                <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>{fmtTime(Math.abs(compareData.diff.screen_time_delta || 0))} {compareData.diff.screen_time_delta >= 0 ? "↑" : "↓"}</div>
              </div>
              <div style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.16)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontSize: 10, color: "#a78bfa", textTransform: "uppercase" }}>Avg/Day Δ</div>
                <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>{fmtTime(Math.abs(compareData.diff.avg_daily_delta || 0))} {compareData.diff.avg_daily_delta >= 0 ? "↑" : "↓"}</div>
              </div>
              <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.16)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase" }}>Productivity Δ</div>
                <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>{Math.abs(compareData.diff.productivity_delta || 0)}pt {compareData.diff.productivity_delta >= 0 ? "↑" : "↓"}</div>
              </div>
              <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.16)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontSize: 10, color: "#fbbf24", textTransform: "uppercase" }}>Focus Δ</div>
                <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>{Math.abs(compareData.diff.focus_delta || 0)} {compareData.diff.focus_delta >= 0 ? "↑" : "↓"}</div>
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatPill icon="🖥️" label="Screen Time" value={fmtTime(s?.total_screen_time || 0)} color="#60a5fa" trendValues={trend.screen} />
            <StatPill icon="📊" label="Avg / Day" value={fmtTime(s?.avg_daily || 0)} color="#a78bfa" trendValues={trend.avg} />
            <StatPill icon="💪" label="Productivity" value={`${Math.round(s?.productivity_pct || 0)}%`} color="#4ade80" trendValues={trend.prod} />
            <StatPill icon="🎯" label="Focus Score" value={`${Math.round(s?.avg_focus_score || 0)}`} color="#fbbf24" trendValues={trend.focus} />
          </div>

          {report.what_changed && report.what_changed.length > 0 && (
            <SectionCard title="What Changed This Week">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.what_changed.map((x, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#cbd5e1", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                    {x}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Daily breakdown — now a real bar chart */}
            <SectionCard title="Daily Breakdown" style={{ gridColumn: "1 / -1" }}>
              <DailyBars days={report.daily_breakdown || []} animKey={weekMonday} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                {report.peak_day && (
                  <span style={{ fontSize: 11, color: "#f87171" }}>
                    📈 Peak: <strong>{fmtDateShort(report.peak_day.date)}</strong> — {fmtTime(report.peak_day.total_seconds)}
                  </span>
                )}
                {report.lightest_day && (
                  <span style={{ fontSize: 11, color: "#4ade80" }}>
                    📉 Lightest: <strong>{fmtDateShort(report.lightest_day.date)}</strong> — {fmtTime(report.lightest_day.total_seconds)}
                  </span>
                )}
              </div>
            </SectionCard>

            {/* Top apps */}
            <SectionCard title="Top Apps">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(report.top_apps || []).map((a, i) => (
                  <TopApp key={a.app_name} app={a.app_name} seconds={a.total_seconds} pct={a.pct} maxPct={topMax} rank={i + 1} trend={a.trend} deltaPct={a.delta_pct} />
                ))}
              </div>
            </SectionCard>

            {/* Category breakdown donut + plain text legend */}
            <SectionCard title="Categories">
              <CategoryDonut categories={report.category_breakdown || []} />
              {report.category_insights?.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                  {report.category_insights.map((txt, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, padding: "7px 9px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>🧠 {txt}</div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Limit discipline */}
            {report.limits && (report.limits.total_hits > 0 || report.limits.total_edits > 0) && (
              <SectionCard title="Limit Discipline" style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                  <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 12, padding: "10px 16px", flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Total Hits</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#f87171", fontFamily: "'DM Serif Display',serif" }}>{report.limits.total_hits}</div>
                  </div>
                  <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 12, padding: "10px 16px", flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Total Edits</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#fbbf24", fontFamily: "'DM Serif Display',serif" }}>{report.limits.total_edits}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {(report.limits.per_app || []).map(a => (
                    <LimitRow key={a.app_name} app={a.app_name} hits={a.hits} edits={a.edits} />
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Goals achievement */}
            {report.goals && report.goals.length > 0 && (
              <SectionCard title="Goals Achievement" style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
                  {report.goals.map((g, i) => <GoalBadge key={i} goal={g} />)}
                </div>
                {report.goal_drift_alerts?.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.goal_drift_alerts.map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: a.severity === "high" ? "#f87171" : "#fbbf24", background: a.severity === "high" ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${a.severity === "high" ? "rgba(248,113,113,0.25)" : "rgba(251,191,36,0.22)"}`, borderRadius: 10, padding: "8px 10px" }}>
                        ⚠️ {a.message}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {report.goal_impact_correlation && (
              <SectionCard title="Goal Impact Correlation" style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div style={{ border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase" }}>With Goals Met</div>
                    <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 700 }}>{report.goal_impact_correlation.with_goal_met_productivity ?? "—"}%</div>
                  </div>
                  <div style={{ border: "1px solid rgba(148,163,184,0.2)", background: "rgba(148,163,184,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>Without Goal Met</div>
                    <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 700 }}>{report.goal_impact_correlation.without_goal_met_productivity ?? "—"}%</div>
                  </div>
                  <div style={{ border: "1px solid rgba(34,211,238,0.2)", background: "rgba(34,211,238,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#22d3ee", textTransform: "uppercase" }}>Delta</div>
                    <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 700 }}>{report.goal_impact_correlation.delta ?? "—"}pt</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>{report.goal_impact_correlation.summary}</div>
              </SectionCard>
            )}
          </div>

          {/* Insights */}
          {report.insights && report.insights.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>✨</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Serif Display',serif" }}>Weekly Insights</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {report.insights.map((txt, i) => <InsightCard key={i} text={txt} index={i} />)}
              </div>
            </div>
          )}
        </AnimatedContent>
      )}
    </div>
  );
}
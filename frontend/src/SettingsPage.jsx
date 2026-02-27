import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BASE_URL = "http://localhost:7432";

const C = {
  bg: "#080b14",
  panel: "rgba(10,13,24,0.98)",
  surface: "rgba(8, 11, 20, 0.97)",
  surfaceEl: "rgba(20,24,40,0.8)",
  border: "rgba(255,255,255,0.07)",
  borderMed: "rgba(255,255,255,0.11)",
  borderHi: "rgba(255,255,255,0.18)",
  text: "#f0f4f8",
  textSub: "#94a3b8",
  textMuted: "#4a5568",
  textDim: "rgba(255, 255, 255, 0.12)",
  green: "#4ade80",
  greenGlow: "rgba(74,222,128,0.18)",
  blue: "#60a5fa",
  blueGlow: "rgba(96,165,250,0.15)",
  yellow: "#fbbf24",
  yellowGlow: "rgba(251,191,36,0.15)",
  red: "#f87171",
  redGlow: "rgba(248,113,113,0.15)",
  purple: "#a78bfa",
};

function computeStatus(enabled, running, hasCredentials) {
  if (enabled && running) return { key: "running", color: C.green, label: "Running", pulse: true };
  if (enabled && !running) return { key: "degraded", color: C.yellow, label: "Enabled · Idle", pulse: false };
  if (!enabled && hasCredentials) return { key: "paused", color: C.yellow, label: "Paused", pulse: false };
  return { key: "disabled", color: C.textMuted, label: "Disabled", pulse: false };
}

function timeAgo(dateString) {
  if (!dateString) return;
  const s = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const GLOBAL_CSS = `
  @keyframes sp-ping        { 0%{transform:scale(1);opacity:0.7} 70%{transform:scale(2.6);opacity:0} 100%{transform:scale(2.6);opacity:0} }
  @keyframes sp-spin        { to{transform:rotate(360deg)} }
  @keyframes sp-overlay-in  { from{opacity:0} to{opacity:1} }
  @keyframes sp-panel-in    { from{opacity:0;transform:translateY(28px) scale(0.97)} to{opacity:1;transform:none} }
  @keyframes sp-slide-in    { from{opacity:0;transform:translateX(18px)} to{opacity:1;transform:none} }
  @keyframes sp-modal-in    { from{opacity:0;transform:scale(0.9) translateY(20px)} to{opacity:1;transform:none} }
  @keyframes sp-banner-in   { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
  @keyframes sp-toast-in    { from{opacity:0;transform:translateX(28px)} to{opacity:1;transform:none} }
  @keyframes sp-shimmer     { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes sp-shake       { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-5px)} 40%,80%{transform:translateX(5px)} }
  .sp-nav-btn               { transition:background 0.18s,color 0.18s,box-shadow 0.18s; }
  .sp-nav-btn:hover         { background:rgba(255,255,255,0.055)!important; }
  .sp-nav-btn.active        { background:rgba(74,222,128,0.09)!important; color:#4ade80!important;
                               box-shadow:inset 0 0 0 1px rgba(74,222,128,0.18)!important; }
  .sp-action                { transition:background 0.15s,border-color 0.15s,transform 0.15s,box-shadow 0.2s; }
  .sp-action:hover          { background:rgba(255,255,255,0.09)!important; border-color:rgba(255,255,255,0.16)!important; }
  .sp-action:active         { transform:scale(0.96); }
  .sp-primary:hover         { box-shadow:0 0 26px rgba(74,222,128,0.5)!important; }
  .sp-danger:hover          { background:rgba(248,113,113,0.13)!important; border-color:rgba(248,113,113,0.38)!important; }
  .sp-warning-btn:hover     { background:rgba(251,191,36,0.13)!important; border-color:rgba(251,191,36,0.35)!important; }
  .sp-close:hover           { background:rgba(255,255,255,0.1)!important; color:#f0f4f8!important; }
  .sp-input                 { transition:border 0.2s,background 0.2s; }
  .sp-input:focus           { border-color:rgba(74,222,128,0.42)!important; background:rgba(255,255,255,0.07)!important; outline:none; }
  .sp-input.err:focus       { border-color:rgba(248,113,113,0.5)!important; }
  .sp-scroll::-webkit-scrollbar       { width:3px; }
  .sp-scroll::-webkit-scrollbar-track { background:transparent; }
  .sp-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08);border-radius:4px; }
`;

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────

function StatusDot({ color, pulse, size = 8 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0 }}>
      {pulse && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.4, animation: "sp-ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />}
      <span style={{ width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 ${size + 2}px ${color}88`, display: "block", transition: "background 0.35s,box-shadow 0.35s" }} />
    </span>
  );
}

function Toggle({ on, onChange, disabled, loading }) {
  return (
    <button onClick={() => !disabled && !loading && onChange(!on)} disabled={disabled || loading} aria-pressed={on}
      style={{
        position: "relative", width: 52, height: 28, borderRadius: 14, border: "none", padding: 0, flexShrink: 0,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        background: on ? "linear-gradient(135deg,#4ade80 0%,#22d3ee 100%)" : "rgba(255,255,255,0.09)",
        transition: "background 0.3s ease", boxShadow: on ? "0 0 20px rgba(74,222,128,0.35)" : "none", opacity: disabled ? 0.35 : 1
      }}>
      <span style={{
        position: "absolute", top: 4, left: on ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#f8fafc",
        boxShadow: "0 1px 6px rgba(0,0,0,0.5)", transition: "left 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        {loading && <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.15)", borderTopColor: "rgba(0,0,0,0.5)", animation: "sp-spin 0.65s linear infinite", display: "block" }} />}
      </span>
    </button>
  );
}

function InputField({ label, value, onChange, placeholder, secret, hint, error, readOnly, mono }) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      {label && <label style={{ display: "block", marginBottom: 7, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: error ? C.red : C.textSub }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <input className={`sp-input${error ? " err" : ""}`}
          type={secret && !revealed ? "password" : "text"}
          value={value} onChange={e => onChange && onChange(e.target.value)}
          placeholder={placeholder} readOnly={readOnly}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: "100%", boxSizing: "border-box", padding: `10px ${secret ? 44 : 14}px 10px 14px`,
            background: readOnly ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${error ? "rgba(248,113,113,0.4)" : focused ? "rgba(74,222,128,0.35)" : C.border}`,
            borderRadius: 10, outline: "none", color: readOnly ? C.textMuted : C.text, fontSize: 13,
            fontFamily: mono ? "monospace" : "'DM Sans',sans-serif", cursor: readOnly ? "default" : "text"
          }} />
        {secret && <button onClick={() => setRevealed(r => !r)} tabIndex={-1}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 4, fontSize: 14 }}>
          {revealed ? "🙈" : "👁"}
        </button>}
      </div>
      {(error || hint) && <p style={{ marginTop: 5, fontSize: 11, lineHeight: 1.5, color: error ? C.red : C.textMuted, animation: error ? "sp-banner-in 0.2s ease" : "none" }}>{error || hint}</p>}
    </div>
  );
}

function Card({ children, style = {}, accent, danger, dashed }) {
  return (
    <div style={{ background: C.surface, border: `1px ${dashed ? "dashed" : "solid"} ${danger ? "rgba(248,113,113,0.2)" : accent ? accent + "28" : C.border}`, borderRadius: 18, padding: "22px 24px", backdropFilter: "blur(16px)", ...style }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "secondary", size = "md", disabled, loading }) {
  const V = {
    primary: { bg: "linear-gradient(135deg,#4ade80,#22d3ee)", color: "#060a12", bdr: "transparent", shadow: "0 0 18px rgba(74,222,128,0.35)", cls: "sp-action sp-primary" },
    secondary: { bg: "rgba(255,255,255,0.05)", color: C.textSub, bdr: C.border, shadow: "none", cls: "sp-action" },
    ghost: { bg: "transparent", color: C.textMuted, bdr: "transparent", shadow: "none", cls: "sp-action" },
    danger: { bg: "rgba(248,113,113,0.08)", color: C.red, bdr: "rgba(248,113,113,0.2)", shadow: "none", cls: "sp-action sp-danger" },
    warning: { bg: "rgba(251,191,36,0.08)", color: C.yellow, bdr: "rgba(251,191,36,0.2)", shadow: "none", cls: "sp-action sp-warning-btn" },
  };
  const v = V[variant] || V.secondary;
  const pad = size === "sm" ? "7px 14px" : size === "lg" ? "13px 28px" : "10px 20px";
  return (
    <button onClick={onClick} disabled={disabled || loading} className={v.cls}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, padding: pad, borderRadius: 10,
        border: `1px solid ${v.bdr}`, background: v.bg, color: v.color, fontSize: size === "sm" ? 12 : 13,
        fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.38 : 1, boxShadow: v.shadow, whiteSpace: "nowrap", transition: "opacity 0.2s"
      }}>
      {loading && <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${v.color}40`, borderTopColor: v.color, animation: "sp-spin 0.65s linear infinite", display: "inline-block", flexShrink: 0 }} />}
      {children}
    </button>
  );
}

function Modal({ onClose, children, maxW = 480 }) {
  useEffect(() => { const h = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.78)", backdropFilter: "blur(14px)", animation: "sp-overlay-in 0.2s ease" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "90%", maxWidth: maxW, background: "rgba(8,11,22,0.99)", border: `1px solid ${C.borderMed}`, borderRadius: 22, boxShadow: "0 40px 100px rgba(0,0,0,0.75)", animation: "sp-modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function WarningModal({ title, body, bullets, confirmLabel = "Confirm", onConfirm, onCancel, variant = "danger" }) {
  const ac = variant === "danger" ? C.red : C.yellow;
  return (
    <Modal onClose={onCancel} maxW={460}>
      <div style={{ padding: "32px 28px 24px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, margin: "0 auto 18px", background: `${ac}18`, border: `1px solid ${ac}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
          {variant === "danger" ? "⚠️" : "ℹ️"}
        </div>
        <h3 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 21, fontWeight: 400, color: C.text, textAlign: "center", marginBottom: 8 }}>{title}</h3>
        {body && <p style={{ fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 1.65, marginBottom: 16 }}>{body}</p>}
        {bullets && (
          <div style={{ background: `${ac}08`, border: `1px solid ${ac}22`, borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: i < bullets.length - 1 ? 10 : 0, marginBottom: i < bullets.length - 1 ? 10 : 0, borderBottom: i < bullets.length - 1 ? `1px solid ${ac}14` : "none" }}>
                <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{b.icon}</span>
                <div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{b.title}</div>
                  {b.desc && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{b.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={onCancel} style={{ flex: 1 }}>Cancel</Btn>
          <button onClick={onConfirm} className="sp-action sp-primary"
            style={{
              flex: 1, padding: "11px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
              background: variant === "danger" ? "linear-gradient(135deg,#f87171,#ef4444)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
              color: variant === "danger" ? "#f8fafc" : "#0a0c14",
              boxShadow: variant === "danger" ? "0 0 20px rgba(248,113,113,0.4)" : "0 0 20px rgba(251,191,36,0.4)"
            }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ToastStack({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 22, right: 22, zIndex: 900, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => {
        const cfg = { success: { bg: "rgba(74,222,128,0.1)", bdr: "rgba(74,222,128,0.3)", color: C.green, icon: "✓" }, error: { bg: "rgba(248,113,113,0.1)", bdr: "rgba(248,113,113,0.35)", color: C.red, icon: "✕" }, warn: { bg: "rgba(251,191,36,0.09)", bdr: "rgba(251,191,36,0.3)", color: C.yellow, icon: "⚠" } }[t.type] || { bg: "rgba(255,255,255,0.06)", bdr: C.border, color: C.textSub, icon: "·" };
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.bdr}`, color: cfg.color, fontSize: 13, fontWeight: 500, backdropFilter: "blur(20px)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", animation: "sp-toast-in 0.32s cubic-bezier(0.34,1.56,0.64,1)", maxWidth: 340 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{cfg.icon}</span>
            <span style={{ color: C.text, fontSize: 12 }}>{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3800);
  }, []);
  return { toasts, push };
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.textMuted, marginBottom: 12 }}>{children}</div>;
}

function SettingRow({ label, desc, control, borderless }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "13px 0", borderBottom: borderless ? "none" : `1px solid ${C.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, lineHeight: 1.4 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function Skel({ h = 20, r = 10, style = {} }) {
  return <div style={{ height: h, borderRadius: r, background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "sp-shimmer 1.5s infinite", ...style }} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEGRAM — SETUP FORM (no credentials yet)
// ═══════════════════════════════════════════════════════════════════════════════
function TelegramSetupForm({ onSuccess, push }) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [tokenErr, setTokenErr] = useState("");
  const [chatErr, setChatErr] = useState("");
  const [testState, setTestState] = useState("idle"); // idle|testing|ok|fail
  const [enabling, setEnabling] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const validate = () => {
    let ok = true;
    if (!token.trim()) { setTokenErr("Bot token is required"); ok = false; } else setTokenErr("");
    if (!chatId.trim()) { setChatErr("Chat ID is required"); ok = false; } else setChatErr("");
    return ok;
  };

  const handleTokenChange = v => { setToken(v); if (testState !== "idle") setTestState("idle"); };

  const handleTest = async () => {
    if (!validate()) return;
    setTestState("testing");
    try {
      const r = await fetch(`${BASE_URL}/api/telegram/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
      const d = await r.json();
      if (d.valid) { setTestState("ok"); push("Bot token verified — connection successful", "success"); }
      else { setTestState("fail"); push("Invalid token — check your BotFather token", "error"); }
    } catch { setTestState("fail"); push("Network error — is the API server running?", "error"); }
  };

  const handleProceed = () => {
    if (!validate()) return;
    if (testState !== "ok") { push("Please test the connection before proceeding", "warn"); return; }
    setShowWarning(true);
  };

  const handleEnable = async () => {
    setShowWarning(false); setEnabling(true);
    try {
      const r = await fetch(`${BASE_URL}/api/telegram/enable`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim(), chat_id: chatId.trim() }) });
      const d = await r.json();
      if (d.success) { push("Telegram integration enabled successfully", "success"); onSuccess(); }
      else { push(d.error || "Failed to enable Telegram", "error"); }
    } catch { push("Server error — please try again", "error"); }
    setEnabling(false);
  };

  return (
    <>
      <Card style={{ borderColor: "rgba(96,165,250,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: C.blueGlow, border: "1px solid rgba(96,165,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✈️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Connect Telegram Bot</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>Enter credentials from @BotFather</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <InputField label="Bot Token" value={token} onChange={handleTokenChange} placeholder="123456789:AABBccDDee_..." secret error={tokenErr} hint="From @BotFather → /newbot → token" />
          <InputField label="Chat ID" value={chatId} onChange={setChatId} placeholder="-100123456789" error={chatErr} hint="Your Telegram user ID or group/channel ID" mono />
        </div>

        {testState !== "idle" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderRadius: 11, marginBottom: 18,
            background: testState === "ok" ? "rgba(74,222,128,0.07)" : testState === "fail" ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${testState === "ok" ? "rgba(74,222,128,0.25)" : testState === "fail" ? "rgba(248,113,113,0.25)" : C.border}`,
            animation: "sp-banner-in 0.28s ease"
          }}>
            {testState === "testing"
              ? <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.blue, animation: "sp-spin 0.65s linear infinite", display: "block", flexShrink: 0 }} />
              : <StatusDot color={testState === "ok" ? C.green : C.red} pulse={false} size={8} />}
            <span style={{ fontSize: 13, color: testState === "ok" ? C.green : testState === "fail" ? C.red : C.textSub, fontWeight: 500 }}>
              {testState === "testing" && "Testing connection…"}
              {testState === "ok" && "Connection verified — bot is reachable ✓"}
              {testState === "fail" && "Connection failed — check token or network"}
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={handleTest} loading={testState === "testing"} disabled={enabling} variant="secondary">
            {testState === "ok" ? "✓ Re-test" : "🔌 Test Connection"}
          </Btn>
          <Btn onClick={handleProceed} loading={enabling} disabled={testState !== "ok"} variant="primary">
            {enabling ? "Enabling…" : "Proceed →"}
          </Btn>
        </div>
      </Card>

      <Card dashed>
        <SectionLabel>How to get credentials</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { n: "🤖", title: "Create a bot via @BotFather", desc: "Open Telegram → search @BotFather → /newbot → follow prompts → copy the Bot Token." },
            { n: "💬", title: "Get your Chat ID", desc: "Send any message to your bot, then visit api.telegram.org/bot{TOKEN}/getUpdates — find chat.id in the JSON." },
            { n: "🔌", title: "Paste & test above", desc: "Enter both values, click 'Test Connection' to verify, then 'Proceed' to enable." },
          ].map(({ n, title, desc }) => (
            <div key={title} style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: C.blueGlow, border: "1px solid rgba(96,165,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, marginTop: 1 }}>{n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.textSub }}>{title}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {showWarning && (
        <WarningModal variant="danger" title="Enable Remote Control?"
          body="This will allow anyone with access to this Telegram bot to remotely control this device."
          bullets={[
            { icon: "📸", title: "Screenshot capture", desc: "Take and send screenshots via Telegram" },
            { icon: "📷", title: "Webcam access", desc: "Remotely capture webcam images" },
            { icon: "🔒", title: "Lock screen", desc: "Remotely lock the device" },
            { icon: "⚡", title: "Shutdown / Restart", desc: "Trigger system power commands" },
          ]}
          confirmLabel="Yes, Enable Telegram"
          onConfirm={handleEnable} onCancel={() => setShowWarning(false)} />
      )}
    </>
  );
}
function TelegramLiveCard({ status, config, onAction, loadingAction }) {
  const [showLogs, setShowLogs] = useState(false);
  const hasCreds = !!(config?.token);
  const st = computeStatus(config?.enabled, status?.running, hasCreds);
  const borderColor = st.key === "running" ? "rgba(74,222,128,0.2)" : st.key === "degraded" || st.key === "paused" ? "rgba(251,191,36,0.14)" : C.border;

  const recentCmds = config?.recent_commands || [];
  const lastCmd = recentCmds[0];
  const lastCmdText = lastCmd ? `Last command received: ${timeAgo(lastCmd.timestamp)}` : "No commands yet";

  return (
    <Card style={{ borderColor, padding: 0, overflow: "hidden" }}>
      {/* Running success banner */}
      {st.key === "running" && (
        <div style={{
          background: "linear-gradient(90deg,rgba(74,222,128,0.1),rgba(34,211,238,0.07))",
          borderBottom: "1px solid rgba(74,222,128,0.18)", padding: "10px 22px",
          display: "flex", alignItems: "center", gap: 10, animation: "sp-banner-in 0.3s ease"
        }}>
          <StatusDot color={C.green} pulse={true} size={8} />
          <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
            Bot is running and listening for commands
          </span>
          <span style={{
            fontSize: 10, color: C.textMuted, background: "rgba(255,255,255,0.05)",
            border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 7px", marginLeft: "auto"
          }}>LIVE</span>
        </div>
      )}

      <div style={{ padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14, background: `${st.color}14`, border: `1px solid ${st.color}28`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, transition: "background 0.35s,border-color 0.35s"
            }}>✈️</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 7 }}>Telegram Bot</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusDot color={st.color} pulse={st.pulse} size={8} />
                <span style={{ fontSize: 12, fontWeight: 600, color: st.color, transition: "color 0.35s" }}>{st.label}</span>
                <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>•</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>{lastCmdText}</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Token</div>
            <code style={{ fontSize: 12, color: C.textSub, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 10px" }}>{config?.token || "—"}</code>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 8, marginBottom: 4 }}>Chat ID</div>
            <code style={{ fontSize: 12, color: C.textSub, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 10px" }}>{config?.chat_id || "—"}</code>
          </div>
        </div>

        {/* Command Log Drawer */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setShowLogs(!showLogs)}
            style={{
              background: "transparent", border: "none", color: C.textSub, fontSize: 12,
              display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: 0,
              fontFamily: "'DM Sans',sans-serif"
            }}>
            <span>{showLogs ? "▼" : "▶"}</span>
            <span style={{ fontWeight: 500 }}>Recent Commands</span>
            <span style={{
              fontSize: 10, background: "rgba(255,255,255,0.08)", padding: "1px 6px",
              borderRadius: 10, color: C.textMuted
            }}>{recentCmds.length}</span>
          </button>

          {showLogs && (
            <div style={{
              marginTop: 10, background: "rgba(0,0,0,0.2)", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: 8, animation: "sp-banner-in 0.2s ease"
            }}>
              {recentCmds.length === 0 ? (
                <div style={{ padding: "8px 12px", fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
                  No commands received yet. Try sending /ping
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {recentCmds.map((cmd, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "6px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6
                    }}>
                      <code style={{ fontSize: 11, color: C.blue }}>{cmd.cmd}</code>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(cmd.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {[["📸", "Screenshots"], ["📷", "Webcam"], ["🔒", "Lock"], ["⚡", "Shutdown"], ["🔁", "Restart"]].map(([ic, lb]) => (
            <span key={lb} style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textMuted,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 11px"
            }}>
              <span>{ic}</span>{lb}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn onClick={() => onAction("restart")} loading={loadingAction === "restart"} disabled={!config?.enabled} size="sm">🔄 Restart</Btn>
          <Btn onClick={() => onAction(config?.enabled ? "disable" : "enable")} loading={loadingAction === "disable" || loadingAction === "enable"} variant={config?.enabled ? "secondary" : "warning"} size="sm">
            {config?.enabled ? "⏸ Disable" : "▶ Enable"}
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn onClick={() => onAction("reset")} loading={loadingAction === "reset"} variant="danger" size="sm">🗑 Remove Credentials</Btn>
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEGRAM — MASTER SECTION
// ═══════════════════════════════════════════════════════════════════════════════
function TelegramSection({ push }) {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(null);
  const [modal, setModal] = useState(null); // null|"disable"|"reset"|"enable"

  const fetchAll = useCallback(async () => {
    try {
      const [sr, cr] = await Promise.all([
        fetch(`${BASE_URL}/api/telegram/status`).then(r => r.json()),
        fetch(`${BASE_URL}/api/telegram/config`).then(r => r.json()),
      ]);
      setStatus(sr); setConfig(cr);
    } catch {
      setStatus({ enabled: false, running: false });
      setConfig({ enabled: false, token: null, chat_id: null });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 8000); return () => clearInterval(iv); }, [fetchAll]);

  const hasCreds = !!(config?.token);
  const isEnabled = !!config?.enabled;

  const requestAction = action => {
    if (["disable", "reset", "enable"].includes(action)) { setModal(action); return; }
    executeAction(action);
  };

  const executeAction = async action => {
    setModal(null); setLoadingAction(action);
    const endpoints = {
      restart: "/api/telegram/restart",
      disable: "/api/telegram/disable",
      enable: "/api/telegram/enable",  // empty body = Mode B re-enable
      reset: "/api/telegram/reset",
    };
    const msgs = {
      restart: ["Telegram service restarted", "success"],
      disable: ["Telegram disabled — credentials kept", "warn"],
      enable: ["Telegram re-enabled", "success"],
      reset: ["Credentials removed", "warn"],
    };
    try {
      const r = await fetch(`${BASE_URL}${endpoints[action]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (d.success) { push(...(msgs[action] || ["Done", "success"])); await fetchAll(); }
      else { push(d.error || `Failed: ${action}`, "error"); }
    } catch { push("Network error — is the API server running?", "error"); }
    setLoadingAction(null);
  };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Skel h={100} /> <Skel h={200} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Master toggle */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, fontSize: 20, background: C.blueGlow, border: "1px solid rgba(96,165,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>✈️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Telegram Integration</div>
              {(() => {
                const st = computeStatus(isEnabled, status?.running, hasCreds);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusDot color={st.color} pulse={st.pulse} size={7} />
                    <span style={{ fontSize: 12, color: st.color, fontWeight: 500, transition: "color 0.35s" }}>{st.label}</span>
                  </div>
                );
              })()}
            </div>
          </div>
          <Toggle on={isEnabled} onChange={v => requestAction(v ? "enable" : "disable")} loading={loadingAction === "disable" || loadingAction === "enable"} disabled={!hasCreds && !isEnabled} />
        </div>
        {!hasCreds && !isEnabled && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
            Fill in your bot credentials below, test the connection, then enable.
          </div>
        )}
      </Card>

      {hasCreds && <TelegramLiveCard status={status} config={config} onAction={requestAction} loadingAction={loadingAction} />}
      {!hasCreds && <TelegramSetupForm onSuccess={fetchAll} push={push} />}

      {modal === "disable" && <WarningModal variant="warning" title="Disable Telegram?" body="The bot service will stop. Your credentials are kept — you can re-enable anytime." confirmLabel="Disable" onConfirm={() => executeAction("disable")} onCancel={() => setModal(null)} />}
      {modal === "enable" && <WarningModal variant="warning" title="Re-enable Telegram?" body="The Telegram bot will restart using your saved credentials and begin accepting remote commands." confirmLabel="Enable" onConfirm={() => executeAction("enable")} onCancel={() => setModal(null)} />}
      {modal === "reset" && <WarningModal variant="danger" title="Remove Credentials?" body="This permanently deletes your bot token and Chat ID. The service will stop and you must reconfigure from scratch." confirmLabel="Yes, Remove Everything" onConfirm={() => executeAction("reset")} onCancel={() => setModal(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAL SECTION
// ═══════════════════════════════════════════════════════════════════════════════
function GeneralSection({ push }) {
  const DEFAULTS = { autostart: true, tray: true, notifications: false, idle: true, retention: "90", file_logging_enabled: true, file_logging_essential_only: true };
  const [s, setS] = useState({ ...DEFAULTS });
  const [saved, setSaved] = useState({ ...DEFAULTS });
  const [confirmReset, setConfirmReset] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/api/settings`)
      .then(r => r.json())
      .then(d => {
        const loaded = { ...DEFAULTS, ...d };
        setS(loaded);
        setSaved(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify(s) !== JSON.stringify(saved);

  const set = (k, v) => setS(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    try {
      await fetch(`${BASE_URL}/api/settings/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_logging_enabled: s.file_logging_enabled,
          file_logging_essential_only: s.file_logging_essential_only
        })
      });
      setSaved({ ...s });
      setConfirmReset(false);
      if (push) push("Settings saved", "success");
    } catch {
      if (push) push("Failed to save settings", "error");
    }
  };

  const handleReset = () => {
    setS({ ...DEFAULTS });
    setConfirmReset(false);
  };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Skel h={100} /> <Skel h={200} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionLabel>Application</SectionLabel>
        <SettingRow label="Auto-start on login" desc="Launch tracker when Windows starts" control={<Toggle on={s.autostart} onChange={v => set("autostart", v)} />} />
        <SettingRow label="Run in system tray" desc="Minimise to tray instead of closing" control={<Toggle on={s.tray} onChange={v => set("tray", v)} />} />
        <SettingRow label="Desktop notifications" desc="Alerts for limit warnings and events" control={<Toggle on={s.notifications} onChange={v => set("notifications", v)} />} />
        <SettingRow borderless label="Data retention" desc="Delete activity older than"
          control={<select value={s.retention} onChange={e => set("retention", e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "6px 12px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer" }}>
            {[["30", "30 days"], ["60", "60 days"], ["90", "90 days"], ["180", "6 months"], ["365", "1 year"], ["0", "Forever"]].map(([v, l]) => <option key={v} value={v} style={{ background: "#0f1222" }}>{l}</option>)}
          </select>} />
      </Card>
      <Card>
        <SectionLabel>Tracking</SectionLabel>
        <SettingRow label="Idle detection" desc="Detect when you step away" control={<Toggle on={s.idle} onChange={v => set("idle", v)} />} />
        <SettingRow label="File system logging" desc="Monitor local files created, modified or deleted" control={<Toggle on={s.file_logging_enabled} onChange={v => set("file_logging_enabled", v)} />} />
        {s.file_logging_enabled && <SettingRow label="Essential files only" desc="Only track common documents, code and media types" control={<Toggle on={s.file_logging_essential_only} onChange={v => set("file_logging_essential_only", v)} />} />}
        <SettingRow borderless label="Browser tab tracking" desc="Track active website titles" control={<Toggle on={false} onChange={() => { }} />} />
      </Card>

      {/* Reset confirmation row */}
      {
        confirmReset && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
            background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12,
            animation: "sp-banner-in 0.2s ease"
          }}>
            <span style={{ fontSize: 12, color: C.yellow, flex: 1 }}>Reset all settings to defaults?</span>
            <button onClick={handleReset} style={{
              fontSize: 12, color: C.yellow, background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "4px 14px", cursor: "pointer"
            }}>
              Yes, reset
            </button>
            <button onClick={() => setConfirmReset(false)} style={{
              fontSize: 12, color: C.textMuted, background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 14px", cursor: "pointer"
            }}>
              Cancel
            </button>
          </div>
        )
      }

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
        {/* Dirty state indicator */}
        {isDirty && (
          <span style={{
            fontSize: 11, color: C.yellow, background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "3px 10px",
            animation: "sp-banner-in 0.2s ease"
          }}>
            ● Unsaved changes
          </span>
        )}
        <Btn variant="secondary" onClick={() => setConfirmReset(true)}>Reset defaults</Btn>
        <Btn variant={isDirty ? "primary" : "secondary"} onClick={handleSave}>
          {isDirty ? "Save changes" : "Saved ✓"}
        </Btn>
      </div>
    </div >
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPED-CONFIRMATION MODAL (for destructive actions)
// ═══════════════════════════════════════════════════════════════════════════════
// User must type the exact confirmWord before the action button is enabled.
function TypedConfirmModal({ title, subtitle, bullets, confirmWord, confirmLabel, onConfirm, onCancel, loading }) {
  const [typed, setTyped] = useState("");
  const [shaking, setShake] = useState(false);
  const match = typed.trim() === confirmWord;

  const handleConfirm = () => {
    if (!match) { setShake(true); setTimeout(() => setShake(false), 500); return; }
    onConfirm();
  };

  useEffect(() => {
    const h = e => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", animation: "sp-overlay-in 0.2s ease"
    }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        width: "90%", maxWidth: 480, background: "rgba(6,8,18,0.99)",
        border: "1px solid rgba(248,113,113,0.3)", borderRadius: 24,
        boxShadow: "0 40px 100px rgba(0,0,0,0.9),0 0 0 1px rgba(248,113,113,0.08)",
        animation: "sp-modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)", overflow: "hidden"
      }}>

        {/* Red top stripe */}
        <div style={{ height: 4, background: "linear-gradient(90deg,#ef4444,#f87171,#ef4444)", backgroundSize: "200% 100%", animation: "sp-shimmer 2s linear infinite" }} />

        <div style={{ padding: "28px 28px 24px" }}>
          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 18, margin: "0 auto 16px",
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28
          }}>💣</div>

          <h3 style={{
            fontFamily: "'DM Serif Display',serif", fontSize: 22, fontWeight: 400,
            color: C.text, textAlign: "center", marginBottom: 6
          }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 1.65, marginBottom: 16 }}>{subtitle}</p>}

          {/* What gets deleted */}
          {bullets && (
            <div style={{
              background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)",
              borderRadius: 12, padding: "12px 16px", marginBottom: 18
            }}>
              {bullets.map((b, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: i > 0 ? "8px 0 0" : 0
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{b.icon}</span>
                  <span style={{ fontSize: 12, color: C.textSub }}>{b.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Typed confirmation field */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
              To confirm, type <code style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 5, padding: "1px 7px", color: C.red, fontFamily: "monospace", fontSize: 12 }}>{confirmWord}</code> below:
            </label>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              placeholder={`Type "${confirmWord}" to confirm`}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "11px 14px", borderRadius: 10, fontSize: 13,
                fontFamily: "monospace",
                background: match ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${match ? "rgba(248,113,113,0.5)" : typed ? "rgba(255,255,255,0.12)" : C.border}`,
                color: match ? C.red : C.text, outline: "none",
                animation: shaking ? "sp-shake 0.4s ease" : "none",
                transition: "border 0.2s,background 0.2s,color 0.2s",
              }}
            />
            {typed && !match && (
              <p style={{ fontSize: 11, color: "rgba(248,113,113,0.7)", marginTop: 5, animation: "sp-banner-in 0.2s ease" }}>
                That's not right — type exactly: {confirmWord}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} disabled={loading}
              style={{
                flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${C.border}`,
                background: "rgba(255,255,255,0.04)", color: C.textSub, fontSize: 13, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", cursor: "pointer", transition: "all 0.15s"
              }}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={!match || loading}
              style={{
                flex: 1, padding: "11px", borderRadius: 10, border: "none",
                background: match ? "linear-gradient(135deg,#ef4444,#dc2626)" : "rgba(255,255,255,0.06)",
                color: match ? "#f8fafc" : C.textMuted, fontSize: 13, fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif",
                cursor: !match || loading ? "not-allowed" : "pointer",
                boxShadow: match ? "0 0 24px rgba(239,68,68,0.45)" : "none",
                transition: "all 0.2s", opacity: loading ? 0.6 : 1
              }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#f8fafc", animation: "sp-spin 0.65s linear infinite", display: "block" }} />
                  Processing…
                </span>
              ) : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY SECTION
// ═══════════════════════════════════════════════════════════════════════════════
function SecuritySection({ push }) {
  // "clearData" | "factoryReset" | null
  const [activeModal, setActiveModal] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleClearData = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/clear-data`, {
        method: "DELETE",
        headers: { "X-Confirm-Clear": "true" },
      });
      const d = await r.json();
      if (d.success) {
        push("All activity data permanently deleted", "warn");
        setActiveModal(null);
      } else {
        push(d.error || "Failed to clear data", "error");
      }
    } catch {
      push("Network error — is the API server running?", "error");
    }
    setLoading(false);
  };

  const handleFactoryReset = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/factory-reset`, {
        method: "DELETE",
        headers: { "X-Confirm-Reset": "RESET_ALL" },
      });
      const d = await r.json();
      if (d.success) {
        push("Factory reset complete — restart the app to reconfigure", "warn");
        setActiveModal(null);
      } else {
        push(d.error || "Failed to reset", "error");
      }
    } catch {
      push("Network error — is the API server running?", "error");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card accent={C.yellow}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: C.yellowGlow, border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🔐</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Credential Encryption</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, marginBottom: 14 }}>All secrets (tokens, chat IDs) are AES-256 encrypted before storage. The key is derived from a machine-local identifier.</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["Algorithm", "AES-256"], ["Status", "Active"], ["Scope", "Local"]].map(([k, v]) => (
                <div key={k} style={{ background: C.yellowGlow, border: "1px solid rgba(251,191,36,0.18)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, color: C.yellow, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <SectionLabel>Access Control</SectionLabel>
        <SettingRow label="Require password to access settings" control={<Toggle on={false} onChange={() => { }} />} />
        <SettingRow label="Lock after idle timeout" control={<Toggle on={true} onChange={() => { }} />} />
        <SettingRow borderless label="Log access attempts" control={<Toggle on={true} onChange={() => { }} />} />
      </Card>


      {/* ── DANGER ZONE ── extra top margin + labeled header */}
      <div style={{ marginTop: 16 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: "0.12em" }}>⚠️ Danger Zone</span>
          <div style={{ flex: 1, height: 1, background: "rgba(248,113,113,0.15)" }} />
        </div>

        <Card danger>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Clear Data */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              padding: "16px 18px", background: "rgba(248,113,113,0.04)",
              border: "1px solid rgba(248,113,113,0.12)", borderRadius: 14
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>🗑️</span>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Clear all activity data</div>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                  Permanently deletes all tracked events, app usage history, keystrokes and click logs from the database.
                  <span style={{ color: C.red, fontWeight: 500 }}> This cannot be undone.</span>
                </div>
              </div>
              {/* Outline red button — less severe */}
              <button onClick={() => setActiveModal("clearData")}
                className="sp-action sp-danger"
                style={{
                  padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.35)",
                  background: "transparent", color: C.red, fontSize: 12, fontWeight: 600,
                  fontFamily: "'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0
                }}>
                Clear Data
              </button>
            </div>

            {/* Factory Reset */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              padding: "16px 18px", background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.22)", borderRadius: 14
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>Factory reset</div>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                  Removes <em style={{ color: C.textSub }}>everything</em> — all tracked data, all settings, all credentials (including Telegram).
                  The app returns to a blank state.
                  <span style={{ color: C.red, fontWeight: 600 }}> Absolutely cannot be undone.</span>
                </div>
              </div>
              {/* Filled solid red button — highest severity */}
              <button onClick={() => setActiveModal("factoryReset")}
                className="sp-action sp-danger"
                style={{
                  padding: "9px 16px", borderRadius: 10,
                  border: "1px solid rgba(248,113,113,0.5)",
                  background: "linear-gradient(135deg,rgba(239,68,68,0.25),rgba(220,38,38,0.2))",
                  color: C.red, fontSize: 12, fontWeight: 700,
                  fontFamily: "'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  boxShadow: "0 0 16px rgba(239,68,68,0.15)"
                }}>
                Reset Everything
              </button>
            </div>
          </div>
        </Card>
      </div>


      {/* ── CLEAR DATA MODAL ── */}
      {activeModal === "clearData" && (
        <TypedConfirmModal
          title="Clear all activity data?"
          subtitle="This will permanently delete every tracked event from the database. Your settings and Telegram credentials will be kept."
          confirmWord="CONFIRM"
          confirmLabel="Yes, Delete All Data"
          loading={loading}
          bullets={[
            { icon: "📊", text: "All daily activity stats and hourly logs" },
            { icon: "⌨️", text: "All keystroke and click counts" },
            { icon: "🕐", text: "All session history and timestamps" },
            { icon: "📱", text: "All per-app usage records" },
          ]}
          onConfirm={handleClearData}
          onCancel={() => setActiveModal(null)}
        />
      )}

      {/* ── FACTORY RESET MODAL ── */}
      {activeModal === "factoryReset" && (
        <TypedConfirmModal
          title="Factory reset everything?"
          subtitle="This is the nuclear option. Every piece of data this app has ever stored will be permanently destroyed."
          confirmWord="RESET"
          confirmLabel="Yes, Reset Everything"
          loading={loading}
          bullets={[
            { icon: "📊", text: "All tracked activity, history and logs" },
            { icon: "⚙️", text: "All app settings and preferences" },
            { icon: "✈️", text: "Telegram credentials (encrypted tokens)" },
            { icon: "🗄️", text: "The entire database — wiped clean" },
          ]}
          onConfirm={handleFactoryReset}
          onCancel={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABOUT SECTION
// ═══════════════════════════════════════════════════════════════════════════════
function AboutSection() {
  const [tab, setTab] = useState("about");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: 4 }}>
        {[["about", "About"], ["privacy", "Privacy"], ["licenses", "Licenses"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "7px 0", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 500, background: tab === id ? "rgba(74,222,128,0.1)" : "transparent", color: tab === id ? C.green : C.textMuted, transition: "all 0.2s" }}>{label}</button>
        ))}
      </div>

      {tab === "about" && (
        <Card>
          <div style={{ textAlign: "center", padding: "12px 0 28px" }}>
            {/* Logotype */}
            <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 20, margin: "0 auto",
                background: "linear-gradient(135deg,rgba(74,222,128,0.12),rgba(34,211,238,0.08))",
                border: "1px solid rgba(74,222,128,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 40px rgba(74,222,128,0.12)"
              }}>
                <span style={{ fontSize: 30, lineHeight: 1 }}>◈</span>
              </div>
              {/* Pulse ring */}
              <div style={{
                position: "absolute", inset: -4, borderRadius: 24,
                border: "1px solid rgba(74,222,128,0.12)", animation: "sp-ping 3s ease infinite"
              }} />
            </div>

            {/* Wordmark */}
            <div style={{
              fontFamily: "'DM Serif Display',serif", fontSize: 36, color: C.text,
              letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 6
            }}>
              Sta<em style={{ color: C.green, fontStyle: "italic" }}>sis</em>
            </div>

            {/* Primary tagline */}
            <div style={{
              fontSize: 11, color: C.textSub, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 6
            }}>
              Your Focus Core
            </div>

            {/* Secondary tagline */}
            <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.03em", lineHeight: 1.5, marginBottom: 14 }}>
              Wellbeing &amp; Remote Sync via Telegram
            </div>

            {/* Version pill */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px",
              borderRadius: 20, background: C.greenGlow, border: "1px solid rgba(74,222,128,0.2)"
            }}>
              <StatusDot color={C.green} pulse={false} size={6} />
              <span style={{ fontSize: 11, color: C.green, fontWeight: 500 }}>v2.1.0 · Stable</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[["Python", "3.11+"], ["Backend", "Flask"], ["Frontend", "React"], ["DB", "SQLite"], ["License", "MIT"], ["Mode", "Local"]].map(([k, v]) => (
              <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textSub, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "privacy" && (
        <Card>
          <SectionLabel>Privacy Policy</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { icon: "🏠", title: "Fully local", text: "Stasis runs entirely on your device. No data is ever sent to external servers or third parties." },
              { icon: "📊", title: "What is tracked", text: "Active window titles, keystroke count (not content), click count, timestamps, idle periods. No screenshots taken by default." },
              { icon: "🔐", title: "Credential security", text: "Telegram bot tokens and chat IDs are AES-256 encrypted before being written to the local SQLite database." },
              { icon: "✈️", title: "Telegram integration", text: "Only enabled by your explicit action. Remote commands are limited to those listed in the Telegram settings panel." },
            ].map(({ icon, title, text }) => (
              <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textSub, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "licenses" && (
        <Card>
          <SectionLabel>Open Source Licenses</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[["React", "18.x", "MIT"], ["Flask", "3.x", "BSD-3"], ["python-telegram-bot", "21.x", "LGPL-3"], ["SQLite", "3.x", "Public Domain"], ["cryptography", "42.x", "Apache-2.0"]].map(([name, ver, lic]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div><span style={{ fontSize: 13, color: C.textSub, fontWeight: 500 }}>{name}</span><span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>v{ver}</span></div>
                <span style={{ fontSize: 11, color: C.green, background: C.greenGlow, border: "1px solid rgba(74,222,128,0.2)", borderRadius: 6, padding: "2px 8px" }}>{lic}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDE NAV
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: "general", icon: "⚙️", label: "General", sub: "App & tracking" },
  { id: "telegram", icon: "✈️", label: "Telegram", sub: "Remote control" },
  { id: "security", icon: "🔐", label: "Security", sub: "Access & encryption" },
  { id: "about", icon: "ℹ️", label: "About", sub: "Version & privacy" },
];

function SideNav({ active, onChange, tgStatus, tgConfig }) {
  const tgSt = tgConfig ? computeStatus(tgConfig.enabled, tgStatus?.running, !!(tgConfig.token)) : null;
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {NAV_ITEMS.map(({ id, icon, label, sub }) => {
        const isAct = active === id;
        const badge = id === "telegram" && tgSt && tgSt.key !== "running" && tgSt.key !== "disabled";
        return (
          <button key={id} onClick={() => onChange(id)} className={`sp-nav-btn${isAct ? " active" : ""}`}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 14px 11px 16px",
              borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              position: "relative", background: isAct ? "rgba(74,222,128,0.09)" : "transparent",
              color: isAct ? C.green : C.textSub
            }}>
            {/* Left edge accent bar */}
            <div style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3,
              borderRadius: 4, height: isAct ? "60%" : 0, background: C.green,
              boxShadow: isAct ? `0 0 8px ${C.green}` : "none",
              transition: "height 0.25s cubic-bezier(0.34,1.56,0.64,1)"
            }} />
            <span style={{ fontSize: 17 }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: isAct ? 600 : 400, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
              <div style={{ fontSize: 11, color: isAct ? C.green + "aa" : C.textMuted, marginTop: 1 }}>{sub}</div>
            </div>
            {badge && (
              <span style={{
                fontSize: 9, fontWeight: 600, color: tgSt.color, background: `${tgSt.color}18`,
                border: `1px solid ${tgSt.color}33`, borderRadius: 10, padding: "2px 7px",
                letterSpacing: "0.03em", textTransform: "uppercase"
              }}>
                {tgSt.label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage({ onClose, initialSection = "telegram" }) {
  const [section, setSection] = useState(initialSection);
  const [mounted, setMounted] = useState(false);
  const [tgStatus, setTgStatus] = useState(null);
  const [tgConfig, setTgConfig] = useState(null);
  const { toasts, push } = useToast();

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const [sr, cr] = await Promise.all([fetch(`${BASE_URL}/api/telegram/status`).then(r => r.json()), fetch(`${BASE_URL}/api/telegram/config`).then(r => r.json())]);
        setTgStatus(sr); setTgConfig(cr);
      } catch { }
    };
    poll(); const iv = setInterval(poll, 10000); return () => clearInterval(iv);
  }, []);

  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const meta = {
    general: { label: "General", sub: "App behaviour and tracking" },
    telegram: { label: "Telegram Integration", sub: "Remote control via Telegram bot" },
    security: { label: "Security", sub: "Access control and encryption" },
    about: { label: "About & Privacy", sub: "Version, licenses and data policy" },
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(18px)", animation: "sp-overlay-in 0.22s ease" }}
        onClick={e => e.target === e.currentTarget && onClose()}>

        <div style={{ width: "100%", maxWidth: 960, maxHeight: "88vh", background: C.panel, border: `1px solid ${C.borderMed}`, borderRadius: 26, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 48px 120px rgba(0,0,0,0.85),0 0 0 1px rgba(255,255,255,0.04)", opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(30px) scale(0.97)", transition: "opacity 0.4s ease,transform 0.4s ease" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.015)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: C.greenGlow, border: "1px solid rgba(74,222,128,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>⚙️</div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: C.text, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    Sta<em style={{ color: C.green, fontStyle: "italic" }}>sis</em>
                  </span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, letterSpacing: "0.01em" }}>Settings</span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, letterSpacing: "0.05em", fontWeight: 500, textTransform: "uppercase" }}>
                  Wellbeing &amp; Remote Sync via Telegram
                </div>
              </div>
            </div>

            {tgConfig && (() => {
              const st = computeStatus(tgConfig.enabled, tgStatus?.running, !!(tgConfig.token));
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 12px", background: `${st.color}0f`, border: `1px solid ${st.color}22`, borderRadius: 20, marginLeft: 16, marginRight: "auto" }}>
                  <StatusDot color={st.color} pulse={st.pulse} size={6} />
                  <span style={{ fontSize: 11, color: st.color, fontWeight: 500 }}>Telegram · {st.label}</span>
                </div>
              );
            })()}

            <button onClick={onClose} className="sp-close" style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, transition: "all 0.15s" }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            <div style={{ width: 200, flexShrink: 0, padding: "16px 12px", borderRight: `1px solid ${C.border}`, background: "rgba(255,255,255,0.008)", overflowY: "auto" }}>
              <SideNav active={section} onChange={setSection} tgStatus={tgStatus} tgConfig={tgConfig} />
            </div>
            <div key={section} className="sp-scroll" style={{ flex: 1, overflowY: "auto", padding: "24px 28px", animation: "sp-slide-in 0.24s ease" }}>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: C.text, fontWeight: 400 }}>{meta[section]?.label}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 5 }}>{meta[section]?.sub}</div>
              </div>
              {section === "general" && <GeneralSection push={push} />}
              {section === "telegram" && <TelegramSection push={push} />}
              {section === "security" && <SecuritySection push={push} />}
              {section === "about" && <AboutSection />}
            </div>
          </div>
        </div>
      </div>

      <ToastStack toasts={toasts} />
    </>
  );
}

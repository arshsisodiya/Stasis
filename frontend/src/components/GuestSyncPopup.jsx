import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Database, Clock, Activity, CheckCircle, XCircle } from 'lucide-react';

const C = {
  bg: "#080b14",
  panel: "rgba(10,13,24,0.98)",
  surface: "rgba(8, 11, 20, 0.97)",
  border: "rgba(255,255,255,0.07)",
  borderMed: "rgba(255,255,255,0.11)",
  text: "#f0f4f8",
  textSub: "#94a3b8",
  textMuted: "#4a5568",
  green: "#4ade80",
  blue: "#60a5fa",
  red: "#f87171",
};

function formatDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GuestSyncPopup() {
  const { guestData, syncGuestData, discardGuestData } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  useEffect(() => {
    if (guestData) {
      // Small delay for smooth entry after auth screen unmounts
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [guestData]);

  if (!guestData && !isVisible) return null;

  const handleSync = async () => {
    setIsProcessing(true);
    await syncGuestData();
    setIsProcessing(false);
    setIsVisible(false);
  };

  const handleIgnore = async () => {
    if (window.confirm("Are you sure? This will permanently delete your guest session data.")) {
      setIsProcessing(true);
      await discardGuestData();
      setIsProcessing(false);
      setIsVisible(false);
    }
  };

  const dateRange = guestData?.min_date === guestData?.max_date 
    ? formatDate(guestData?.min_date)
    : `${formatDate(guestData?.min_date)} – ${formatDate(guestData?.max_date)}`;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999,
      opacity: isVisible ? 1 : 0,
      pointerEvents: isVisible ? 'auto' : 'none',
      transition: 'opacity 0.3s ease',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <div style={{
        width: '400px',
        background: C.panel,
        borderRadius: '24px',
        border: `1px solid ${C.borderMed}`,
        boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
        padding: '32px',
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column', gap: '24px'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            width: 48, height: 48, borderRadius: 16, 
            background: 'rgba(96, 165, 250, 0.1)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid rgba(96, 165, 250, 0.2)`
          }}>
            <Database size={24} color={C.blue} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: C.text }}>Unsynced Data Found</h3>
            <p style={{ margin: 0, fontSize: '13px', color: C.textSub, marginTop: '4px' }}>
              We found activity logged from your guest session.
            </p>
          </div>
        </div>

        {/* Stats Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '16px',
          border: `1px solid ${C.border}`,
          padding: '20px',
          display: 'flex', flexDirection: 'column', gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: C.textSub, fontSize: '13px' }}>
              <Clock size={14} /> Total Time Tracked
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>
              {formatDuration(guestData?.total_seconds)}
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: C.textSub, fontSize: '13px' }}>
              <Activity size={14} /> Date Range
            </div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: C.text }}>
              {dateRange}
            </div>
          </div>

          {/* Top Apps */}
          {guestData?.top_apps?.length > 0 && (
            <div style={{ marginTop: '4px', borderTop: `1px solid ${C.border}`, paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, marginBottom: '12px' }}>
                Top Applications
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {guestData.top_apps.map((app, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                      {app.name}
                    </span>
                    <span style={{ color: C.textSub, fontFamily: 'monospace' }}>
                      {formatDuration(app.seconds)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={handleSync}
            disabled={isProcessing}
            style={{
              background: C.text, color: C.bg,
              border: 'none', borderRadius: '12px',
              padding: '14px', fontSize: '14px', fontWeight: 600,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              opacity: isProcessing ? 0.7 : 1,
              transition: 'transform 0.1s'
            }}
            onMouseDown={e => e.target.style.transform = 'scale(0.98)'}
            onMouseUp={e => e.target.style.transform = 'scale(1)'}
          >
            <CheckCircle size={18} />
            Sync to My Account
          </button>
          
          <button
            onClick={handleIgnore}
            disabled={isProcessing}
            style={{
              background: 'transparent', color: C.textSub,
              border: `1px solid ${C.border}`, borderRadius: '12px',
              padding: '14px', fontSize: '14px', fontWeight: 500,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              if(!isProcessing) {
                e.target.style.background = 'rgba(248, 113, 113, 0.05)';
                e.target.style.color = C.red;
                e.target.style.borderColor = 'rgba(248, 113, 113, 0.2)';
              }
            }}
            onMouseLeave={e => {
              if(!isProcessing) {
                e.target.style.background = 'transparent';
                e.target.style.color = C.textSub;
                e.target.style.borderColor = C.border;
              }
            }}
          >
            <XCircle size={18} />
            Discard Data
          </button>
        </div>

      </div>
    </div>
  );
}

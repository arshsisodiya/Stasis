import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, Lock, User, ArrowRight } from 'lucide-react';

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

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [userFocused, setUserFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [btnActive, setBtnActive] = useState(false);
  
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }
    
    setLoading(true);
    let result;
    if (isLogin) {
      result = await login(username, password);
    } else {
      result = await register(username, password);
    }
    setLoading(false);
    
    if (!result.success) {
      setError(result.error || 'Authentication failed');
    }
  };

  const globalStyle = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Serif+Display:ital@0;1&display=swap');
    
    .auth-body {
      font-family: 'DM Sans', sans-serif;
    }
  `;

  return (
    <div className="auth-body" style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #0d1222, #05060b)',
      color: C.text,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <style>{globalStyle}</style>

      {/* Radial ambient background glows */}
      <div style={{
        position: 'absolute', top: '-10%', left: '30%', width: '500px', height: '500px',
        borderRadius: '50%', background: 'rgba(74, 222, 128, 0.03)', filter: 'blur(100px)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', right: '20%', width: '600px', height: '600px',
        borderRadius: '50%', background: 'rgba(34, 211, 238, 0.03)', filter: 'blur(120px)', pointerEvents: 'none'
      }} />

      {/* Main card container */}
      <div style={{ 
        width: '420px', 
        background: C.panel, 
        borderRadius: '26px', 
        padding: '40px 36px',
        boxShadow: '0 48px 120px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)',
        border: `1px solid ${C.borderMed}`,
        backdropFilter: 'blur(18px)',
        zIndex: 10,
        boxSizing: 'border-box'
      }}>
        {/* Header / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px', gap: 10 }}>
          <div style={{ 
            width: 42, height: 42, borderRadius: 13, 
            background: 'rgba(74, 222, 128, 0.12)', 
            border: '1px solid rgba(74, 222, 128, 0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
            <Activity size={22} color={C.green} style={{ filter: `drop-shadow(0 0 6px ${C.green}88)` }} />
          </div>
          <span style={{ 
            fontFamily: "'DM Serif Display', serif", 
            fontSize: '28px', 
            color: C.text, 
            lineHeight: 1, 
            letterSpacing: '-0.02em' 
          }}>
            Sta<em style={{ color: C.green, fontStyle: 'italic', fontWeight: 'normal' }}>sis</em>
          </span>
        </div>
        
        <h2 style={{ fontSize: '20px', fontWeight: 600, textAlign: 'center', marginBottom: '8px', color: C.text, letterSpacing: '-0.01em' }}>
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p style={{ textAlign: 'center', color: C.textSub, fontSize: '13px', lineHeight: 1.5, marginBottom: '28px', padding: '0 8px' }}>
          {isLogin ? 'Log in to securely track and sync your digital wellbeing.' : 'Sign up to start monitoring your screen productivity.'}
        </p>

        {error && (
          <div style={{ 
            background: 'rgba(248, 113, 113, 0.08)', 
            color: C.red, 
            padding: '12px 16px', 
            borderRadius: '12px', 
            marginBottom: '20px', 
            fontSize: '12px', 
            lineHeight: 1.5,
            border: `1px solid rgba(248, 113, 113, 0.2)` 
          }}>
            <span style={{ marginRight: 6 }}>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Username Field */}
          <div>
            <label style={{ 
              display: 'block', marginBottom: '8px', fontSize: '10px', fontWeight: 700, 
              letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textSub 
            }}>Username</label>
            <div style={{ 
              position: 'relative',
              borderRadius: '12px',
              border: `1px solid ${userFocused ? 'rgba(74,222,128,0.42)' : C.border}`,
              background: 'rgba(255,255,255,0.04)',
              boxShadow: userFocused ? '0 0 0 3px rgba(74,222,128,0.08)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center'
            }}>
              <User size={16} color={userFocused ? C.green : C.textMuted} style={{ position: 'absolute', left: '14px', transition: 'color 0.2s' }} />
              <input 
                type="text" 
                placeholder="Enter username" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={() => setUserFocused(true)}
                onBlur={() => setUserFocused(false)}
                style={{
                  width: '100%', padding: '12px 14px 12px 42px',
                  background: 'transparent', border: 'none',
                  borderRadius: '12px', color: C.text, fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: "'DM Sans', sans-serif"
                }}
              />
            </div>
          </div>
          
          {/* Password Field */}
          <div>
            <label style={{ 
              display: 'block', marginBottom: '8px', fontSize: '10px', fontWeight: 700, 
              letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textSub 
            }}>Password</label>
            <div style={{ 
              position: 'relative',
              borderRadius: '12px',
              border: `1px solid ${passFocused ? 'rgba(74,222,128,0.42)' : C.border}`,
              background: 'rgba(255,255,255,0.04)',
              boxShadow: passFocused ? '0 0 0 3px rgba(74,222,128,0.08)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Lock size={16} color={passFocused ? C.green : C.textMuted} style={{ position: 'absolute', left: '14px', transition: 'color 0.2s' }} />
              <input 
                type="password" 
                placeholder="Enter password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setPassFocused(true)}
                onBlur={() => setPassFocused(false)}
                style={{
                  width: '100%', padding: '12px 14px 12px 42px',
                  background: 'transparent', border: 'none',
                  borderRadius: '12px', color: C.text, fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: "'DM Sans', sans-serif"
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => { setBtnHovered(false); setBtnActive(false); }}
            onMouseDown={() => setBtnActive(true)}
            onMouseUp={() => setBtnActive(false)}
            style={{
              width: '100%', padding: '12px', marginTop: '12px',
              background: 'linear-gradient(135deg, #4ade80 0%, #22d3ee 100%)', 
              color: '#060a12', border: 'none',
              borderRadius: '12px', fontSize: '13px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: btnHovered ? '0 0 24px rgba(74,222,128,0.45)' : '0 0 16px rgba(74,222,128,0.25)',
              transform: btnActive ? 'scale(0.97)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              opacity: loading ? 0.7 : 1,
              fontFamily: "'DM Sans', sans-serif"
            }}
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
            {!loading && <ArrowRight size={15} style={{ marginLeft: '8px' }} />}
          </button>
        </form>

        {/* Footer Toggle */}
        <div style={{ textAlign: 'center', marginTop: '28px', fontSize: '13px' }}>
          <span style={{ color: C.textSub }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{ 
              background: 'none', border: 'none', color: C.green, 
              cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600,
              transition: 'color 0.15s ease',
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif"
            }}
            onMouseEnter={e => e.target.style.color = '#34d399'}
            onMouseLeave={e => e.target.style.color = C.green}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

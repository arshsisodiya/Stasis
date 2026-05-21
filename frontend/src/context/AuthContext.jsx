import { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext();

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

// How long to wait between retries when the backend isn't up yet (ms)
const RETRY_DELAY_MS = 1500;
// Maximum number of retries before we accept that backend is unreachable
// (40 retries × 1.5s = 60s, same as LoadingScreen's max wait)
const MAX_RETRIES = 40;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('stasis_auth_token') || null);
  // loading stays true until we have definitively resolved auth state
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Guest state
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('stasis_guest_mode') === 'true');
  const [guestData, setGuestData] = useState(null);

  // ── Token validation with retry on network errors ─────────────────────────
  // Separates two failure modes:
  //   1. Network error  → backend not ready yet  → RETRY (keep loading=true)
  //   2. 401 response   → token invalid/expired  → clear token, show login
  const validateToken = async (tok) => {
    if (!tok) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${tok}` },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUser(data.user);
          setLoading(false);
          retryCountRef.current = 0;
          return;
        }
      }

      // Got a proper HTTP response but auth failed (401, bad token, etc.)
      // This is a definitive auth failure — clear credentials and show login.
      setToken(null);
      setUser(null);
      localStorage.removeItem('stasis_auth_token');
      setLoading(false);
      retryCountRef.current = 0;

    } catch (err) {
      // Network error — backend is not up yet (or temporarily unreachable).
      // Keep loading=true and retry after a delay.
      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_RETRIES) {
        // Backend failed to start within the timeout window.
        // Conservatively: keep the token but stop loading so the user can
        // see the LoadingScreen error and retry manually.
        console.error('[AuthContext] Backend unreachable after max retries, giving up.');
        setLoading(false);
        retryCountRef.current = 0;
        return;
      }

      // Schedule next retry
      retryTimerRef.current = setTimeout(() => {
        validateToken(tok);
      }, RETRY_DELAY_MS);
    }
  };

  useEffect(() => {
    // Start validation immediately; it will retry until backend responds.
    validateToken(token);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []); // Only run once on mount — token from localStorage is already captured

  const login = async (username, password) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      setToken(data.token);
      localStorage.setItem('stasis_auth_token', data.token);
      setUser(data.user);
      setIsGuest(false);
      localStorage.removeItem('stasis_guest_mode');
      if (data.has_guest_data && data.guest_summary) {
        setGuestData(data.guest_summary);
      }
      return { success: true };
    }
    return { success: false, error: data.error };
  };

  const register = async (username, password) => {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      setToken(data.token);
      localStorage.setItem('stasis_auth_token', data.token);
      setUser(data.user);
      setIsGuest(false);
      localStorage.removeItem('stasis_guest_mode');
      if (data.has_guest_data && data.guest_summary) {
        setGuestData(data.guest_summary);
      }
      return { success: true };
    }
    return { success: false, error: data.error };
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {}
    }
    // Cancel any pending retries
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('stasis_auth_token');
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('stasis_guest_mode', 'true');
  };

  const syncGuestData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/api/auth/sync-guest`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setGuestData(null);
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const discardGuestData = async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/discard-guest`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setGuestData(null);
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, loading, login, register, logout,
      isGuest, guestData, setGuestData, continueAsGuest,
      syncGuestData, discardGuestData
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

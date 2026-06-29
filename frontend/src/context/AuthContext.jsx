import { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext();

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 40;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('stasis_auth_token') || null);
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

  const validateToken = async () => {
    try {
      // The backend /me endpoint will auto-login the local system user and return a token
      // We pass the existing token if we have one, but /me doesn't require it to work anymore
      // since it generates one on the fly if needed. However, passing it is good practice.
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const res = await fetch(`${BASE}/api/auth/me`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUser(data.user);
          setToken(data.token);
          localStorage.setItem('stasis_auth_token', data.token);
          setLoading(false);
          retryCountRef.current = 0;
          return;
        }
      }

      // If it fails with a 401 or similar, maybe the token is invalid, but backend 
      // is supposed to auto-login. If it fails, we just retry.
      throw new Error("Failed to auto-login");

    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_RETRIES) {
        console.error('[AuthContext] Backend unreachable after max retries, giving up.');
        setLoading(false);
        retryCountRef.current = 0;
        return;
      }

      retryTimerRef.current = setTimeout(() => {
        validateToken();
      }, RETRY_DELAY_MS);
    }
  };

  useEffect(() => {
    validateToken();

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfile = async (username) => {
    if (!token) return { success: false, error: "Not authenticated" };
    
    try {
      const res = await fetch(`${BASE}/api/auth/update-profile`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (data.success) {
        setUser(prev => ({ ...prev, username }));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, loading, updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

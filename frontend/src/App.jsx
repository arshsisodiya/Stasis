import WellbeingDashboard from './WellbeingDashboard';
import LoadingScreen from './pages/LoadingScreen';
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthScreen from './pages/AuthScreen';

/**
 * Startup transition flow:
 *  "idle"     → only LoadingScreen shown
 *  "entering" → Dashboard mounts underneath with pre-fetched data,
 *               LoadingScreen plays ls-outro (blur+fade) on top (zIndex 9999)
 *  "done"     → LoadingScreen unmounted, only Dashboard visible
 *
 * Auth + Backend coordination:
 *  - LoadingScreen polls the backend health endpoint.
 *  - AuthContext simultaneously retries token validation with retry on network errors.
 *  - We wait for BOTH to resolve before deciding what to show:
 *      user is set   → transition to dashboard
 *      user is null  → show AuthScreen
 */
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const [stage, setStage] = useState("idle");
  const [initialData, setInitialData] = useState(null);
  // Tracks whether the backend health check has succeeded
  const [backendReady, setBackendReady] = useState(false);
  // Ref to hold prefetched data from the LoadingScreen during the auth-loading phase
  const cachedDataRef = useRef(null);
  const { user, loading: authLoading } = useAuth();

  const doTransition = async (prefetchedData) => {
    setInitialData(prefetchedData || null);
    setStage("entering");

    if (window.__TAURI_INTERNALS__) {
      try {
        const store = await load("settings.json");

        const sX = await store.get("widget_anchor_x");
        const sY = await store.get("widget_anchor_y");
        let ax = sX !== null && sX !== undefined ? parseInt(sX) : parseInt(prefetchedData?.settings?.widget_anchor_x || "0");
        let ay = sY !== null && sY !== undefined ? parseInt(sY) : parseInt(prefetchedData?.settings?.widget_anchor_y || "0");

        if (ax > 0 && ay > 0) {
          await invoke("set_widget_anchor", { x: ax, y: ay });
        }

        const sEnabled = await store.get("widget_enabled");
        const isEnabled = sEnabled !== null && sEnabled !== undefined ? sEnabled : prefetchedData?.settings?.widget_enabled;
        if (isEnabled) {
          await invoke("set_widget_visibility", { visible: true });
        }
      } catch (err) {
        console.warn("Failed to invoke Tauri commands:", err);
      }
    }

    setTimeout(() => setStage("done"), 750);
  };

  // ── Effect: When authLoading flips to false AND backend is already ready,
  //    immediately start the dashboard transition (no second health-check needed).
  useEffect(() => {
    if (!authLoading && user && backendReady && stage === "idle") {
      doTransition(cachedDataRef.current);
    }
  }, [authLoading, user, backendReady]);

  // ── Show LoadingScreen while auth is still resolving ──
  // This runs the backend health-check polling concurrently with auth validation.
  if (authLoading) {
    return (
      <LoadingScreen
        onReady={(data) => {
          // Backend is healthy — cache the data. We'll use it once auth resolves.
          cachedDataRef.current = data;
          setBackendReady(true);
          // Note: we do NOT call doTransition here because we don't know yet
          // whether auth will succeed (user) or fail (show AuthScreen).
        }}
      />
    );
  }

  // ── Auth resolved: no valid user → show login screen ──
  if (!user) {
    return <AuthScreen />;
  }

  // ── Auth resolved: valid user present ──
  return (
    <>
      {/* Dashboard renders underneath as soon as the API is ready */}
      {stage !== "idle" && (
        <WellbeingDashboard
          initialData={initialData}
          onDisconnect={() => { setStage("idle"); setInitialData(null); }}
        />
      )}

      {/* LoadingScreen sits on top (zIndex 9999). When ready it plays
          ls-outro (blur+scale+fade) over the already-visible dashboard.
          
          If backend was already confirmed healthy during the auth-loading phase
          (backendReady=true), the useEffect above already called doTransition,
          so stage won't be "idle" anymore and this LoadingScreen is skipped.
          
          If we somehow get here with stage="idle" (e.g. fast auth resolve before
          health check), let the LoadingScreen do a fresh health check. */}
      {stage !== "done" && (
        <LoadingScreen onReady={doTransition} />
      )}
    </>
  );
}

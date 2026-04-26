import WellbeingDashboard from './WellbeingDashboard';
import LoadingScreen from './pages/LoadingScreen';
import TaskbarWidget from './shared/TaskbarWidget';
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useEffect, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:7432";

/**
 * Transition flow:
 *  "idle"     → only LoadingScreen shown
 *  "entering" → Dashboard mounts underneath with pre-fetched data,
 *               LoadingScreen plays ls-outro (blur+fade) on top (zIndex 9999)
 *  "done"     → LoadingScreen unmounted, only Dashboard visible
 *
 * Result: the ls-outro animation plays over an already-rendered dashboard,
 * so there is never a white screen or skeleton flash between the two.
 */
export default function App() {
  const [stage, setStage] = useState("idle");
  const [initialData, setInitialData] = useState(null);
  const [windowLabel, setWindowLabel] = useState("");

  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      setWindowLabel(getCurrentWindow().label);
    } else {
      setWindowLabel("main");
    }
  }, []);

  const handleReady = async (prefetchedData) => {
    // Dashboard mounts right now with real data already available
    setInitialData(prefetchedData || null);
    setStage("entering");

    // Only run Tauri-specific commands if we are actually in a Tauri environment
    if (window.__TAURI_INTERNALS__) {
      try {
        const store = await load("settings.json");

        // 1. Restore widget anchor (Priority: Store > Backend)
        const sX = await store.get("widget_anchor_x");
        const sY = await store.get("widget_anchor_y");
        
        let ax = sX !== null && sX !== undefined ? parseInt(sX) : parseInt(prefetchedData?.settings?.widget_anchor_x || "0");
        let ay = sY !== null && sY !== undefined ? parseInt(sY) : parseInt(prefetchedData?.settings?.widget_anchor_y || "0");

        if (ax > 0 && ay > 0) {
          await invoke("set_widget_anchor", { x: ax, y: ay });
        }

        // 2. Restore widget visibility (Priority: Store > Backend)
        const sEnabled = await store.get("widget_enabled");
        const isEnabled = sEnabled !== null && sEnabled !== undefined ? sEnabled : prefetchedData?.settings?.widget_enabled;

        if (isEnabled) {
          await invoke("set_widget_visibility", { visible: true });
        }
      } catch (err) {
        console.warn("Failed to invoke Tauri commands:", err);
      }
    }

    // Remove LoadingScreen after its ls-outro finishes (700 ms)
    setTimeout(() => setStage("done"), 750);
  };

  if (windowLabel === "widget") {
    return <TaskbarWidget BASE={BASE} />;
  }

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
          ls-outro (blur+scale+fade) over the already-visible dashboard. */}
      {stage !== "done" && (
        <LoadingScreen onReady={handleReady} />
      )}
    </>
  );
}

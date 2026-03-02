import { useState } from 'react';
import WellbeingDashboard from './WellbeingDashboard';
import LoadingScreen from './pages/LoadingScreen';

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

  const handleReady = (prefetchedData) => {
    // Dashboard mounts right now with real data already available
    setInitialData(prefetchedData || null);
    setStage("entering");
    // Remove LoadingScreen after its ls-outro finishes (700 ms)
    setTimeout(() => setStage("done"), 750);
  };

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

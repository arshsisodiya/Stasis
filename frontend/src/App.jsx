import { useState } from 'react';
import WellbeingDashboard from './WellbeingDashboard';
import LoadingScreen from './LoadingScreen';

export default function App() {
  const [ready, setReady] = useState(false);

  if (!ready) {
    return <LoadingScreen onReady={() => setReady(true)} />;
  }

  return <WellbeingDashboard onDisconnect={() => setReady(false)} />;
}

import { useState, useEffect } from "react";
import { localYMD } from "./utils";

// ─── COUNT UP ANIMATION ───────────────────────────────────────────────────────
export function useCountUp(target, duration = 1400, key = "") {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    let start = null;
    let raf;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setValue(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) { raf = requestAnimationFrame(step); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, key]);
  return value;
}

// ─── LIVE CLOCK ───────────────────────────────────────────────────────────────
export function useLiveClock(selectedDate) {
  const [elapsed, setElapsed] = useState(0);
  const isToday = selectedDate === localYMD();
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const now = new Date();
      setElapsed(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [isToday]);
  return { elapsed, isToday };
}

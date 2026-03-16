import { useState, useEffect, useRef } from "react";
import { localYMD } from "./utils";

// ─── SHARED RAF LOOP ──────────────────────────────────────────────────────────
// Batches all useCountUp animations into a single requestAnimationFrame callback
// instead of running 4+ independent RAF loops simultaneously.
const _rafCallbacks = new Set();
let _rafId = null;

function _rafTick(ts) {
  for (const cb of _rafCallbacks) cb(ts);
  if (_rafCallbacks.size > 0) {
    _rafId = requestAnimationFrame(_rafTick);
  } else {
    _rafId = null;
  }
}

function _addRAF(cb) {
  _rafCallbacks.add(cb);
  if (_rafId === null) _rafId = requestAnimationFrame(_rafTick);
}

function _removeRAF(cb) {
  _rafCallbacks.delete(cb);
  if (_rafCallbacks.size === 0 && _rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

// ─── COUNT UP ANIMATION ───────────────────────────────────────────────────────
export function useCountUp(target, duration = 1500, key = "") {
  const [value, setValue] = useState(0);
  const prevTargetRef = useRef(0);

  useEffect(() => {
    const startValue = prevTargetRef.current;
    const diff = (target || 0) - startValue;

    // If no change, just ensure we're at target and stop.
    if (diff === 0) {
      setValue(target || 0);
      return;
    }

    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const p = Math.min(elapsed / duration, 1);

      // Quartic ease-out for a more premium, "weighted" feel
      const ease = 1 - Math.pow(1 - p, 4);
      const current = startValue + (diff * ease);

      const isFloat = target % 1 !== 0;
      setValue(isFloat ? parseFloat(current.toFixed(1)) : Math.floor(current));

      if (p >= 1) {
        prevTargetRef.current = target;
        _removeRAF(step);
      }
    };
    _addRAF(step);
    return () => {
      _removeRAF(step);
      prevTargetRef.current = target;
    };
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

// ─── VISIBILITY-AWARE POLLING ───────────────────────────────────────────────
// Runs a polling task with one interval when the tab is visible and a slower
// interval (or disabled) when hidden to reduce background churn.
export function useVisibilityPolling(task, {
  enabled = true,
  visibleIntervalMs,
  hiddenIntervalMs = 0,
  immediate = true,
} = {}) {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled || !visibleIntervalMs) return;

    let alive = true;
    let timer = null;

    const getDelay = () => (
      document.visibilityState === "visible" ? visibleIntervalMs : hiddenIntervalMs
    );

    const schedule = () => {
      if (!alive) return;
      const delay = getDelay();
      if (!delay || delay <= 0) return;
      timer = setTimeout(run, delay);
    };

    const run = async () => {
      if (!alive) return;
      try {
        await taskRef.current();
      } finally {
        schedule();
      }
    };

    const onVisibility = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      schedule();
    };

    if (immediate) {
      run();
    } else {
      schedule();
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, visibleIntervalMs, hiddenIntervalMs, immediate]);
}

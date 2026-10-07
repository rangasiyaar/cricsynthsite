"use client";
// Small animation helpers. Everything respects prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** false on the first paint, true one frame later — lets CSS transitions animate from their start state. */
export function useMounted(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reducedMotion()) { setOn(true); return; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** Number that eases from its previous value (0 at first) to `target`. */
export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(target)) { setV(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}

/** "2d 4h", "3h 12m", "12m" until `iso`, ticking every 30s; null once it has passed. */
export function useCountdown(date?: string, time?: string): string | null {
  const target = date ? new Date(`${date}T${time && /^\d\d:\d\d/.test(time) ? time : "00:00"}:00`) : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!target || now === null || Number.isNaN(target.getTime())) return null;
  const s = Math.floor((target.getTime() - now) / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

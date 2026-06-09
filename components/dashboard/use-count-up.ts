"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * useCountUp — animates a numeric value from 0 → target over `duration` ms
 * using requestAnimationFrame and an ease-out curve. Respects
 * `prefers-reduced-motion`: returns the target value immediately.
 *
 * Re-runs whenever `target` changes (e.g. when a dashboard filter changes).
 *
 * @param target   final value
 * @param duration animation length in ms (default 800)
 */
export function useCountUp(target: number, duration = 800): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState<number>(reduce ? target : 0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }

    // Cancel any in-flight animation before starting a new one.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    // Always count up from 0 — keeps the effect feeling fresh on filter swap.
    fromRef.current = 0;
    startRef.current = null;
    setValue(0);

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOut(t);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration, reduce]);

  return value;
}

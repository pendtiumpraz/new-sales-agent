"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * useAnimatedNumber — animates between the *previous* and *current* target
 * using requestAnimationFrame with an ease-out curve. Unlike useCountUp this
 * does not reset to 0 on every change, so it's ideal for live filter counts
 * ("Y prospek cocok") where smooth interpolation between consecutive values
 * is more pleasant than a flashy reset.
 *
 * Respects `prefers-reduced-motion` — snaps to the target immediately.
 *
 * @param target   the value to land on
 * @param duration animation length in ms (default 400)
 */
export function useAnimatedNumber(target: number, duration = 400): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState<number>(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(target);

  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    // Snapshot current displayed value as the new starting point so we
    // animate from-current → target rather than 0 → target.
    fromRef.current = value;
    startRef.current = null;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

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
    // We intentionally exclude `value` from the dep list: we only want to
    // re-launch when `target` (or duration / reduce) changes; reading value
    // inside the effect captures the latest snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, reduce]);

  return value;
}

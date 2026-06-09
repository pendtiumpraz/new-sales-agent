"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * AnimatedHeroBg — three softly translating radial blobs (coral + teal) that
 * tint the pipeline hero card without overwhelming the number on top.
 *
 * Pointer-events: none, absolute fill, kept under content via z-index. When
 * the user prefers reduced motion the blobs render statically.
 */
export function AnimatedHeroBg() {
  const reduce = useReducedMotion();

  // Two coral blobs + one teal blob — low opacity so the hero number stays
  // sharp and readable on top.
  const blobs = [
    {
      // top-left coral
      className:
        "left-[-15%] top-[-25%] h-[320px] w-[320px] bg-[radial-gradient(circle_at_center,rgba(251,94,59,0.35),transparent_70%)]",
      animate: reduce
        ? undefined
        : { x: [0, 30, -10, 0], y: [0, 18, -8, 0], opacity: [0.55, 0.85, 0.6, 0.55] },
      duration: 11,
    },
    {
      // bottom-right teal
      className:
        "right-[-20%] bottom-[-30%] h-[360px] w-[360px] bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.32),transparent_70%)]",
      animate: reduce
        ? undefined
        : { x: [0, -25, 12, 0], y: [0, -16, 10, 0], opacity: [0.5, 0.8, 0.55, 0.5] },
      duration: 13,
    },
    {
      // mid coral accent
      className:
        "left-[35%] top-[20%] h-[220px] w-[220px] bg-[radial-gradient(circle_at_center,rgba(246,132,92,0.28),transparent_70%)]",
      animate: reduce
        ? undefined
        : { x: [0, 18, -14, 0], y: [0, -12, 14, 0], opacity: [0.4, 0.7, 0.45, 0.4] },
      duration: 9,
    },
  ];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-2xl ${b.className}`}
          animate={b.animate}
          transition={
            reduce
              ? undefined
              : {
                  duration: b.duration,
                  repeat: Infinity,
                  ease: "easeInOut",
                  repeatType: "mirror",
                }
          }
        />
      ))}
    </div>
  );
}

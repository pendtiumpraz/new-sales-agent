"use client";

// Plays one AI reply as paced, human-feeling chat bubbles (WhatsApp style):
// reveal bubble-by-bubble with a "typing" pip between them. Uses humanize() for
// the split + delays. Reduced-motion → show everything at once.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { humanize } from "@/lib/ai/humanizer";
import { cn } from "@/lib/utils";

export function HumanizedMessage({
  text,
  reduce = false,
  filler = false,
  className,
}: {
  text: string;
  reduce?: boolean;
  /** Allow a sparse leading "hmm" filler bubble. */
  filler?: boolean;
  className?: string;
}) {
  const bubbles = useMemo(() => humanize(text, { filler }), [text, filler]);
  const [shown, setShown] = useState(reduce ? bubbles.length : 0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (reduce) {
      setShown(bubbles.length);
      return;
    }
    setShown(0);
    let acc = 0;
    bubbles.forEach((b, i) => {
      acc += b.delayMs;
      const t = window.setTimeout(
        () => setShown((s) => Math.max(s, i + 1)),
        acc,
      );
      timers.current.push(t);
    });
    const handles = timers.current;
    return () => {
      handles.forEach((h) => clearTimeout(h));
      timers.current = [];
    };
  }, [bubbles, reduce]);

  const pending = shown < bubbles.length;

  return (
    <div className={cn("space-y-1.5", className)}>
      {bubbles.slice(0, shown).map((b, i) => (
        <motion.div
          key={i}
          initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduce
              ? { duration: 0.12 }
              : { type: "spring", stiffness: 260, damping: 22 }
          }
          className={cn(
            "w-fit max-w-full whitespace-pre-line rounded-lg px-3 py-2 text-sm leading-relaxed",
            b.kind === "filler"
              ? "bg-muted/70 italic text-muted-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {b.text}
        </motion.div>
      ))}

      {pending && !reduce && <TypingPip />}
    </div>
  );
}

/** Small 3-dot "typing next bubble" pip shown between reveals. */
function TypingPip() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-lg bg-muted px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
          initial={{ opacity: 0.25 }}
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -1.5, 0] }}
          transition={{
            duration: 1.05,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

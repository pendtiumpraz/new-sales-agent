"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";

/**
 * Small destructive button used outside the hero banner (e.g. inline in the
 * header when the run is active). The hero itself uses its own integrated
 * stop button. This is reusable for any "stop now" call site.
 *
 * Slides in from the right with AnimatePresence whenever a run starts, and
 * slides back out on stop. Reduced-motion users get an instant fade.
 */
export function KillSwitch({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const stop = useAutopilotStore((s) => s.stopRun);
  const status = useAutopilotStore((s) => s.currentRun?.status);
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {status === "running" && (
        <motion.div
          key="kill"
          initial={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 22 }}
        >
          <Button
            type="button"
            variant="destructive"
            size={size}
            className={className}
            onClick={() => {
              stop();
              toast("Autopilot dihentikan", {
                description: "Tidak ada pesan tambahan yang akan dikirim.",
              });
            }}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Hentikan Autopilot
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

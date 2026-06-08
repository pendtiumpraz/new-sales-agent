"use client";

import { Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";

/**
 * Small destructive button used outside the hero banner (e.g. inline in the
 * header when the run is active). The hero itself uses its own integrated
 * stop button. This is reusable for any "stop now" call site.
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
  if (status !== "running") return null;

  return (
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
  );
}

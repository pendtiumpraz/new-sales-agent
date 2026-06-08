"use client";

import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StepCard } from "@/components/autopilot/step-card";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";

/**
 * Vertical activity feed for the live run. Auto-scrolls to the latest event
 * each time `currentRun.events.length` changes so the operator always sees
 * the most recent AI action.
 */
export function ActivityTimeline() {
  const run = useAutopilotStore((s) => s.currentRun);
  const events = run?.events ?? [];
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    // Scroll the inner radix viewport, fall back to the wrapper.
    const viewport =
      el.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]") ??
      el;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Aktivitas langsung
        </CardTitle>
        {run && (
          <Badge variant={run.status === "running" ? "default" : "secondary"}>
            {run.status === "running"
              ? "Berjalan"
              : run.status === "done"
                ? "Selesai"
                : run.status === "stopped"
                  ? "Dihentikan"
                  : run.status === "failed"
                    ? "Gagal"
                    : "Siaga"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {events.length === 0 ? (
          <div className="flex h-[440px] flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Activity className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-foreground">
              Belum ada aktivitas
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Klik &ldquo;Mulai Autopilot&rdquo; untuk memulai. AI akan
              memperbarui timeline ini secara langsung.
            </p>
          </div>
        ) : (
          <div ref={viewportRef} className="h-[520px]">
            <ScrollArea className="h-full">
              <ol className="space-y-0 px-4 py-4">
                {events.map((event, i) => (
                  <StepCard
                    key={event.id}
                    event={event}
                    isFirst={i === 0}
                    isLast={i === events.length - 1}
                  />
                ))}
              </ol>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

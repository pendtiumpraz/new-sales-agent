"use client";

import {
  Bot,
  Calendar,
  Network,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import type { AutopilotRun } from "@/lib/types/autopilot";
import { cn } from "@/lib/utils";

type MetricKey = keyof AutopilotRun["metrics"];
type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

const TILES: {
  key: MetricKey;
  label: string;
  icon: IconCmp;
  accent: string;
}[] = [
  { key: "prospectsEngaged", label: "Prospek terlibat", icon: Users, accent: "#FB5E3B" },
  { key: "liSent", label: "Permintaan LinkedIn", icon: Network, accent: "#0A66C2" },
  { key: "liAccepted", label: "Koneksi diterima", icon: Sparkles, accent: "#14B8A6" },
  { key: "repliesReceived", label: "Balasan masuk", icon: MessageSquare, accent: "#F59E0B" },
  { key: "meetingsBooked", label: "Meeting dijadwalkan", icon: Calendar, accent: "#10B981" },
  { key: "cosDeployed", label: "Chief of Staff aktif", icon: Bot, accent: "#8B5CF6" },
];

/**
 * Six-tile KPI grid for the active run. Renders only when a run exists.
 * Uses an inline StatTile style (intentionally not importing private helpers
 * from app/(app)/dashboard).
 */
export function RunSummary() {
  const run = useAutopilotStore((s) => s.currentRun);
  if (!run) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map((t) => (
            <KpiTile
              key={t.key}
              icon={<t.icon className="h-4 w-4" />}
              label={t.label}
              value={run.metrics[t.key]}
              accent={t.accent}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-card/60 p-3 transition-colors hover:bg-card",
      )}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        {icon}
      </span>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="tnum text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

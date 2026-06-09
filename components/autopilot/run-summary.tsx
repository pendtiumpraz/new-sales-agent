"use client";

import {
  Bot,
  Calendar,
  Network,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { ComponentType, SVGProps } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { useCountUp } from "@/components/dashboard/use-count-up";
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
 *
 * Each tile slides up with a 60ms stagger and animates its number from
 * 0 → target with `useCountUp` (600ms ease-out). Both behaviors respect
 * `prefers-reduced-motion` via the underlying primitives.
 */
export function RunSummary() {
  const run = useAutopilotStore((s) => s.currentRun);
  const reduce = useReducedMotion();
  if (!run) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map((t, i) => (
            <motion.div
              key={t.key}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                ease: "easeOut",
                delay: reduce ? 0 : i * 0.06,
              }}
            >
              <KpiTile
                icon={<t.icon className="h-4 w-4" />}
                label={t.label}
                value={run.metrics[t.key]}
                accent={t.accent}
              />
            </motion.div>
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
  const animated = useCountUp(value, 600);
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
      <p className="tnum text-2xl font-semibold tracking-tight">
        {Math.round(animated)}
      </p>
    </div>
  );
}

"use client";

// Compact closing-readiness dot for an inbox LIST row. Same engine as ReadinessBadge
// (detectSignals → pickStage → scoreReadiness) but fetches ONLY this conversation's
// messages (not the full conversation join) so a list of rows stays light. Honest:
// real signal, no fabricated number; renders nothing until messages load.

import { useQuery } from "@tanstack/react-query";

import { detectSignals, pickStage } from "@/lib/sales/stage-machine";
import { scoreReadiness, type ReadinessBand } from "@/lib/sales/predictive";
import { cn } from "@/lib/utils";

const DOT: Record<ReadinessBand, string> = {
  dingin: "bg-slate-300",
  hangat: "bg-amber-400",
  panas: "bg-rose-500",
};
const LABEL: Record<ReadinessBand, string> = { dingin: "Dingin", hangat: "Hangat", panas: "Panas" };

export function ReadinessDot({ conversationId, className }: { conversationId: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["readiness-dot", conversationId],
    queryFn: async () => {
      const r = await fetch(`/api/db/messages?conversationId=${encodeURIComponent(conversationId)}`);
      if (!r.ok) return [] as { direction: string; body: string }[];
      return ((await r.json()).data ?? []) as { direction: string; body: string }[];
    },
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  const turns = data.map((m) => ({
    role: m.direction === "in" ? ("customer" as const) : ("us" as const),
    text: m.body,
  }));
  const lastInbound = [...turns].reverse().find((t) => t.role === "customer")?.text ?? "";
  const signals = detectSignals(turns, lastInbound);
  const stage = pickStage(turns, signals);
  const customerTurns = turns.filter((t) => t.role === "customer").length;
  const r = scoreReadiness(stage, signals, customerTurns);

  return (
    <span
      title={`Closing-readiness: ${r.score}% · ${LABEL[r.band]}`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT[r.band], className)}
    />
  );
}

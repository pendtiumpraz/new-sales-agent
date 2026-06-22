"use client";

// Closing-readiness badge for a conversation. Runs the SAME engine the WA
// orchestrator uses (detectSignals → pickStage → scoreReadiness) on the thread's
// real messages — honest (no fabricated number), and works for any conversation
// that has messages. Shares the cached useConversation query (no extra fetch).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

import { useConversation } from "@/lib/api-mock/hooks";
import { detectSignals, pickStage } from "@/lib/sales/stage-machine";
import { scoreReadiness, type ReadinessBand } from "@/lib/sales/predictive";
import type { Calibration } from "@/lib/sales/calibration";
import { cn } from "@/lib/utils";

const BAND: Record<ReadinessBand, { cls: string; label: string }> = {
  dingin: { cls: "bg-slate-100 text-slate-600", label: "Dingin" },
  hangat: { cls: "bg-amber-100 text-amber-700", label: "Hangat" },
  panas: { cls: "bg-rose-100 text-rose-700", label: "Panas" },
};

export function ReadinessBadge({
  conversationId,
  className,
}: {
  conversationId: string;
  className?: string;
}) {
  const { data } = useConversation(conversationId);

  const r = useMemo(() => {
    const msgs = data?.messages ?? [];
    if (msgs.length === 0) return null;
    const turns = msgs.map((m) => ({
      role: m.direction === "in" ? ("customer" as const) : ("us" as const),
      text: m.body,
    }));
    const lastInbound = [...turns].reverse().find((t) => t.role === "customer")?.text ?? "";
    const signals = detectSignals(turns, lastInbound);
    const stage = pickStage(turns, signals);
    const customerTurns = turns.filter((t) => t.role === "customer").length;
    return scoreReadiness(stage, signals, customerTurns);
  }, [data?.messages]);

  // G7: empirical close rate for this band from recorded outcomes (tenant-wide).
  const calQ = useQuery({
    queryKey: ["sales-calibration"],
    queryFn: async () => {
      const res = await fetch("/api/sales/calibration");
      if (!res.ok) return null;
      return (((await res.json()).calibration ?? null) as Calibration | null);
    },
    staleTime: 60_000,
  });

  if (!r) return null;
  const band = BAND[r.band];
  const stat = calQ.data?.byBand.find((b) => b.band === r.band);
  const hist = stat && stat.closeRate != null && stat.n >= 3 ? Math.round(stat.closeRate * 100) : null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        band.cls,
        className,
      )}
      title={
        `Siap closing — next: ${r.nba.suggestion}` +
        (r.factors.length ? "\n• " + r.factors.join("\n• ") : "") +
        (hist != null ? `\nHistoris band ${band.label}: closing ${hist}% (n=${stat!.n})` : "")
      }
    >
      <TrendingUp className="h-3 w-3" />
      {r.score}% · {band.label}
      {hist != null && <span className="opacity-70">· ~{hist}%</span>}
    </span>
  );
}

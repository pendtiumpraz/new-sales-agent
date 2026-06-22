"use client";

// Mark how a conversation ended (G7 training loop). The choice is recorded with
// the readiness score/band at that moment, so the predictive scorer can be
// calibrated against real outcomes (per-band close rate). A thin bar above the
// thread — low friction, one click.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy, XCircle, PauseCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface OutcomeRow {
  outcome: "won" | "lost" | "stalled";
  source: "manual" | "auto";
}

const OPTS: { key: OutcomeRow["outcome"]; label: string; icon: LucideIcon; active: string }[] = [
  { key: "won", label: "Closing", icon: Trophy, active: "border-emerald-300 bg-emerald-100 text-emerald-700" },
  { key: "lost", label: "Gagal", icon: XCircle, active: "border-rose-300 bg-rose-100 text-rose-700" },
  { key: "stalled", label: "Stuck", icon: PauseCircle, active: "border-amber-300 bg-amber-100 text-amber-700" },
];

export function OutcomeMarker({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-outcome", conversationId],
    queryFn: async () => {
      const r = await fetch(`/api/sales/outcome?conversationId=${encodeURIComponent(conversationId)}`);
      if (!r.ok) return null;
      return (await r.json()).outcome as OutcomeRow | null;
    },
  });
  const current = q.data?.outcome;

  const mark = useMutation({
    mutationFn: async (outcome: string) => {
      const r = await fetch("/api/sales/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, outcome }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("Hasil ditandai — bantu kalibrasi prediksi closing");
      qc.invalidateQueries({ queryKey: ["wa-outcome", conversationId] });
      qc.invalidateQueries({ queryKey: ["sales-calibration"] });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
      <span className="text-xs text-muted-foreground">Hasil obrolan:</span>
      <div className="flex gap-1.5">
        {OPTS.map((o) => {
          const Icon = o.icon;
          const active = current === o.key;
          return (
            <button
              key={o.key}
              onClick={() => mark.mutate(o.key)}
              disabled={mark.isPending}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-60",
                active ? o.active : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" /> {o.label}
            </button>
          );
        })}
      </div>
      {current && q.data?.source === "auto" && (
        <span className="ml-auto text-[10px] text-muted-foreground">terdeteksi otomatis — koreksi bila salah</span>
      )}
    </div>
  );
}

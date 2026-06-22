"use client";

// Semi-auto: shows the pending AI reply (bubble-by-bubble) for a rep to approve
// before it's sent. Only renders when a draft exists for this conversation.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WaDraft } from "@/lib/wa/draft-store";

export function WaDraftCard({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["wa-draft", conversationId],
    queryFn: async () => {
      const r = await fetch(`/api/wa/draft?conversationId=${encodeURIComponent(conversationId)}`);
      if (!r.ok) return null;
      return ((await r.json()).draft ?? null) as WaDraft | null;
    },
    refetchInterval: 8000,
  });

  const act = useMutation({
    mutationFn: async (action: "approve" | "discard") => {
      const r = await fetch("/api/wa/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return action;
    },
    onSuccess: (action) => {
      toast.success(action === "approve" ? "Draf disetujui & dikirim" : "Draf dibuang");
      qc.invalidateQueries({ queryKey: ["wa-draft", conversationId] });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  const draft = q.data;
  if (!draft || draft.bubbles.length === 0) return null;

  return (
    <div className="m-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Draf AI menunggu persetujuan
      </p>
      <div className="space-y-1.5">
        {draft.bubbles.map((b, i) => (
          <div key={i} className="w-fit max-w-full whitespace-pre-line rounded-lg bg-muted px-3 py-1.5 text-sm">
            {b.text}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => act.mutate("approve")} disabled={act.isPending}>
          {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Setujui &amp; kirim</>}
        </Button>
        <Button size="sm" variant="outline" onClick={() => act.mutate("discard")} disabled={act.isPending}>
          <X className="h-4 w-4" /> Buang
        </Button>
      </div>
    </div>
  );
}

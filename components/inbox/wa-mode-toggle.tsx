"use client";

// WhatsApp reply mode: Auto-balas (auto-send) vs Semi-auto (draft → rep approve).
// Owner/admin can flip it; the PUT is permission-gated server-side.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2, UserCheck } from "lucide-react";

export function WaModeToggle() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["wa-mode"],
    queryFn: async () => {
      const r = await fetch("/api/wa/mode");
      if (!r.ok) return "auto";
      return ((await r.json()).mode ?? "auto") as string;
    },
  });

  const set = useMutation({
    mutationFn: async (mode: string) => {
      const r = await fetch("/api/wa/mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return mode;
    },
    onSuccess: (mode) => {
      toast.success(mode === "semi" ? "Semi-auto: draf perlu disetujui" : "Auto-balas aktif");
      qc.invalidateQueries({ queryKey: ["wa-mode"] });
    },
    onError: () => toast.error("Hanya owner/admin yang bisa ubah mode"),
  });

  const mode = q.data ?? "auto";
  const semi = mode === "semi";

  return (
    <button
      type="button"
      onClick={() => set.mutate(semi ? "auto" : "semi")}
      disabled={set.isPending}
      title="Mode balas WhatsApp: auto-send vs draf perlu approve"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {set.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : semi ? (
        <UserCheck className="h-3 w-3 text-primary" />
      ) : (
        <Bot className="h-3 w-3" />
      )}
      {semi ? "Semi-auto" : "Auto-balas"}
    </button>
  );
}

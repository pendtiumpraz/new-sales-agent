"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";

// Superadmin WhatsApp mode (doc 41): per_sales (each rep links their own number)
// vs per_platform (one shared number).
export function WaModeToggle() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-mode"],
    queryFn: async () => {
      const r = await fetch("/api/admin/wa-mode");
      if (!r.ok) return { mode: "per_platform" };
      return (await r.json()) as { mode: "per_sales" | "per_platform" };
    },
  });
  const set = useMutation({
    mutationFn: async (mode: string) => {
      const r = await fetch("/api/admin/wa-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      toast.success("Mode WhatsApp diperbarui");
      qc.invalidateQueries({ queryKey: ["wa-mode"] });
    },
    onError: () => toast.error("Gagal mengubah mode"),
  });

  const mode = q.data?.mode ?? "per_platform";
  const opts = [
    { v: "per_sales", label: "Per-sales", desc: "Tiap sales hubungkan nomor WA-nya sendiri (QR)." },
    { v: "per_platform", label: "Per-platform", desc: "Satu nomor WA bersama untuk seluruh tenant." },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 text-emerald-600" /> Mode WhatsApp (global)
      </p>
      <p className="mb-3 text-xs text-muted-foreground">Menentukan bagaimana sales mengirim/terima WA di semua tenant.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <button
            key={o.v}
            onClick={() => set.mutate(o.v)}
            disabled={set.isPending}
            className={
              "rounded-lg border p-3 text-left transition-colors " +
              (mode === o.v ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-accent")
            }
          >
            <p className="text-sm font-medium">
              {o.label}
              {mode === o.v && <span className="ml-2 text-[10px] font-semibold text-primary">AKTIF</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">{o.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

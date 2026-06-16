"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Server } from "lucide-react";

// Superadmin deployment mode (doc 41): saas (cross-tenant marketplace ON) vs
// on_prem (single-tenant, marketplace OFF).
export function DeploymentModeToggle() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["deployment-mode"],
    queryFn: async () => {
      const r = await fetch("/api/admin/deployment-mode");
      if (!r.ok) return { mode: "saas" };
      return (await r.json()) as { mode: "saas" | "on_prem" };
    },
  });
  const set = useMutation({
    mutationFn: async (mode: string) => {
      const r = await fetch("/api/admin/deployment-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      toast.success("Mode deploy diperbarui");
      qc.invalidateQueries({ queryKey: ["deployment-mode"] });
    },
    onError: () => toast.error("Gagal mengubah mode"),
  });

  const mode = q.data?.mode ?? "saas";
  const opts = [
    { v: "saas", label: "SaaS", desc: "Multi-tenant + Marketplace kontak antar-tenant aktif." },
    { v: "on_prem", label: "On-prem", desc: "Single-tenant. Marketplace dinonaktifkan." },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Server className="h-4 w-4 text-primary" /> Mode Deploy (global)
      </p>
      <p className="mb-3 text-xs text-muted-foreground">Menentukan apakah Marketplace kontak antar-tenant tersedia.</p>
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

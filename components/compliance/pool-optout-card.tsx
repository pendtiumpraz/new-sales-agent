"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Cross-pool opt-out / DSAR erasure (doc 41 §7) — a do-not-contact entry that
// every tenant honors: flags matching contacts everywhere + delists their
// marketplace listings + blocks future re-listing.
export function PoolOptOutCard() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<"opt_out" | "dsar_erasure">("opt_out");

  const countQ = useQuery({
    queryKey: ["pool-optout-count"],
    queryFn: async () => {
      const r = await fetch("/api/compliance/pool-optout");
      if (!r.ok) return { count: 0 };
      return (await r.json()) as { count: number };
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/compliance/pool-optout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, reason }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return (await r.json()) as { flaggedContacts: number; delistedListings: number };
    },
    onSuccess: (d) => {
      toast.success(`Opt-out tercatat — ${d.flaggedContacts} kontak ditandai, ${d.delistedListings} listing ditarik`);
      setValue("");
      qc.invalidateQueries({ queryKey: ["pool-optout-count"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ban className="h-4 w-4 text-destructive" /> Opt-out lintas pool (marketplace)
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">{countQ.data?.count ?? 0} terdaftar</span>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Email/HP yang opt-out atau minta penghapusan (DSAR) — dihormati <b>semua tenant</b>: kontak ditandai opted-out,
          listing marketplace-nya ditarik, dan tak bisa di-listing ulang.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <Label className="text-xs">Email / nomor HP</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="orang@email.com atau 62812…" />
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Alasan</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as "opt_out" | "dsar_erasure")}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="opt_out">Opt-out</option>
              <option value="dsar_erasure">DSAR (penghapusan)</option>
            </select>
          </div>
          <Button onClick={() => submit.mutate()} disabled={!value.trim() || submit.isPending}>
            {submit.isPending ? "Memproses…" : "Catat & sebarkan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

type Stats = Record<string, number>;

// Surfaces email-validation quality of the contact list (real data from the
// MX-check validator) + a one-click "validate the rest" action. Auto-hides when
// there are no DB contacts.
export function ContactQualityBar() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data } = useQuery({
    queryKey: ["contact-quality"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/contacts/validate");
      if (!r.ok) return null;
      return ((await r.json()).stats ?? null) as Stats | null;
    },
  });

  const validateRest = useMutation({
    mutationFn: async () => {
      let guard = 0;
      while (guard++ < 80) {
        const r = await fetch("/api/tenant/contacts/validate", { method: "POST" });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
        if ((j.summary?.remaining ?? 0) === 0 || (j.summary?.checked ?? 0) === 0) break;
      }
    },
    onSuccess: () => {
      toast.success("Validasi email selesai");
      qc.invalidateQueries({ queryKey: ["contact-quality"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e) => toast.error(`Gagal validasi (${e instanceof Error ? e.message : e})`),
    onSettled: () => setRunning(false),
  });

  if (!data) return null;
  const valid = data.valid ?? 0;
  const invalid = (data.invalid_domain ?? 0) + (data.invalid_syntax ?? 0);
  const risky = data.risky ?? 0;
  const unchecked = data.unchecked ?? 0;
  const total = valid + invalid + risky + unchecked;
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm">
      <span className="font-medium">Kualitas email</span>
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> {valid.toLocaleString("id-ID")} valid
      </span>
      {invalid > 0 && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <AlertTriangle className="h-4 w-4" /> {invalid.toLocaleString("id-ID")} invalid
        </span>
      )}
      {risky > 0 && <span className="text-amber-600">{risky.toLocaleString("id-ID")} berisiko</span>}
      {unchecked > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ShieldQuestion className="h-4 w-4" /> {unchecked.toLocaleString("id-ID")} belum dicek
        </span>
      )}
      {unchecked > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={running}
          onClick={() => {
            setRunning(true);
            validateRest.mutate();
          }}
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memvalidasi…
            </>
          ) : (
            "Validasi sisanya"
          )}
        </Button>
      )}
    </div>
  );
}

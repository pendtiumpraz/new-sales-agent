"use client";

import QRCode from "react-qr-code";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WaSession {
  mode: "per_sales" | "per_platform";
  status: string; // idle | pending | qr | connected | disconnected
  qr: string | null;
  waNumber: string | null;
}

// Connect a WhatsApp number by QR (doc 41). The QR is relayed from the VPS
// gateway via the server; we poll until linked. Works on Vercel — no domain.
export function WaConnectCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-session"],
    queryFn: async () => {
      const r = await fetch("/api/wa/session");
      if (!r.ok) return null;
      return (await r.json()) as WaSession;
    },
    // poll fast while waiting for QR / linking, slow once settled
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "pending" || s === "qr" ? 2500 : 15000;
    },
  });
  const s = q.data;

  const connect = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wa/session", { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-session"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghubungkan"),
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wa/session", { method: "DELETE" });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      toast.success("WhatsApp diputus");
      qc.invalidateQueries({ queryKey: ["wa-session"] });
    },
  });

  const connected = s?.status === "connected";
  const waiting = s?.status === "pending";
  const hasQr = s?.status === "qr" && s.qr;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            mode: {s?.mode === "per_sales" ? "per-sales" : "per-platform"}
          </span>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Hubungkan nomor WhatsApp — scan QR sekali dari HP. Pesan masuk dibalas AI & terpantau per sales.
        </p>
      </CardHeader>
      <CardContent className="p-4">
        {connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Terhubung{s?.waNumber ? ` — ${s.waNumber}` : ""}.
            </p>
            <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              Putuskan
            </Button>
          </div>
        ) : hasQr ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="rounded-lg border bg-white p-3">
              <QRCode value={s!.qr!} size={168} />
            </div>
            <ol className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2 font-medium">
                <Smartphone className="h-4 w-4 text-primary" /> Scan dari WhatsApp HP-mu:
              </li>
              <li className="text-muted-foreground">1. Buka WhatsApp → <b>Perangkat Tertaut</b></li>
              <li className="text-muted-foreground">2. <b>Tautkan Perangkat</b> → arahkan ke QR ini</li>
              <li className="text-[11px] text-muted-foreground">QR berganti tiap ~20 dtk — biarkan halaman terbuka.</li>
            </ol>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {waiting ? "Menyiapkan sesi… menunggu QR dari gateway." : "Belum terhubung."}
            </p>
            <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending || waiting}>
              {waiting ? "Menyiapkan…" : "Hubungkan WhatsApp"}
            </Button>
          </div>
        )}
        {!connected && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Butuh gateway WA (Baileys/openclaw di VPS, outbound-only) yang nge-poll <code>/api/wa/gateway/outbox</code>.
            Set <code>WA_GATEWAY_TOKEN</code> di env.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

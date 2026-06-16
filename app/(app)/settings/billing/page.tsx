"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, ExternalLink, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IDRAmount } from "@/components/shared/idr-amount";

interface PlanRow {
  key: string;
  name: string;
  priceMonthIdr: number;
}

interface Billing {
  plan: { name: string; priceMonthIdr: number; quotas: Record<string, number> } | null;
  currentPlanKey: string | null;
  seats: number | null;
  status: string | null;
  usage: {
    aiTokens: number;
    aiTokensQuota: number | null;
    emails: number;
    emailsQuota: number | null;
    members: number;
    seatsQuota: number | null;
  };
  billing?: {
    stripeConfigured: boolean;
    hasStripeSubscription: boolean;
    purchasablePlanKeys: string[];
    plans: PlanRow[];
  };
}

function Meter({ label, used, quota }: { label: string; used: number; quota: number | null }) {
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString("id-ID")}
          {quota ? ` / ${quota.toLocaleString("id-ID")}` : ""}
        </span>
      </div>
      {quota ? (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export default function BillingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/billing");
      if (!r.ok) throw new Error();
      return (await r.json()) as Billing;
    },
  });

  return (
    <div>
      <PageHeader title="Tagihan & Kuota" description="Paket aktif dan pemakaian terhadap kuota (doc 27)." />
      <div className="max-w-4xl space-y-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <>
            <Card className="overflow-hidden border-primary/25">
              <div className="flex items-start justify-between bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground">
                <div>
                  <Badge className="bg-white/15 text-primary-foreground">{data?.status ?? "—"}</Badge>
                  <h3 className="mt-2 text-xl font-semibold">Paket {data?.plan?.name ?? "—"}</h3>
                  <p className="text-xs text-primary-foreground/90">{data?.seats ?? "—"} kursi</p>
                </div>
                <div className="text-right">
                  <IDRAmount value={data?.plan?.priceMonthIdr ?? 0} className="text-2xl font-bold tnum" />
                  <p className="text-[10px] uppercase tracking-wide text-primary-foreground/80">/ kursi / bln</p>
                </div>
              </div>
              <CardContent className="space-y-4 p-5">
                <Meter label="Token AI" used={data?.usage.aiTokens ?? 0} quota={data?.usage.aiTokensQuota ?? null} />
                <Meter label="Email terkirim" used={data?.usage.emails ?? 0} quota={data?.usage.emailsQuota ?? null} />
                <Meter label="Anggota / kursi" used={data?.usage.members ?? 0} quota={data?.usage.seatsQuota ?? null} />
              </CardContent>
            </Card>
            <BillingActions data={data} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Stripe actions (doc 30) ────────────────────────────────────────────────
// Inert-but-wired: when Stripe isn't configured we show a setup hint instead of
// buttons, so the page never breaks. With keys, upgrade → hosted Checkout and
// "Kelola langganan" → billing portal.
function BillingActions({ data }: { data?: Billing }) {
  const [pending, setPending] = useState<string | null>(null);
  const b = data?.billing;

  async function go(endpoint: string, body?: unknown, key = endpoint) {
    setPending(key);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json();
      if (!r.ok || !j.ok || !j.url) throw new Error(j?.error ?? "gagal");
      window.location.href = j.url as string; // redirect to Stripe
    } catch (e) {
      toast.error(`Gagal (${e instanceof Error ? e.message : e})`);
      setPending(null);
    }
  }

  if (!b?.stripeConfigured) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4" /> Integrasi pembayaran (Stripe)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
          Scaffold Stripe sudah terpasang tapi belum aktif. Isi <code>STRIPE_SECRET_KEY</code>,{" "}
          <code>STRIPE_WEBHOOK_SECRET</code>, dan <code>STRIPE_PRICE_*</code> di <code>.env.local</code>{" "}
          (lihat <code>docs/30-stripe-billing.md</code>) lalu reload — tombol upgrade & kelola langganan muncul otomatis.
        </CardContent>
      </Card>
    );
  }

  const upgradable = (b.plans ?? []).filter(
    (p) => b.purchasablePlanKeys.includes(p.key) && p.key !== data?.currentPlanKey,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CreditCard className="h-4 w-4" /> Kelola langganan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {upgradable.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {upgradable.map((p) => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                disabled={pending !== null}
                onClick={() => go("/api/billing/checkout", { planKey: p.key }, p.key)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {pending === p.key ? "Mengalihkan…" : `Pilih ${p.name}`}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Tidak ada paket lain untuk di-upgrade.</p>
        )}

        {b.hasStripeSubscription && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending !== null}
            onClick={() => go("/api/billing/portal")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {pending === "/api/billing/portal" ? "Membuka…" : "Buka portal billing"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

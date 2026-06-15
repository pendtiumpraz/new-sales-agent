"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IDRAmount } from "@/components/shared/idr-amount";

interface Billing {
  plan: { name: string; priceMonthIdr: number; quotas: Record<string, number> } | null;
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
      <div className="max-w-2xl space-y-4 p-6">
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
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Integrasi billing</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
                Quota di-enforce via metering (token AI) & send worker. Integrasi pembayaran (Stripe) + invoice = slice berikutnya.
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

// Billing & Kuota — Module 8 FRONTEND (Settings cluster · Sainskerta Loop Phase
// 04). Composes the NEW M8 facade with the existing billing infra (no mock data):
//
//   - GET /api/settings/billing  → { ok, data: BillingSummary } — the facade-level
//     AI-CREDIT BALANCE (planTokens + granted − consumed) + Stripe wiring flags
//     (configured · purchasablePlanKeys · enforced). This is the headline the M8
//     facade is built to surface; it delegates to lib/billing/* (credit + stripe).
//   - GET /api/tenant/billing    → plan + seats + status + usage-vs-quota + the
//     plan catalog. REUSE of the existing infra route for the plan/usage view the
//     facade deliberately doesn't re-expose (its doc: "the full plan/usage/quota
//     view lives on /api/tenant/billing"). Legacy envelope (flat JSON, no { data }).
//
// CTAs reuse lib/billing/Stripe via the existing handlers:
//   - POST /api/billing/checkout { planKey } → hosted Checkout url (upgrade)
//   - POST /api/billing/portal               → billing-portal url (manage/cancel)
// Both are inert-but-safe until Stripe keys are set — we show a setup hint instead.
//
// Matches the established design system (Coral Sunset, the (app) shell, PageHeader +
// cards + shared Error/Empty states) and renders inside the shared Settings sub-nav
// (app/(app)/settings/layout.tsx). Every band has loading + empty + error states.
// Upgrade/portal CTAs are gated to tenant.billing.

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CreditCard,
  ExternalLink,
  Gauge,
  Info,
  Mail,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { can, mapDemoRole, type Role } from "@/lib/rbac/permissions";

// ── NEW M8 envelope ({ ok, data }) ──────────────────────────────────────────
interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

/** GET /api/settings/billing · data (modules/settings · BillingSummary). */
interface BillingSummary {
  credit: {
    planTokens: number;
    granted: number;
    consumed: number;
    balance: number;
    enforced: boolean;
  };
  stripe: { configured: boolean; purchasablePlanKeys: string[] };
}

interface PlanRow {
  key: string;
  name: string;
  priceMonthIdr: number;
}

/** GET /api/tenant/billing · flat JSON (existing infra · doc 27). `source` is
 *  "db" | "mock" | "error" — the route degrades to a stub when there's no ctx/db. */
interface TenantBilling {
  source: "db" | "mock" | "error";
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
  } | null;
  billing?: {
    stripeConfigured: boolean;
    hasStripeSubscription: boolean;
    purchasablePlanKeys: string[];
    plans: PlanRow[];
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read the NEW M8 envelope. 403 → "forbidden" sentinel for the access state. */
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

/** Read the existing-infra route (flat JSON, no { ok, data } envelope). */
async function readTenantBilling(r: Response): Promise<TenantBilling> {
  if (!r.ok) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error("Permintaan gagal");
  }
  return (await r.json()) as TenantBilling;
}

function fmtInt(n: number): string {
  return Number(n).toLocaleString("id-ID");
}

/** Compact token count for tight chips (e.g. 1.2 jt). */
function shortTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} rb`;
  return fmtInt(n);
}

// ── page ─────────────────────────────────────────────────────────────────────

type BillingTab = "kredit" | "paket" | "pemakaian" | "beli" | "langganan";

export default function BillingSettingsPage() {
  const { data: session } = useSession();
  // Session role may be the canonical RBAC role (real auth) or a demo display role;
  // map either onto a canonical Role before gating.
  const role: Role = useMemo(() => {
    const raw = session?.user?.role;
    if (!raw) return "member";
    if ((["superadmin", "tenant_owner", "tenant_admin", "member"] as const).includes(raw as Role)) {
      return raw as Role;
    }
    return mapDemoRole(raw);
  }, [session?.user?.role]);
  const canManage = can(role, "tenant.billing");

  // Only the active panel renders (stacked panels → tab bar).
  const [tab, setTab] = useState<BillingTab>("kredit");

  // NEW facade — the credit balance + Stripe flags (the headline of this page).
  const summaryQ = useQuery({
    queryKey: ["settings", "billing", "summary"],
    queryFn: async () => readJson<BillingSummary>(await fetch("/api/settings/billing")),
    retry: false,
  });
  // Existing infra — plan + usage-vs-quota + plan catalog (composed alongside).
  const tenantQ = useQuery({
    queryKey: ["settings", "billing", "tenant"],
    queryFn: async () => readTenantBilling(await fetch("/api/tenant/billing")),
    retry: false,
  });

  const summary = summaryQ.data;
  const tenant = tenantQ.data;
  const credit = summary?.credit ?? null;
  const forbidden =
    summaryQ.error instanceof Error && summaryQ.error.message === "forbidden";

  // The facade GET (/api/settings/billing) is the source of truth for this page —
  // it's the route the task wires to. If it fails, the whole page is an error.
  if (summaryQ.isError) {
    return (
      <div>
        <BillingHeader credit={null} loading={false} />
        <div className="p-6">
          <ErrorState
            title={forbidden ? "Tidak punya akses" : "Gagal memuat billing"}
            description={
              forbidden
                ? "Akun kamu tidak punya izin billing (tenant.billing). Hubungi Owner/Admin tenant."
                : "Tidak bisa mengambil ringkasan billing. Pastikan kamu login & database tersedia."
            }
            onRetry={() => summaryQ.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <BillingHeader credit={credit} loading={summaryQ.isLoading} />

      <div className="space-y-5 p-6">
        {/* ============ TABS ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "kredit"} onClick={() => setTab("kredit")}>
            <Wallet className="h-4 w-4" />
            Kredit AI
          </TabButton>
          <TabButton active={tab === "paket"} onClick={() => setTab("paket")}>
            <CreditCard className="h-4 w-4" />
            Paket
          </TabButton>
          <TabButton active={tab === "pemakaian"} onClick={() => setTab("pemakaian")}>
            <Gauge className="h-4 w-4" />
            Pemakaian
          </TabButton>
          <TabButton active={tab === "beli"} onClick={() => setTab("beli")}>
            <Sparkles className="h-4 w-4" />
            Beli Kuota
          </TabButton>
          <TabButton active={tab === "langganan"} onClick={() => setTab("langganan")}>
            <ExternalLink className="h-4 w-4" />
            Langganan
          </TabButton>
        </div>

        {/* ============ CREDIT BALANCE (from the NEW facade) ============ */}
        {tab === "kredit" && <CreditCardPanel credit={credit} loading={summaryQ.isLoading} />}

        {/* ============ CURRENT PLAN (existing infra) ============ */}
        {tab === "paket" && (
          <PlanPanel
            tenant={tenant}
            loading={tenantQ.isLoading}
            error={tenantQ.isError}
            onRetry={() => tenantQ.refetch()}
          />
        )}

        {/* ============ USAGE vs QUOTA (existing infra) ============ */}
        {tab === "pemakaian" && (
          <UsagePanel
            tenant={tenant}
            loading={tenantQ.isLoading}
            error={tenantQ.isError}
            onRetry={() => tenantQ.refetch()}
          />
        )}

        {/* ============ BUY QUOTA PACKS (top-up, 30-day) ============ */}
        {tab === "beli" && <QuotaPacksPanel canManage={canManage} />}

        {/* ============ STRIPE CTA (reuse lib/billing) ============ */}
        {tab === "langganan" && (
          <StripePanel
            summary={summary}
            tenant={tenant}
            canManage={canManage}
            loading={summaryQ.isLoading}
          />
        )}

        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Grain: <b>billing = per-tenant</b>. Saldo kredit ={" "}
          <b>kuota paket + top-up superadmin − pemakaian</b> token AI. Enforcement{" "}
          {credit?.enforced ? (
            <span className="font-medium text-warning">aktif</span>
          ) : (
            "non-aktif"
          )}{" "}
          — saat aktif, panggilan AI berhenti ketika saldo habis. Upgrade & portal memakai
          Stripe (lib/billing); pembayaran disinkronkan via webhook.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

/** Tab in the billing sub-nav bar (mirrors the reports page tab pattern). */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BillingHeader({
  credit,
  loading,
}: {
  credit: BillingSummary["credit"] | null;
  loading: boolean;
}) {
  const low = credit != null && credit.balance <= 0;
  return (
    <PageHeader
      title="Billing & Kuota"
      description="Paket aktif, saldo kredit AI, & pemakaian terhadap kuota — plus upgrade & portal langganan."
    >
      {loading ? (
        <Skeleton className="h-9 w-40 rounded-lg" />
      ) : credit ? (
        <span
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs",
            low
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full",
              low ? "bg-destructive/15 text-destructive" : "bg-tertiary/15 text-tertiary",
            )}
          >
            <Wallet className="h-3 w-3" />
          </span>
          Saldo:{" "}
          <span className={cn("font-medium", low ? "text-destructive" : "text-foreground/80")}>
            {shortTokens(credit.balance)} token
          </span>
        </span>
      ) : null}
    </PageHeader>
  );
}

/** Headline panel — the AI-credit balance straight from /api/settings/billing. */
function CreditCardPanel({
  credit,
  loading,
}: {
  credit: BillingSummary["credit"] | null;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (!credit) return null;

  const low = credit.balance <= 0;
  const allowance = credit.planTokens + credit.granted;
  const pctUsed = allowance > 0 ? Math.min(100, Math.round((credit.consumed / allowance) * 100)) : 0;

  return (
    <Card className="overflow-hidden border-primary/25 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground">
        <div className="min-w-0">
          <Badge className="bg-white/15 text-primary-foreground">
            {credit.enforced ? "Enforcement aktif" : "Saldo kredit AI"}
          </Badge>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{fmtInt(credit.balance)}</span>
            <span className="text-sm font-medium text-primary-foreground/85">token tersisa</span>
          </p>
          <p className="mt-0.5 text-xs text-primary-foreground/85">
            {fmtInt(credit.consumed)} terpakai dari {fmtInt(allowance)} tersedia
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Wallet className="h-5 w-5" />
        </span>
      </div>

      <CardContent className="space-y-4 p-5">
        {/* breakdown: planTokens + granted − consumed = balance */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Kuota paket" value={credit.planTokens} />
          <Stat label="Top-up kredit" value={credit.granted} accent="text-tertiary" />
          <Stat label="Terpakai" value={credit.consumed} accent="text-muted-foreground" />
          <Stat
            label="Saldo"
            value={credit.balance}
            accent={low ? "text-destructive" : "text-success"}
          />
        </div>

        {/* consumed bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Pemakaian dari total tersedia</span>
            <span className="tabular-nums">{pctUsed}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", pctUsed >= 90 ? "bg-destructive" : "bg-primary")}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
        </div>

        {low && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Saldo kredit AI habis.{" "}
              {credit.enforced
                ? "Panggilan AI baru akan ditolak sampai superadmin menambah kredit."
                : "Enforcement non-aktif, jadi panggilan AI masih jalan — minta superadmin top-up agar tetap aman."}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", accent)} title={fmtInt(value)}>
        {shortTokens(value)}
      </p>
    </div>
  );
}

/** Current plan — from the existing /api/tenant/billing composition. */
function PlanPanel({
  tenant,
  loading,
  error,
  onRetry,
}: {
  tenant?: TenantBilling;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="overflow-hidden shadow-soft">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
            <CreditCard className="h-4 w-4" />
          </span>
          Paket aktif
        </CardTitle>
        {!loading && tenant?.status && (
          <Badge variant="muted" className="capitalize">
            {tenant.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        ) : error ? (
          <ErrorState
            className="border-0 py-6"
            title="Gagal memuat paket"
            description="Tidak bisa mengambil detail paket aktif."
            onRetry={onRetry}
          />
        ) : !tenant?.plan ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Belum ada paket/langganan aktif untuk tenant ini. Superadmin mengaktifkan paket dari
              konsol platform, atau pilih paket lewat Stripe di bawah.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">{tenant.plan.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tenant.seats ?? "—"} kursi ·{" "}
                {tenant.currentPlanKey ? (
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    {tenant.currentPlanKey}
                  </code>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div className="text-right">
              <p>
                <IDRAmount value={tenant.plan.priceMonthIdr} className="text-2xl font-bold" />
                <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  / kursi / bln
                </span>
              </p>
              {tenant.seats ? (
                <p className="mt-1 text-sm font-medium text-foreground/80">
                  Total{" "}
                  <IDRAmount
                    value={tenant.plan.priceMonthIdr * tenant.seats}
                    className="font-bold"
                  />
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {" "}
                    / bln · {tenant.seats} kursi
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Usage vs quota — three meters from the existing /api/tenant/billing route. */
function UsagePanel({
  tenant,
  loading,
  error,
  onRetry,
}: {
  tenant?: TenantBilling;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="overflow-hidden shadow-soft">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tertiary/[0.12] text-tertiary">
            <Gauge className="h-4 w-4" />
          </span>
          Pemakaian bulan ini
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {loading ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState
            className="border-0 py-6"
            title="Gagal memuat pemakaian"
            description="Tidak bisa mengambil pemakaian vs kuota."
            onRetry={onRetry}
          />
        ) : !tenant?.usage ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Data pemakaian belum tersedia.
          </p>
        ) : (
          <>
            <Meter
              icon={<Wallet className="h-3.5 w-3.5" />}
              label="Token AI"
              used={tenant.usage.aiTokens}
              quota={tenant.usage.aiTokensQuota}
            />
            <Meter
              icon={<Mail className="h-3.5 w-3.5" />}
              label="Email terkirim"
              used={tenant.usage.emails}
              quota={tenant.usage.emailsQuota}
            />
            <Meter
              icon={<Users className="h-3.5 w-3.5" />}
              label="Anggota / kursi"
              used={tenant.usage.members}
              quota={tenant.usage.seatsQuota}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Meter({
  icon,
  label,
  used,
  quota,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  quota: number | null;
}) {
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-muted-foreground/70">{icon}</span>
          {label}
        </span>
        <span className="tabular-nums">
          {used.toLocaleString("id-ID")}
          {quota ? (
            ` / ${quota.toLocaleString("id-ID")}`
          ) : (
            <span className="ml-1 text-xs text-muted-foreground">· kuota belum diset</span>
          )}
        </span>
      </div>
      {quota ? (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        // No bar to draw when the plan didn't seed a quota — say so instead of
        // silently rendering an empty meter that looks broken.
        <div className="mt-1 h-2 rounded-full border border-dashed border-muted" />
      )}
    </div>
  );
}

/** Buy a top-up quota pack (30-day). Self-serve: instant grant in demo, or via the
 *  configured gateway (Stripe/Xendit/Tripay/Midtrans) once wired. tenant.billing. */
interface QuotaPack {
  key: string;
  metric: string;
  amount: number;
  days: number;
  priceIdr: number;
  label: string;
}
function QuotaPacksPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const packsQ = useQuery({
    queryKey: ["billing", "quota-packs"],
    queryFn: async () => {
      const r = await fetch("/api/billing/quota/packs");
      const j = (await r.json().catch(() => null)) as ApiResult<{ packs: QuotaPack[]; provider: string }> | null;
      if (!r.ok || !j || j.ok === false) throw new Error((j && "error" in j && j.error) || "gagal");
      return j.data;
    },
    retry: false,
  });

  async function buy(packKey: string) {
    setPending(packKey);
    try {
      const r = await fetch("/api/billing/quota/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packKey }),
      });
      const j = (await r.json().catch(() => null)) as
        | ApiResult<{ mode: string; url?: string }>
        | null;
      if (!r.ok || !j || j.ok === false) throw new Error((j && "error" in j && j.error) || "gagal");
      if (j.data.mode === "redirect" && j.data.url) {
        window.location.href = j.data.url; // gateway checkout
        return;
      }
      toast.success("Kuota tambahan aktif (30 hari).");
      qc.invalidateQueries({ queryKey: ["settings", "billing"] });
      qc.invalidateQueries({ queryKey: ["billing", "quota-packs"] });
    } catch (e) {
      toast.error(`Gagal beli: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPending(null);
    }
  }

  const provider = packsQ.data?.provider ?? "none";
  return (
    <Card className="shadow-soft">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tertiary/[0.12] text-tertiary">
            <Sparkles className="h-4 w-4" />
          </span>
          Beli kuota tambahan
          <Badge variant="muted">30 hari</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        {packsQ.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : !packsQ.data?.packs?.length ? (
          <p className="text-sm text-muted-foreground">Belum ada paket tambahan.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Tambahan kuota berlaku <b>30 hari</b>, di atas kuota paket.{" "}
              {provider === "none"
                ? "Mode instan (demo) — langsung aktif tanpa pembayaran."
                : `Pembayaran via ${provider}.`}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {packsQ.data.packs.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.label}</p>
                    <IDRAmount value={p.priceIdr} className="text-xs text-muted-foreground" />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManage || pending !== null}
                    onClick={() => buy(p.key)}
                  >
                    {pending === p.key ? "…" : "Beli"}
                  </Button>
                </div>
              ))}
            </div>
            {!canManage && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Hanya Owner/Admin (izin <code>tenant.billing</code>) yang bisa beli.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Stripe CTA — REUSE of lib/billing via /api/billing/checkout + /api/billing/portal.
 * Inert-but-wired: with no Stripe keys we show a setup hint instead of buttons, so
 * the page never breaks. Upgrade buttons come from the plan catalog ∩ purchasable;
 * the portal button shows only when the tenant already has a Stripe subscription.
 */
function StripePanel({
  summary,
  tenant,
  canManage,
  loading,
}: {
  summary?: BillingSummary;
  tenant?: TenantBilling;
  canManage: boolean;
  loading: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function go(endpoint: string, body?: unknown, key = endpoint) {
    setPending(key);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!r.ok || !j?.ok || !j.url) throw new Error(j?.error ?? "gagal");
      window.location.href = j.url; // redirect to Stripe
    } catch (e) {
      toast.error(`Gagal: ${e instanceof Error ? e.message : e}`);
      setPending(null);
    }
  }

  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  // Prefer the facade's stripe flag; fall back to the infra route's nested flag.
  const configured = summary?.stripe.configured ?? tenant?.billing?.stripeConfigured ?? false;

  if (!configured) {
    return (
      <Card className="border-dashed shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4" /> Integrasi pembayaran (Stripe)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
          Scaffold Stripe sudah terpasang tapi belum aktif. Isi <code>STRIPE_SECRET_KEY</code>,{" "}
          <code>STRIPE_WEBHOOK_SECRET</code>, dan <code>STRIPE_PRICE_*</code> di{" "}
          <code>.env.local</code> (lihat <code>docs/30-stripe-billing.md</code>) lalu reload —
          tombol upgrade & kelola langganan muncul otomatis.
        </CardContent>
      </Card>
    );
  }

  // Read-only viewers see the wiring state but no action buttons.
  if (!canManage) {
    return (
      <Card className="shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4" /> Kelola langganan
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
          Stripe aktif. Hanya Owner/Admin tenant (izin <code>tenant.billing</code>) yang bisa
          upgrade paket atau membuka portal langganan.
        </CardContent>
      </Card>
    );
  }

  const plans = tenant?.billing?.plans ?? [];
  const purchasable =
    summary?.stripe.purchasablePlanKeys ?? tenant?.billing?.purchasablePlanKeys ?? [];
  const upgradable = plans.filter(
    (p) => purchasable.includes(p.key) && p.key !== tenant?.currentPlanKey,
  );
  const hasSubscription = tenant?.billing?.hasStripeSubscription ?? false;

  return (
    <Card className="shadow-soft">
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

        {hasSubscription && (
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

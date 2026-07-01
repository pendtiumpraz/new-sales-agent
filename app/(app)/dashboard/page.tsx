"use client";

// Dashboard — Module 1 (Sainskerta Loop Phase 04). Wired to the REAL rebuild
// backend: GET /api/db/people (RLS-scoped leads), GET /api/entitlements (vertical
// + per-module quota overrides), GET /api/tenant/status (activation/plan). NO mock
// data — every band has its own loading skeleton, empty state, and error+retry.
// Faithful to mockups/dashboard-shell.html: KPI cards + funnel placeholder + tugas
// list + recent-contacts mini-table (B2C/B2B badge). Coral Sunset via CSS tokens.

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ListChecks,
  MessageCircle,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { KpiTile, KpiStrip } from "@/components/shared/kpi-tile";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

// ── Real API shapes ───────────────────────────────────────────────────────

/** Row from GET /api/db/people (subset we render). */
interface PersonRow {
  id: string;
  fullName: string;
  title: string | null;
  companyName: string | null;
  leadType: string | null; // b2c_customer | b2b_partner | unknown
  leadScore: number | null; // 0..1 classifier confidence
  status: string; // active | …
  source: string | null; // discovery channel/source label
  createdAt: string;
  updatedAt: string;
  contacts: { channel: string }[];
}

interface PeopleResponse {
  data: PersonRow[];
  source: "db" | "mock" | "error";
}

/** GET /api/entitlements → onboardingService.resolveEntitlements. */
interface EntitlementsResponse {
  ok: boolean;
  data?: {
    vertical: { name: string } | null;
    enabledModules: string[];
    modules: { moduleKey: string; label: string; enabled: boolean }[];
    quotaOverrides: Record<string, Record<string, number>>;
  };
  error?: string;
}

interface TenantStatusResponse {
  active: boolean;
  status?: string;
  activeUntil?: string | null;
  reason?: string;
}

const WEEK_MS = 7 * 864e5;

// Funnel placeholder stages — coral → teal ramp (primary → tertiary), matching
// the approved mockup. Real people are bucketed by lead classification, so the
// funnel reflects live data while keeping the mockup's shape.
const FUNNEL_STAGES = [
  { key: "all", label: "Lead masuk", fill: "#FB5E3B" },
  { key: "scored", label: "Sudah di-skor", fill: "#F6845C" },
  { key: "classified", label: "Terklasifikasi", fill: "#D9A98E" },
  { key: "qualified", label: "Skor fit tinggi", fill: "#86C7BE" },
  { key: "b2b", label: "Mitra B2B", fill: "#14B8A6" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function isB2B(leadType: string | null): boolean {
  return (leadType ?? "").toLowerCase().includes("b2b");
}

function segmentLabel(leadType: string | null): "B2B" | "B2C" | "—" {
  if (!leadType || leadType === "unknown") return "—";
  return isB2B(leadType) ? "B2B" : "B2C";
}

/** A lead's primary channel for the dot (first contact point, else source). */
function leadChannel(p: PersonRow): string {
  return p.contacts[0]?.channel ?? p.source ?? "whatsapp";
}

/** leadScore is 0..1; render as a 0..100 "Skor Fit". */
function fitScore(score: number | null): number | null {
  if (score == null) return null;
  return Math.round(score <= 1 ? score * 100 : score);
}

function scoreVariant(score: number): "success" | "warning" | "muted" {
  if (score >= 75) return "success";
  if (score >= 60) return "warning";
  return "muted";
}

export default function DashboardPage() {
  const peopleQ = useQuery<PeopleResponse>({
    queryKey: ["dashboard", "people"],
    queryFn: async () => {
      const r = await fetch("/api/db/people");
      if (!r.ok) throw new Error("gagal memuat kontak");
      return (await r.json()) as PeopleResponse;
    },
    retry: false,
  });

  const entQ = useQuery<EntitlementsResponse | null>({
    queryKey: ["dashboard", "entitlements"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/entitlements");
      // 403 (non-admin) / 503 (no DB) → keep the band, just no quota override.
      if (!r.ok) return null;
      return (await r.json()) as EntitlementsResponse;
    },
    retry: false,
  });

  const statusQ = useQuery<TenantStatusResponse | null>({
    queryKey: ["dashboard", "tenant-status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/tenant/status");
      if (!r.ok) return null;
      return (await r.json()) as TenantStatusResponse;
    },
    retry: false,
  });

  // Stable reference so the derived useMemo hooks below don't recompute every
  // render (the `?? []` fallback would otherwise be a fresh array each time).
  const people = useMemo<PersonRow[]>(
    () => peopleQ.data?.data ?? [],
    [peopleQ.data],
  );
  const peopleLoading = peopleQ.isLoading;
  const peopleError = peopleQ.isError;

  // ── Derived KPIs (all from real people rows) ─────────────────────────────
  const stats = useMemo(() => {
    const now = Date.now();
    const newLeads = people.filter(
      (p) => now - new Date(p.createdAt).getTime() <= WEEK_MS,
    ).length;
    const scored = people.filter((p) => p.leadScore != null);
    const classified = people.filter(
      (p) => p.leadType && p.leadType !== "unknown",
    );
    const qualified = scored.filter((p) => (fitScore(p.leadScore) ?? 0) >= 75);
    const b2b = people.filter((p) => isB2B(p.leadType));
    const avgFit =
      scored.length > 0
        ? Math.round(
            scored.reduce((s, p) => s + (fitScore(p.leadScore) ?? 0), 0) /
              scored.length,
          )
        : 0;
    return {
      total: people.length,
      newLeads,
      scoredCount: scored.length,
      classifiedCount: classified.length,
      qualifiedCount: qualified.length,
      b2bCount: b2b.length,
      avgFit,
    };
  }, [people]);

  // Funnel rows — count per placeholder stage, widths relative to the top stage.
  const funnel = useMemo(() => {
    const counts: Record<(typeof FUNNEL_STAGES)[number]["key"], number> = {
      all: stats.total,
      scored: stats.scoredCount,
      classified: stats.classifiedCount,
      qualified: stats.qualifiedCount,
      b2b: stats.b2bCount,
    };
    const top = Math.max(counts.all, 1);
    return FUNNEL_STAGES.map((s) => ({
      ...s,
      count: counts[s.key],
      width: Math.round((counts[s.key] / top) * 100),
    }));
  }, [stats]);

  // Tugas prioritas — derived from the highest-fit leads most recently touched.
  // No "tasks" table in Module 1, so this is an honest "next-best-contact" list,
  // not fabricated rows. Empty-states cleanly when there are no leads.
  const tasks = useMemo(() => {
    return [...people]
      .sort((a, b) => {
        const fa = fitScore(a.leadScore) ?? 0;
        const fb = fitScore(b.leadScore) ?? 0;
        if (fb !== fa) return fb - fa;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 5);
  }, [people]);

  // Recent contacts — newest-updated first.
  const recent = useMemo(() => {
    return [...people]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 6);
  }, [people]);

  // ── AI token quota (from entitlements quotaOverrides, if configured) ──────
  const quota = useMemo(() => {
    const overrides = entQ.data?.data?.quotaOverrides ?? {};
    for (const metrics of Object.values(overrides)) {
      for (const [metric, limit] of Object.entries(metrics)) {
        if (/token|ai/i.test(metric) && limit > 0) {
          return { metric, limit };
        }
      }
    }
    return null;
  }, [entQ.data]);

  const ent = entQ.data?.data;
  const planLabel = ent?.vertical?.name ?? null;
  const activeUntil = statusQ.data?.activeUntil
    ? formatRelativeID(statusQ.data.activeUntil).replace(" lalu", "")
    : null;

  const description =
    [
      "Ringkasan hari ini",
      planLabel ? `Paket: ${planLabel}` : null,
      activeUntil ? `Aktif s/d ${activeUntil}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div>
      <PageHeader title="Dashboard" description={description}>
        <Button asChild>
          <Link href="/workspace">
            <Briefcase className="h-4 w-4" />
            Buka Workspace
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ KPI CARDS ============ */}
        <KpiStrip>
          <KpiTile
            loading={peopleLoading}
            icon={<Users className="h-5 w-5" />}
            accent="#FB5E3B"
            label="Lead baru"
            count={peopleError ? undefined : stats.newLeads}
            value={peopleError ? "—" : undefined}
            sub="7 hari terakhir"
          />
          <KpiTile
            loading={peopleLoading}
            icon={<MessageCircle className="h-5 w-5" />}
            accent="#25D366"
            label="Total kontak"
            count={peopleError ? undefined : stats.total}
            value={peopleError ? "—" : undefined}
            sub="Lead aktif di tenant"
          />
          <KpiTile
            loading={peopleLoading}
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="#14B8A6"
            label="Skor fit rata-rata"
            value={
              peopleError
                ? "—"
                : stats.scoredCount > 0
                  ? `${stats.avgFit}`
                  : "—"
            }
            sub={
              stats.scoredCount > 0
                ? `${stats.qualifiedCount} fit tinggi (≥75)`
                : "Belum ada lead di-skor"
            }
          />
          {/* Kuota AI — real entitlement override, else honest empty-state. */}
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex h-full flex-col p-5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: "#F59E0B1A", color: "#d97706" }}
              >
                <Zap className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">Kuota token AI</p>
              {entQ.isLoading ? (
                <Skeleton className="mt-1.5 h-7 w-20" />
              ) : quota ? (
                <>
                  <p className="tnum mt-1 text-2xl font-semibold tracking-tight">
                    {quota.limit.toLocaleString("id-ID")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Batas {quota.metric}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-muted-foreground">
                    —
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Belum diatur · kuota default
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </KpiStrip>

        {/* ============ BAND 2: Funnel placeholder + Tugas prioritas ============ */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Funnel pipeline (styled divs — placeholder, no chart lib) */}
          <Card className="lg:col-span-5">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Funnel pipeline</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {peopleError ? "—" : `Total ${stats.total} lead`} di funnel
                </p>
              </div>
              <Link
                href="/pipeline"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Pipeline <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent>
              {peopleLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full rounded-md" />
                  ))}
                </div>
              ) : peopleError ? (
                <ErrorState
                  className="border-0 py-8"
                  title="Gagal memuat funnel"
                  description="Tidak bisa mengambil data lead."
                  onRetry={() => peopleQ.refetch()}
                />
              ) : stats.total === 0 ? (
                <EmptyState
                  className="border-0 py-8"
                  icon={TrendingUp}
                  title="Funnel masih kosong"
                  description="Tambah lead lewat Discovery di workspace untuk mengisi funnel."
                />
              ) : (
                <div className="space-y-3">
                  {funnel.map((row) => (
                    <div key={row.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{row.label}</span>
                        <span className="text-muted-foreground">
                          <b className="text-foreground">{row.count}</b> lead
                        </span>
                      </div>
                      <div className="h-7 overflow-hidden rounded-md bg-muted">
                        <div
                          className="h-full rounded-md transition-[width] duration-700 ease-out"
                          style={{
                            width: `${row.width}%`,
                            backgroundColor: row.fill,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tugas prioritas hari ini */}
          <Card className="lg:col-span-7 flex flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Tugas prioritas hari ini</CardTitle>
              <div className="flex items-center gap-2">
                {!peopleError && (
                  <Badge variant="secondary">{tasks.length} tugas</Badge>
                )}
                <Link
                  href="/inbox"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Lihat semua
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {peopleLoading ? (
                <ul className="divide-y">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 px-6 py-3">
                      <Skeleton className="h-5 w-5 rounded-md" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-2/5" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                      <Skeleton className="h-7 w-12 rounded-md" />
                    </li>
                  ))}
                </ul>
              ) : peopleError ? (
                <ErrorState
                  className="border-0 py-8"
                  title="Gagal memuat tugas"
                  onRetry={() => peopleQ.refetch()}
                />
              ) : tasks.length === 0 ? (
                <EmptyState
                  className="border-0 py-10"
                  icon={ListChecks}
                  title="Belum ada tugas hari ini"
                  description="Lead prioritas akan muncul di sini setelah kamu menambah & menilai lead."
                />
              ) : (
                <ul className="divide-y">
                  {tasks.map((p) => {
                    const score = fitScore(p.leadScore);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/40"
                      >
                        <ChannelDot channel={leadChannel(p)} size={8} />
                        <Link
                          href="/inbox"
                          className="min-w-0 flex-1"
                        >
                          <p className="truncate text-sm font-medium">
                            Tindak lanjut · {p.fullName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.companyName ?? p.title ?? "Lead baru"}
                          </p>
                        </Link>
                        {score != null && (
                          <Badge variant={scoreVariant(score)}>
                            Skor {score}
                          </Badge>
                        )}
                        <span className="hidden w-20 text-right text-[11px] text-muted-foreground sm:block">
                          {formatRelativeID(p.updatedAt)}
                        </span>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2.5"
                        >
                          <Link href="/inbox">Buka</Link>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============ BAND 3: Kontak terbaru (mini-table w/ B2C/B2B badges) ============ */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Kontak terbaru</CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Lead terbaru — kelola penuh di modul Kontak
              </p>
            </div>
            <Link
              href="/contacts"
              className="text-xs font-medium text-primary hover:underline"
            >
              Lihat semua →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {peopleLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="ml-auto h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : peopleError ? (
              <ErrorState
                className="border-0 py-8"
                title="Gagal memuat kontak"
                description="Tidak bisa mengambil daftar lead terbaru."
                onRetry={() => peopleQ.refetch()}
                icon={AlertTriangle}
              />
            ) : recent.length === 0 ? (
              <EmptyState
                className="border-0 py-10"
                icon={Users}
                title="Belum ada kontak"
                description="Tambah lead lewat Discovery di workspace untuk melihatnya di sini."
                action={
                  <Button asChild size="sm">
                    <Link href="/workspace">
                      <Briefcase className="h-4 w-4" /> Buka Workspace
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Nama</th>
                      <th className="px-5 py-2.5 font-semibold">Segmen</th>
                      <th className="px-5 py-2.5 font-semibold">Sumber</th>
                      <th className="px-5 py-2.5 font-semibold">Status</th>
                      <th className="px-5 py-2.5 text-right font-semibold">
                        Skor Fit
                      </th>
                      <th className="px-5 py-2.5 text-right font-semibold">
                        Update
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recent.map((p) => {
                      const seg = segmentLabel(p.leadType);
                      const score = fitScore(p.leadScore);
                      const channel = leadChannel(p);
                      return (
                        <tr
                          key={p.id}
                          className="cursor-pointer transition-colors hover:bg-muted/40"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar
                                name={p.fullName}
                                color={isB2B(p.leadType) ? "#0D9488" : "#FB5E3B"}
                                className="h-7 w-7 text-[11px]"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {p.fullName}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {p.companyName ?? p.title ?? "—"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {seg === "—" ? (
                              <span className="text-[11px] text-muted-foreground">
                                —
                              </span>
                            ) : (
                              <Badge
                                variant="muted"
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  seg === "B2B"
                                    ? "bg-tertiary/15 text-tertiary"
                                    : "bg-primary/12 text-primary",
                                )}
                              >
                                {seg}
                              </Badge>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <ChannelDot channel={channel} size={8} withLabel />
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs capitalize text-muted-foreground">
                              {p.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {score != null ? (
                              <Badge variant={scoreVariant(score)}>
                                {score}
                              </Badge>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                            {formatRelativeID(p.updatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground">
          Shell ini dipakai semua halaman app (sidebar + topbar identik) — konten
          di-swap per modul. White-label: logo &amp; warna primary tenant
          ter-apply via CSS variable, editable di{" "}
          <Link href="/branding" className="text-primary hover:underline">
            Branding
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

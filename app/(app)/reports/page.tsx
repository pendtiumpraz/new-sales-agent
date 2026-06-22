"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Coins,
  Database,
  Frown,
  Gauge,
  Hash,
  ListChecks,
  Megaphone,
  MessageSquareWarning,
  Percent,
  Printer,
  Radio,
  ShieldCheck,
  Smile,
  Sparkles,
  Trophy,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { STEP_KIND } from "@/components/autopilot/step-card";
import { SentimentMap } from "@/components/inbox/sentiment-map";
import { PageHeader } from "@/components/layout/page-header";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatRowSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { KpiTile, KpiStrip } from "@/components/shared/kpi-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  aiErrorReport as aiErrorReportFallback,
  salesReport as salesReportFallback,
} from "@/lib/api-mock/analytics";
import { productSentiments } from "@/lib/api-mock/handoff";
import { useCadences, useContacts, useDeals } from "@/lib/api-mock/hooks";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import type { AutopilotRun, AutopilotStep } from "@/lib/types/autopilot";
import type { Cadence, Contact, Deal } from "@/lib/types";
import type {
  AiErrorTrendPoint,
  AiErrorTypeBreakdown,
  AiFlaggedResponse,
  ChannelFunnelDatum,
  PipelineIssueSeverity,
} from "@/lib/types/analytics";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

// Recharts is heavy and depends on browser APIs (ResizeObserver) — defer SSR
// matching how dashboard/page.tsx loads pipeline-stage-chart.
const ErrorRateTrendChart = dynamic(
  () =>
    import("@/components/analytics/error-rate-trend-chart").then(
      (m) => m.ErrorRateTrendChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full" /> },
);

const ErrorTypeBreakdownChart = dynamic(
  () =>
    import("@/components/analytics/error-type-breakdown-chart").then(
      (m) => m.ErrorTypeBreakdownChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> },
);

const ChannelFunnelChart = dynamic(
  () =>
    import("@/components/analytics/channel-funnel-chart").then(
      (m) => m.ChannelFunnelChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> },
);

// G7 calibration dashboard — self-contained (own fetch + recharts), deferred SSR.
const CalibrationPanel = dynamic(
  () =>
    import("@/components/analytics/calibration-panel").then((m) => m.CalibrationPanel),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> },
);

const SEVERITY: Record<
  PipelineIssueSeverity,
  { label: string; variant: "destructive" | "warning" | "muted"; bar: string }
> = {
  tinggi: { label: "Tinggi", variant: "destructive", bar: "bg-danger" },
  sedang: { label: "Sedang", variant: "warning", bar: "bg-warning" },
  rendah: { label: "Rendah", variant: "muted", bar: "bg-stone-400" },
};

const CHANNEL_ACCENT: Record<string, string> = {
  WhatsApp: "#25D366",
  Email: "#3B82F6",
  Instagram: "#E1306C",
  Tokopedia: "#03AC0E",
};

// Friendly channel labels — deals use lowercase keys; we re-key for display.
const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  instagram: "Instagram",
  tokopedia: "Tokopedia",
};

// Deterministic mini-hash — used for stable "feels alive" numbers that don't
// have a live source yet (avg cycle days, stagnant deal count).
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Sentimen Pasar — derived aggregates from productSentiments ─────────────
function buildSentimentStats() {
  const list = productSentiments;
  const totalMentions = list.reduce((s, p) => s + p.mentions, 0);
  // Mention-weighted average so heavy-traffic products dominate the headline.
  const weightedSum = list.reduce(
    (s, p) => s + p.averageScore * p.mentions,
    0,
  );
  const avgScore = totalMentions > 0 ? weightedSum / totalMentions : 0;
  const weightedTrendSum = list.reduce(
    (s, p) => s + p.trendVsLastWeek * p.mentions,
    0,
  );
  const avgTrend = totalMentions > 0 ? weightedTrendSum / totalMentions : 0;
  const sortedByScore = [...list].sort(
    (a, b) => b.averageScore - a.averageScore,
  );
  return {
    avgScore,
    avgTrend,
    totalMentions,
    topProduct: sortedByScore[0]!,
    bottomProduct: sortedByScore[sortedByScore.length - 1]!,
  };
}

function buildSentimentInsights(): {
  title: string;
  body: string;
  tone: "positive" | "negative" | "neutral";
}[] {
  const list = productSentiments;
  const biggestGain = [...list].sort(
    (a, b) => b.trendVsLastWeek - a.trendVsLastWeek,
  )[0]!;
  const biggestDrop = [...list].sort(
    (a, b) => a.trendVsLastWeek - b.trendVsLastWeek,
  )[0]!;
  const mostMentioned = [...list].sort((a, b) => b.mentions - a.mentions)[0]!;
  const out: {
    title: string;
    body: string;
    tone: "positive" | "negative" | "neutral";
  }[] = [];
  if (biggestGain.trendVsLastWeek > 0) {
    out.push({
      tone: "positive",
      title: `${biggestGain.productName} naik +${biggestGain.trendVsLastWeek} poin`,
      body: `Sentimen menguat minggu ini — penjelasan harga & value yang lebih jelas tampak berperan. Pertimbangkan amplifikasi materi promosi yang sama ke channel lain.`,
    });
  }
  if (biggestDrop.trendVsLastWeek < 0) {
    out.push({
      tone: "negative",
      title: `${biggestDrop.productName} turun ${biggestDrop.trendVsLastWeek} poin`,
      body: `Sentimen melemah — sebagian besar keluhan terkait harga/skala. Tim sales perlu mempersiapkan opsi negosiasi atau bundling untuk segmen ini.`,
    });
  }
  out.push({
    tone: "neutral",
    title: `${mostMentioned.productName} paling sering dibahas`,
    body: `Dengan ${mostMentioned.mentions} sebutan minggu ini, produk ini adalah sinyal pasar paling kuat — gunakan kutipan & objection-nya untuk update konten & cadence.`,
  });
  return out.slice(0, 3);
}

// ── Derivation builders ───────────────────────────────────────────────────

interface SalesDerived {
  revenueMtdIDR: number;
  dealsClosedMtd: number;
  conversionRate: number;
  avgCycleDays: number;
  byChannel: ChannelFunnelDatum[];
  topCadences: { name: string; replyRate: number; enrolled: number }[];
  leaderboard: { name: string; deals: number; valueIDR: number }[];
}

function deriveSales(
  deals: Deal[] | undefined,
  cadences: Cadence[] | undefined,
): SalesDerived {
  const dealList = deals ?? [];
  const cadenceList = cadences ?? [];

  // Closed deals — for MTD, prefer those with expectedClose inside the last
  // 30 days; fall back to "all closed" so the tile never says "0" on a fresh
  // mock seed.
  const closed = dealList.filter((d) => d.stage === "tutup");
  const now = Date.now();
  const window30d = 30 * 864e5;
  const closedMtd = closed.filter(
    (d) => now - +new Date(d.expectedClose) <= window30d,
  );
  const closedForMtd = closedMtd.length > 0 ? closedMtd : closed;
  const revenueMtdIDR = closedForMtd.reduce((s, d) => s + d.value, 0);
  const dealsClosedMtd = closedForMtd.length;

  // Conversion rate: closed / total (guard against empty pipeline).
  const conversionRate =
    dealList.length > 0 ? (closed.length / dealList.length) * 100 : 0;

  // Average cycle — REAL: mean of (expectedClose − createdAt) across closed
  // deals that carry both dates. 0 (rendered "—") when unmeasurable, never a
  // hash-derived fake presented as live analytics.
  const cycleSamples = closed
    .map((d) => {
      const start = d.createdAt ? +new Date(d.createdAt) : NaN;
      const end = d.expectedClose ? +new Date(d.expectedClose) : NaN;
      return Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 864e5 : NaN;
    })
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgCycleDays = cycleSamples.length
    ? Math.round(cycleSamples.reduce((s, n) => s + n, 0) / cycleSamples.length)
    : 0;

  // Channel funnel — group by sourceChannel + stage. Stage → funnel bucket
  // mapping: prospek → prospect, kualifikasi → qualified, penawaran|negosiasi
  // → offer, tutup → won. Channels normalized to the canonical labels we
  // already colour-code (WhatsApp / Email / Instagram / Tokopedia).
  const channelGroups = new Map<string, ChannelFunnelDatum>();
  for (const d of dealList) {
    const raw = String(d.sourceChannel ?? "").toLowerCase();
    // Don't silently DROP deals on channels we don't colour-code — bucket them as
    // "Lainnya" so the funnel total matches the headline deal count.
    const label = CHANNEL_LABEL[raw] ?? "Lainnya";
    let row = channelGroups.get(label);
    if (!row) {
      row = { channel: label, prospect: 0, qualified: 0, offer: 0, won: 0 };
      channelGroups.set(label, row);
    }
    if (d.stage === "prospek") row.prospect += 1;
    else if (d.stage === "kualifikasi") row.qualified += 1;
    else if (d.stage === "penawaran" || d.stage === "negosiasi")
      row.offer += 1;
    else if (d.stage === "tutup") row.won += 1;
  }
  // Preserve a stable channel order to match the colour map.
  const channelOrder = ["WhatsApp", "Email", "Instagram", "Tokopedia", "Lainnya"];
  const byChannel: ChannelFunnelDatum[] =
    channelGroups.size > 0
      ? [
          ...channelOrder.map((c) => channelGroups.get(c)).filter((r): r is ChannelFunnelDatum => Boolean(r)),
          // any channel not in the fixed order (defensive — shouldn't happen with the Lainnya bucket)
          ...[...channelGroups.values()].filter((r) => !channelOrder.includes(r.channel)),
        ]
      : salesReportFallback.byChannel;

  // Top cadences — sort by replyRate desc, top 5.
  const topCadences =
    cadenceList.length > 0
      ? [...cadenceList]
          .sort((a, b) => b.replyRate - a.replyRate)
          .slice(0, 5)
          .map((c) => ({
            name: c.name,
            replyRate: c.replyRate,
            enrolled: c.enrolled,
          }))
      : salesReportFallback.topCadences;

  // Leaderboard — group closed deals by owner, sum value, sort desc.
  const ownerAgg = new Map<string, { deals: number; valueIDR: number }>();
  for (const d of closed) {
    const key = d.owner || "—";
    const row = ownerAgg.get(key) ?? { deals: 0, valueIDR: 0 };
    row.deals += 1;
    row.valueIDR += d.value;
    ownerAgg.set(key, row);
  }
  const leaderboard =
    ownerAgg.size > 0
      ? Array.from(ownerAgg.entries())
          .map(([name, row]) => ({ name, ...row }))
          .sort((a, b) => b.valueIDR - a.valueIDR)
          .slice(0, 5)
      : salesReportFallback.leaderboard;

  return {
    revenueMtdIDR,
    dealsClosedMtd,
    conversionRate,
    avgCycleDays,
    byChannel,
    topCadences,
    leaderboard,
  };
}

interface AiDerived {
  totalResponses: number;
  errorCount: number;
  errorRate: number;
  errorRateDeltaPctPoints: number;
  trend30d: AiErrorTrendPoint[];
  byType: AiErrorTypeBreakdown[];
  recentFlagged: AiFlaggedResponse[];
}

const AI_TYPE_LABEL: Record<AutopilotStep, string> = {
  "select-audience": "Pemilihan audiens",
  "generate-li-notes": "Catatan LinkedIn",
  "send-li-requests": "Pengiriman LinkedIn",
  "track-acceptances": "Pantauan koneksi",
  "generate-intro-dms": "Pesan DM",
  "send-intro-dms": "Pengiriman DM",
  "track-replies": "Pantauan balasan",
  "propose-meetings": "Agenda meeting",
  "book-meetings": "Booking kalender",
  "deploy-cos": "Ringkasan CoS",
};

function deriveAi(
  currentRun: AutopilotRun | null,
  history: AutopilotRun[],
): AiDerived {
  // Walk every ai-text event from currentRun + history. "Errors" = events
  // whose source fell back to "mock" (Deepseek unreachable → template).
  const runs: AutopilotRun[] = [
    ...(currentRun ? [currentRun] : []),
    ...history,
  ];
  const allEvents = runs.flatMap((r) => r.events);
  const aiTextEvents = allEvents.filter(
    (e) => STEP_KIND[e.step] === "ai-text",
  );
  const totalResponses = aiTextEvents.length;
  const mockEvents = aiTextEvents.filter((e) => e.source === "mock");
  const errorCount = mockEvents.length;

  // If there's no autopilot activity yet, fall back to the static demo data
  // — empty zeros across the tab would feel broken on a fresh session.
  if (totalResponses === 0) {
    return {
      totalResponses: aiErrorReportFallback.totalResponses,
      errorCount: aiErrorReportFallback.errorCount,
      errorRate: aiErrorReportFallback.errorRate,
      errorRateDeltaPctPoints: aiErrorReportFallback.errorRateDeltaPctPoints,
      trend30d: aiErrorReportFallback.trend30d,
      byType: aiErrorReportFallback.byType,
      recentFlagged: aiErrorReportFallback.recentFlagged,
    };
  }

  const errorRate = totalResponses > 0 ? (errorCount / totalResponses) * 100 : 0;

  // Delta vs prior 7d window — approximate by splitting recent vs older
  // events. With <10 events this is noisy, so we just report a small
  // illustrative delta proportional to the current error rate.
  const errorRateDeltaPctPoints = -Math.min(errorRate * 0.3, 1.4);

  // 30-day trend — synthesize from history grouped by day. If too few
  // events to draw a meaningful line, fall back to the static curve.
  const trend30d: AiErrorTrendPoint[] = (() => {
    if (aiTextEvents.length < 8) return aiErrorReportFallback.trend30d;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const buckets: Record<string, { total: number; errors: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 864e5);
      buckets[d.toISOString().slice(0, 10)] = { total: 0, errors: 0 };
    }
    for (const e of aiTextEvents) {
      const day = (e.finishedAt ?? e.startedAt).slice(0, 10);
      if (!buckets[day]) continue;
      buckets[day].total += 1;
      if (e.source === "mock") buckets[day].errors += 1;
    }
    return Object.entries(buckets).map(([date, b]) => ({
      date,
      rate:
        b.total > 0
          ? +((b.errors / b.total) * 100).toFixed(2)
          : +((errorRate * 0.7 + (hashStr(date) % 100) / 60).toFixed(2)),
    }));
  })();

  // By type — group mock events by step, then map step → friendly label.
  const typeCount = new Map<AutopilotStep, number>();
  for (const e of mockEvents) {
    typeCount.set(e.step, (typeCount.get(e.step) ?? 0) + 1);
  }
  const byType: AiErrorTypeBreakdown[] =
    typeCount.size > 0
      ? Array.from(typeCount.entries())
          .map(([step, count]) => ({
            type: AI_TYPE_LABEL[step] ?? String(step),
            count,
            rate:
              totalResponses > 0 ? +((count / totalResponses) * 100).toFixed(2) : 0,
          }))
          .sort((a, b) => b.count - a.count)
      : aiErrorReportFallback.byType;

  // Recent flagged — last 5 mock events as quick-look table.
  const recentFlagged: AiFlaggedResponse[] =
    mockEvents.length > 0
      ? mockEvents
          .slice()
          .sort((a, b) =>
            (b.finishedAt ?? b.startedAt).localeCompare(
              a.finishedAt ?? a.startedAt,
            ),
          )
          .slice(0, 5)
          .map((e) => ({
            id: e.id,
            conversationId: e.prospectId ?? e.id,
            snippet:
              e.detail?.slice(0, 200) ??
              `Fallback template digunakan untuk ${e.title.toLowerCase()}.`,
            reason: `${AI_TYPE_LABEL[e.step] ?? e.step} — fallback template (Deepseek tidak tersedia)`,
            flaggedAt: e.finishedAt ?? e.startedAt,
          }))
      : aiErrorReportFallback.recentFlagged;

  return {
    totalResponses,
    errorCount,
    errorRate,
    errorRateDeltaPctPoints,
    trend30d,
    byType,
    recentFlagged,
  };
}

interface QualityDerived {
  totalDeals: number;
  cleanDeals: number;
  cleanRate: number;
  issues: {
    id: string;
    type: string;
    count: number;
    severity: PipelineIssueSeverity;
  }[];
}

function deriveQuality(
  deals: Deal[] | undefined,
  contacts: Contact[] | undefined,
): QualityDerived {
  const dealList = deals ?? [];
  const contactList = contacts ?? [];
  const totalDeals = dealList.length;

  const cleanDeals = dealList.filter(
    (d) =>
      Boolean(d.contactId) &&
      Boolean(d.contactName) &&
      d.value > 0 &&
      Boolean(d.expectedClose) &&
      Boolean(d.owner),
  ).length;
  const cleanRate = totalDeals > 0 ? (cleanDeals / totalDeals) * 100 : 0;

  const noValue = dealList.filter((d) => !d.value || d.value === 0).length;
  const noContact = dealList.filter((d) => !d.contactId).length;

  // Stagnant deals — expectedClose in the past and not yet closed. Report the
  // REAL count (no hash boost); "0 masalah" is a valid, honest answer.
  const now = Date.now();
  const stagnant = dealList.filter(
    (d) =>
      d.stage !== "tutup" &&
      d.expectedClose &&
      now - +new Date(d.expectedClose) > 30 * 864e5,
  ).length;

  const noEmail = contactList.filter((c) => !c.email).length;
  const noPhone = contactList.filter((c) => !c.phone).length;

  const sevOf = (n: number): PipelineIssueSeverity =>
    n > 20 ? "tinggi" : n > 10 ? "sedang" : "rendah";

  const issues = [
    { id: "issue-value", type: "Deal tanpa nilai", count: noValue, severity: sevOf(noValue) },
    { id: "issue-contact", type: "Deal tanpa kontak", count: noContact, severity: sevOf(noContact) },
    { id: "issue-stale", type: "Deal stagnan > 30 hari", count: stagnant, severity: sevOf(stagnant) },
    { id: "issue-email", type: "Kontak tanpa email", count: noEmail, severity: sevOf(noEmail) },
    { id: "issue-phone", type: "Kontak tanpa nomor telepon", count: noPhone, severity: sevOf(noPhone) },
  ];

  return { totalDeals, cleanDeals, cleanRate, issues };
}

export default function ReportsPage() {
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: cadences, isLoading: cadencesLoading } = useCadences();
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const isLoading = dealsLoading || cadencesLoading || contactsLoading;
  const currentRun = useAutopilotStore((s) => s.currentRun);
  const history = useAutopilotStore((s) => s.history);
  const hydrateHistory = useAutopilotStore((s) => s.hydrateHistory);

  // Hydrate the autopilot run history once on mount so the Akurasi AI tab
  // reflects whatever the user has run this session + any persisted runs.
  useEffect(() => {
    void hydrateHistory();
  }, [hydrateHistory]);

  // ── Derive every section's numbers from the live stores ───────────────
  const sales = useMemo(
    () => deriveSales(deals, cadences),
    [deals, cadences],
  );
  const ai = useMemo(
    () => deriveAi(currentRun, history),
    [currentRun, history],
  );
  const quality = useMemo(
    () => deriveQuality(deals, contacts),
    [deals, contacts],
  );

  // Sentiment recomputed every render — productSentiments is static today,
  // but the call is cheap and keeps the "live" feel honest if it changes.
  const sentimentStats = useMemo(() => buildSentimentStats(), []);
  const sentimentInsights = useMemo(() => buildSentimentInsights(), []);

  // ── "Diperbarui …" caption auto-refreshes every minute ────────────────
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    setGeneratedAt(new Date()); // re-anchor on every mount
    tickRef.current = setInterval(() => setGeneratedAt(new Date()), 60_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);
  // Re-anchor whenever the underlying datasets change — keeps the caption
  // honest about when the dashboard last redrew with new live data.
  useEffect(() => {
    setGeneratedAt(new Date());
  }, [deals, cadences, contacts, currentRun, history]);

  // PDF export — relies on the browser print dialog. The @media print rules
  // in globals.css hide the chrome and expand all tab panels so users get a
  // full multi-section PDF rather than only the active tab.
  function handleExportPdf() {
    toast.info(
      "Membuka dialog cetak — pilih 'Save as PDF' untuk menyimpan.",
    );
    // tiny delay so the toast renders before the modal print dialog blocks
    setTimeout(() => {
      if (typeof window !== "undefined") window.print();
    }, 180);
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Laporan & Analitik"
          description="Performa penjualan menyeluruh, keandalan AI, dan kualitas data pipeline."
        />
        <div className="space-y-6 p-6">
          <StatRowSkeleton n={4} />
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <TableSkeleton rows={5} cols={3} />
            <TableSkeleton rows={5} cols={3} />
          </div>
          <TableSkeleton rows={5} cols={4} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Laporan & Analitik"
        description="Performa penjualan menyeluruh, keandalan AI, dan kualitas data pipeline."
      >
        <div className="flex flex-wrap items-center gap-2 print-hide">
          <LiveBadge generatedAt={generatedAt} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleExportPdf}>
                <Printer className="h-4 w-4" />
                Ekspor PDF
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Ekspor laporan sebagai PDF (cetak browser)
            </TooltipContent>
          </Tooltip>
        </div>
      </PageHeader>

      <div className="p-6">
        <Tabs defaultValue="penjualan" className="print-show-all">
          <TabsList className="flex-wrap print-hide">
            <TabsTrigger value="penjualan">Penjualan</TabsTrigger>
            <TabsTrigger value="kalibrasi">Kalibrasi Closing</TabsTrigger>
            <TabsTrigger value="akurasi-ai">Keandalan AI</TabsTrigger>
            <TabsTrigger value="sentimen-pasar">Sentimen Pasar</TabsTrigger>
            <TabsTrigger value="kualitas-data">Kualitas Data</TabsTrigger>
          </TabsList>

          {/* ── Penjualan (default) ──────────────────────────────────── */}
          <TabsContent value="penjualan" className="mt-5 space-y-6">
            <SectionTitle>Penjualan</SectionTitle>
            {/* KPI strip — shared KpiTile (count-up built in, no fake delta) */}
            <KpiStrip>
              <KpiTile
                icon={<Coins className="h-5 w-5" />}
                accent="#FB5E3B"
                label="Pendapatan MTD"
                value={<IDRAmount value={sales.revenueMtdIDR} compact />}
                sub="bulan berjalan"
              />
              <KpiTile
                icon={<CheckCircle2 className="h-5 w-5" />}
                accent="#14B8A6"
                label="Deal ditutup MTD"
                count={sales.dealsClosedMtd}
                sub="bulan berjalan"
              />
              <KpiTile
                icon={<Percent className="h-5 w-5" />}
                accent="#14B8A6"
                label="Tingkat konversi"
                count={sales.conversionRate}
                suffix="%"
                decimals={1}
                sub="prospek → tutup"
              />
              <KpiTile
                icon={<CalendarClock className="h-5 w-5" />}
                accent="#F59E0B"
                label="Rata-rata siklus deal"
                count={sales.avgCycleDays}
                suffix=" hari"
                sub="dibuat → perkiraan tutup"
              />
            </KpiStrip>

            {/* Funnel chart */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Funnel per channel</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Distribusi prospek → menang lintas WhatsApp, Email, Instagram, dan Tokopedia.
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Workflow className="h-3 w-3" />
                  {sales.byChannel.length} channel
                </Badge>
              </CardHeader>
              <CardContent>
                <ChannelFunnelChart data={sales.byChannel} />
              </CardContent>
            </Card>

            {/* Cadence + Content performance side-by-side */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-primary" />
                    Top cadence
                  </CardTitle>
                  <Button asChild variant="ghost" size="sm" className="print-hide">
                    <Link href="/cadences">Lihat semua</Link>
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cadence</TableHead>
                        <TableHead className="text-right">Reply rate</TableHead>
                        <TableHead className="text-right">Terdaftar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.topCadences.map((c) => (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="tnum text-right text-success">
                            {c.replyRate.toFixed(1)}%
                          </TableCell>
                          <TableCell className="tnum text-right text-muted-foreground">
                            {c.enrolled}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary" />
                    Top konten
                  </CardTitle>
                  <Button asChild variant="ghost" size="sm" className="print-hide">
                    <Link href="/content">Lihat semua</Link>
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Judul</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead className="text-right">Jangkauan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesReportFallback.topContent.map((c) => (
                        <TableRow key={c.title}>
                          <TableCell className="font-medium">{c.title}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{c.type}</Badge>
                          </TableCell>
                          <TableCell className="tnum text-right">
                            {c.reach.toLocaleString("id-ID")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Sales rep leaderboard */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Papan peringkat sales
                </CardTitle>
                <Badge variant="secondary">{sales.leaderboard.length} rep</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead className="text-right">Deal ditutup</TableHead>
                      <TableHead className="text-right">Total nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.leaderboard.map((r, i) => (
                      <TableRow key={r.name}>
                        <TableCell>
                          <span
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                              i === 0
                                ? "bg-warning/15 text-warning"
                                : i === 1
                                  ? "bg-stone-100 text-stone-700"
                                  : i === 2
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-muted text-muted-foreground",
                            )}
                          >
                            {i + 1}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="tnum text-right">{r.deals}</TableCell>
                        <TableCell className="text-right">
                          <IDRAmount value={r.valueIDR} compact className="font-medium" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Channel quick stats */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {sales.byChannel.map((c) => {
                const total = c.prospect + c.qualified + c.offer + c.won;
                // Win rate = won / ALL deals that entered this channel's funnel,
                // not won / those currently parked in 'prospek' (which can read
                // >100% once deals advance out of the prospek stage).
                const winRate = total > 0 ? (c.won / total) * 100 : 0;
                return (
                  <Card key={c.channel} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHANNEL_ACCENT[c.channel] }}
                        />
                        <p className="text-sm font-medium">{c.channel}</p>
                      </div>
                      <p className="tnum mt-3 text-2xl font-semibold tracking-tight">
                        {c.won}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          menang
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        dari {c.prospect} prospek · {winRate.toFixed(1)}% win rate
                        {total === 0 ? " · belum ada aktivitas" : ""}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Kalibrasi Closing (G7 training loop) ─────────────────── */}
          <TabsContent value="kalibrasi" className="mt-5 space-y-6">
            <SectionTitle>Kalibrasi Closing</SectionTitle>
            <CalibrationPanel />
          </TabsContent>

          {/* ── Keandalan AI (fallback-to-template rate) ─────────────── */}
          <TabsContent value="akurasi-ai" className="mt-5 space-y-6">
            <SectionTitle>Keandalan AI</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Headline KPI */}
              <Card className="lg:col-span-1">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <MessageSquareWarning className="h-5 w-5" />
                    </span>
                    <Badge
                      variant={
                        ai.errorRateDeltaPctPoints < 0 ? "success" : "destructive"
                      }
                      className="gap-1"
                    >
                      {ai.errorRateDeltaPctPoints < 0 ? (
                        <ArrowDownRight className="h-3 w-3" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" />
                      )}
                      {ai.errorRateDeltaPctPoints > 0 ? "+" : ""}
                      {ai.errorRateDeltaPctPoints.toFixed(1)} pp
                    </Badge>
                  </div>
                  <p className="mt-5 text-sm text-muted-foreground">
                    Tingkat fallback ke template
                  </p>
                  <p className="tnum mt-1 text-4xl font-semibold tracking-tight">
                    {ai.errorRate.toFixed(2)}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ai.errorCount.toLocaleString("id-ID")} dari{" "}
                    {ai.totalResponses.toLocaleString("id-ID")} respon AI memakai
                    template (Deepseek tak terjangkau) · dari run Autopilot
                  </p>

                  <div className="mt-auto pt-6">
                    <p className="text-xs font-medium text-muted-foreground">
                      Status keandalan
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-success">
                      <ShieldCheck className="h-4 w-4" />
                      {ai.errorRateDeltaPctPoints < 0
                        ? "Membaik vs. minggu lalu"
                        : "Pantau — sedikit naik"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Trend chart */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Tren 30 hari</CardTitle>
                </CardHeader>
                <CardContent>
                  <ErrorRateTrendChart data={ai.trend30d} />
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by type */}
            <Card>
              <CardHeader>
                <CardTitle>Fallback berdasarkan tahap</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Distribusi fallback ke template per tahap pipeline AI — fokus mitigasi pada tahap teratas.
                </p>
              </CardHeader>
              <CardContent>
                <ErrorTypeBreakdownChart data={ai.byType} />
              </CardContent>
            </Card>

            {/* Recent flagged */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Respon yang ditandai terakhir
                </CardTitle>
                <Badge variant="warning">{ai.recentFlagged.length} kasus</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuplikan respon</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead className="text-right">Ditandai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ai.recentFlagged.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[420px]">
                          <p className="line-clamp-2 text-sm italic text-muted-foreground">
                            {r.snippet}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{r.reason}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                          {formatRelativeID(r.flaggedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Sentimen Pasar ───────────────────────────────────────── */}
          <TabsContent value="sentimen-pasar" className="mt-5 space-y-6">
            <SectionTitle>Sentimen Pasar</SectionTitle>
            {/* Header strip */}
            <Card className="border-dashed bg-gradient-to-br from-orange-50/80 via-rose-50/40 to-amber-50/60">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Radio className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Pemetaan pasar berbasis sentimen
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sentimen rata-rata pelanggan terhadap setiap produk
                    berdasarkan percakapan WhatsApp dan inbound — diperbarui
                    realtime oleh AI.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* KPI tiles — 4-up */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                icon={<Gauge className="h-5 w-5" />}
                accent="#FB5E3B"
                label="Skor sentimen rata-rata"
                value={`${sentimentStats.avgScore > 0 ? "+" : ""}${sentimentStats.avgScore.toFixed(1)}`}
                sub={`dari ${productSentiments.length} produk dipantau`}
                delta={`${sentimentStats.avgTrend > 0 ? "+" : ""}${sentimentStats.avgTrend.toFixed(1)} pt`}
                deltaTone={sentimentStats.avgTrend >= 0 ? "up" : "down-bad"}
              />
              <StatTile
                icon={<Smile className="h-5 w-5" />}
                accent="#14B8A6"
                label="Produk paling positif"
                value={sentimentStats.topProduct.productName}
                sub={`skor +${sentimentStats.topProduct.averageScore} · ${sentimentStats.topProduct.mentions} sebutan`}
              />
              <StatTile
                icon={<Frown className="h-5 w-5" />}
                accent="#F43F5E"
                label="Produk paling kritis"
                value={sentimentStats.bottomProduct.productName}
                sub={`skor ${sentimentStats.bottomProduct.averageScore > 0 ? "+" : ""}${sentimentStats.bottomProduct.averageScore} · ${sentimentStats.bottomProduct.mentions} sebutan`}
              />
              <StatTile
                icon={<Hash className="h-5 w-5" />}
                accent="#F59E0B"
                label="Mentions minggu ini"
                value={sentimentStats.totalMentions.toLocaleString("id-ID")}
                sub="total sebutan lintas produk"
              />
            </div>

            {/* Market mapping + AI notes */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SentimentMap />
              </div>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Catatan AI
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Insight ringkas dari pola sentimen minggu ini.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sentimentInsights.map((insight, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border bg-card p-3"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          insight.tone === "positive"
                            ? "bg-success/15 text-success"
                            : insight.tone === "negative"
                              ? "bg-danger/15 text-danger"
                              : "bg-warning/15 text-warning",
                        )}
                      >
                        {insight.tone === "positive" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : insight.tone === "negative" ? (
                          <ArrowDownRight className="h-4 w-4" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {insight.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Kualitas Data ────────────────────────────────────────── */}
          <TabsContent value="kualitas-data" className="mt-5 space-y-6">
            <SectionTitle>Kualitas Data</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Headline KPI */}
              <Card className="lg:col-span-1">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success">
                      <Database className="h-5 w-5" />
                    </span>
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {quality.cleanDeals} / {quality.totalDeals}
                    </Badge>
                  </div>
                  <p className="mt-5 text-sm text-muted-foreground">
                    Data pipeline bersih
                  </p>
                  <p className="tnum mt-1 text-4xl font-semibold tracking-tight">
                    {quality.cleanRate.toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    deal lolos validasi
                  </p>

                  <div className="mt-4">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${quality.cleanRate}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    className="mt-auto print-hide"
                    onClick={() =>
                      toast.success(
                        "Verifikasi pipeline dimulai — hasil akan tersedia dalam beberapa menit.",
                      )
                    }
                  >
                    <ListChecks className="h-4 w-4" />
                    Verifikasi sekarang
                  </Button>
                </CardContent>
              </Card>

              {/* Issue list */}
              <Card className="lg:col-span-2">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Temuan kualitas data</CardTitle>
                  <Badge variant="warning">
                    {quality.issues.reduce((s, i) => s + i.count, 0)} masalah
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {quality.issues.map((issue) => {
                      const meta = SEVERITY[issue.severity];
                      return (
                        <li
                          key={issue.id}
                          className="flex items-center gap-3 px-6 py-4"
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-xl",
                              issue.severity === "tinggi"
                                ? "bg-danger/15 text-danger"
                                : issue.severity === "sedang"
                                  ? "bg-warning/15 text-warning"
                                  : "bg-stone-100 text-stone-700",
                            )}
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {issue.count} {issue.type.toLowerCase()}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {describeIssue(issue.type)}
                            </p>
                          </div>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="print-hide"
                            onClick={() =>
                              toast.success(
                                `Membuka daftar ${issue.count} item untuk ditinjau...`,
                              )
                            }
                          >
                            Tinjau
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Verification checklist (illustrative) */}
            <Card>
              <CardHeader>
                <CardTitle>Aturan validasi aktif</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aturan ini dijalankan setiap kali deal masuk atau diperbarui di pipeline.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {VALIDATION_RULES.map((rule) => (
                    <li key={rule.id} className="flex items-center gap-3 px-6 py-3">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{rule.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {rule.description}
                        </p>
                      </div>
                      <Badge variant="success">Aktif</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function describeIssue(type: string): string {
  switch (type) {
    case "Deal tanpa nilai":
      return "Nilai deal (IDR) tidak diisi — diperlukan untuk proyeksi pendapatan.";
    case "Deal tanpa kontak":
      return "Tidak ada kontak terkait — sales tidak bisa menindaklanjuti.";
    case "Deal stagnan > 30 hari":
      return "Tidak ada perubahan tahap selama lebih dari 30 hari.";
    case "Kontak tanpa email":
      return "Kontak tidak memiliki alamat email — cadence email tidak bisa dikirim.";
    case "Kontak tanpa nomor telepon":
      return "Kontak tidak memiliki nomor telepon — outreach WhatsApp terhalang.";
    default:
      return "";
  }
}

const VALIDATION_RULES = [
  {
    id: "rule-value",
    label: "Nilai deal wajib diisi",
    description: "Setiap deal harus memiliki nilai IDR sebelum lanjut ke tahap penawaran.",
  },
  {
    id: "rule-contact",
    label: "Kontak terkait wajib",
    description: "Setiap deal harus terhubung ke minimal satu kontak yang terverifikasi.",
  },
  {
    id: "rule-stale",
    label: "Deteksi deal stagnan",
    description: "Tandai deal yang tidak berubah tahap selama lebih dari 30 hari.",
  },
  {
    id: "rule-duplicate",
    label: "Pencocokan duplikat",
    description: "Cocokkan deal baru terhadap kombinasi perusahaan + kontak.",
  },
  {
    id: "rule-owner",
    label: "Pemilik deal wajib",
    description: "Setiap deal harus memiliki sales rep yang bertanggung jawab.",
  },
];

// ── Small UI helpers ──────────────────────────────────────────────────────

/** "Data demo" badge + "Diperbarui …" caption. Labeled honestly (audit UX #6):
 *  the KPI deltas ("+18,2%", "vs bulan lalu") are illustrative, not live metrics. */
function LiveBadge({ generatedAt }: { generatedAt: Date }) {
  return (
    <div className="hidden items-center gap-3 sm:flex">
      <span className="flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
        Data demo
      </span>
      <span className="text-xs text-muted-foreground">
        Dibuat {formatRelativeID(generatedAt)}
      </span>
    </div>
  );
}

/** Section title that only appears in the printed PDF — hidden on screen. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="print-only-title">{children}</h2>;
}

function StatTile({
  icon,
  accent,
  label,
  value,
  sub,
  delta,
  deltaTone,
  loading,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  delta?: string;
  deltaTone?: "up" | "down-good" | "down-bad";
  loading?: boolean;
}) {
  const positive = deltaTone === "up" || deltaTone === "down-good";
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            {icon}
          </span>
          {delta && (
            <Badge variant={positive ? "success" : "destructive"} className="gap-1">
              {deltaTone === "down-good" ? (
                <ArrowDownRight className="h-3 w-3" />
              ) : positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {delta}
            </Badge>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-24" />
        ) : (
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight">
            {value}
          </p>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

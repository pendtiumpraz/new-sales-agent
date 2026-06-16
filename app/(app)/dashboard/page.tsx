"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  Rocket,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedHeroBg } from "@/components/dashboard/animated-hero-bg";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { useCountUp } from "@/components/dashboard/use-count-up";
import {
  useActivity,
  useCadences,
  useConversations,
  useDeals,
  useTasks,
} from "@/lib/api-mock/hooks";
import type { DealStage } from "@/lib/types";
import { formatIDR, formatIDRCompact } from "@/lib/utils/format-idr";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

const PipelineStageChart = dynamic(
  () =>
    import("@/components/dashboard/pipeline-stage-chart").then(
      (m) => m.PipelineStageChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> },
);

const STAGE_ORDER: DealStage[] = [
  "prospek",
  "kualifikasi",
  "penawaran",
  "negosiasi",
  "tutup",
];

const STAGE_LABEL: Record<DealStage, string> = {
  prospek: "Prospek",
  kualifikasi: "Kualifikasi",
  penawaran: "Penawaran",
  negosiasi: "Negosiasi",
  tutup: "Tutup",
};
// Coral → teal ramp (primary → tertiary)
const FUNNEL_FILL = ["#FB5E3B", "#F6845C", "#D9A98E", "#86C7BE", "#14B8A6"];

const PRIORITY: Record<string, "destructive" | "warning" | "muted"> = {
  tinggi: "destructive",
  sedang: "warning",
  rendah: "muted",
};

const CHANNEL_FILTERS = [
  { key: "all", label: "Semua" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "instagram", label: "Instagram" },
  { key: "tokopedia", label: "Tokopedia" },
] as const;

type ChannelKey = (typeof CHANNEL_FILTERS)[number]["key"];

// Fixed "today" matches the data seed so KPIs stay deterministic.
const NOW = new Date("2026-05-25T10:00:00+07:00").getTime();
const WEEK_AHEAD = NOW + 7 * 864e5;

export default function DashboardPage() {
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: conversations } = useConversations();
  const { data: cadences } = useCadences();
  const { data: tasks } = useTasks();
  const { data: activity } = useActivity();
  const [done, setDone] = useState<Set<string>>(new Set());
  // Tracks tasks just-completed so the row can briefly flash success-green.
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<ChannelKey>("all");

  // ── Channel-filtered slices ────────────────────────────────────────────
  // Every section below derives from these — flipping the channel re-renders
  // the hero, KPI tiles, tasks, funnel, and activity feed.
  const filtered = useMemo(() => {
    const isAll = channel === "all";
    const f = {
      deals: (deals ?? []).filter(
        (d) => isAll || d.sourceChannel === channel,
      ),
      conversations: (conversations ?? []).filter(
        (c) => isAll || c.channel === channel,
      ),
      cadences: (cadences ?? []).filter(
        (c) => isAll || c.channelMix.includes(channel as never),
      ),
      tasks: (tasks ?? []).filter((t) => isAll || t.channel === channel),
      activity: (activity ?? []).filter((a) => isAll || a.channel === channel),
    };
    return f;
  }, [deals, conversations, cadences, tasks, activity, channel]);

  // ── KPIs derived from the filtered slices ──────────────────────────────
  const kpi = useMemo(() => {
    const openDeals = filtered.deals.filter((d) => d.stage !== "tutup");
    const pipelineValue = openDeals.reduce((s, d) => s + d.value, 0);
    const closing = filtered.deals.filter(
      (d) => +new Date(d.expectedClose) <= WEEK_AHEAD && d.stage !== "tutup",
    );
    const closingValue = closing.reduce((s, d) => s + d.value, 0);

    const activeCadences = filtered.cadences.filter((c) => c.status === "active");
    const enrolled = activeCadences.reduce((s, c) => s + c.enrolled, 0);

    // Response rate from the filtered conversations — replied = unread 0.
    // For "all" this is across every channel; for a specific channel it's the
    // share of conversations on that channel without unread messages.
    const totalConvos = filtered.conversations.length;
    const replied = filtered.conversations.filter((c) => c.unread === 0).length;
    const responseRate =
      totalConvos > 0 ? Math.round((replied / totalConvos) * 100) : 0;
    const unanswered = filtered.conversations.reduce(
      (s, c) => s + c.unread,
      0,
    );

    const funnel = STAGE_ORDER.map((stage) => ({
      stage,
      count: filtered.deals.filter((d) => d.stage === stage).length,
      value: filtered.deals
        .filter((d) => d.stage === stage)
        .reduce((s, d) => s + d.value, 0),
    }));

    return {
      pipelineValue,
      pipelineChange: 12.4, // mocked trend — same regardless of slice
      closingCount: closing.length,
      closingValue,
      responseRate,
      unanswered,
      activeCadences: activeCadences.length,
      enrolled,
      funnel,
      totalConvos,
    };
  }, [filtered]);

  const taskHref = (ch: string) => {
    const convo = (conversations ?? []).find((c) => c.channel === ch);
    return convo ? `/inbox/${convo.id}` : "/inbox";
  };

  const funnelData =
    kpi.funnel.map((f, i) => ({
      label: STAGE_LABEL[f.stage],
      value: f.count,
      fill: FUNNEL_FILL[i],
    })) ?? [];

  const totalDeals = kpi.funnel.reduce((s, f) => s + f.count, 0);
  const activeLabel = CHANNEL_FILTERS.find((f) => f.key === channel)?.label;
  const isAll = channel === "all";

  // Per-channel labels keep the KPI tile copy honest.
  const responseLabel =
    channel === "whatsapp"
      ? "Respon WhatsApp"
      : channel === "email"
        ? "Respon Email"
        : channel === "instagram"
          ? "Respon Instagram"
          : channel === "tokopedia"
            ? "Pesanan Tokopedia"
            : "Respon pelanggan";
  const responseAccent =
    channel === "whatsapp"
      ? "#25D366"
      : channel === "email"
        ? "#6366F1"
        : channel === "instagram"
          ? "#E1306C"
          : channel === "tokopedia"
            ? "#03AC0E"
            : "#14B8A6";

  // Animated counters — drive every KPI number on the page.
  const pipelineCount = useCountUp(kpi.pipelineValue, 900);
  const closingValueCount = useCountUp(kpi.closingValue, 900);
  const closingCountAnim = useCountUp(kpi.closingCount);
  const responseRateAnim = useCountUp(kpi.responseRate);
  const totalConvosAnim = useCountUp(kpi.totalConvos);
  const unansweredAnim = useCountUp(kpi.unanswered);
  const activeCadencesAnim = useCountUp(kpi.activeCadences);
  const enrolledAnim = useCountUp(kpi.enrolled);

  return (
    <div>
      <PageHeader title="Dasbor" description="Ringkasan performa sales tim Anda hari ini.">
        <Button asChild>
          <Link href="/cadences/new">
            <Workflow className="h-4 w-4" />
            Buat cadence
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* First-run setup checklist (auto-hides when complete or dismissed) */}
        <OnboardingChecklist />

        {/* Channel quick filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CHANNEL_FILTERS.map((f) => {
            const isActive = channel === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setChannel(f.key)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)]"
                    : "bg-card text-muted-foreground hover:-translate-y-px hover:text-foreground hover:shadow-sm",
                )}
              >
                {/* Soft coral pulse ring on the active chip. */}
                {isActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-0 rounded-full ring-2 ring-primary/40 animate-[pulse_2.4s_ease-in-out_infinite]"
                  />
                )}
                {f.key !== "all" && <ChannelDot channel={f.key} size={8} />}
                <span className="relative z-10">{f.label}</span>
              </button>
            );
          })}
          <AnimatePresence initial={false}>
            {!isAll && (
              <motion.span
                key={channel}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="ml-1"
              >
                <Badge variant="secondary" className="gap-1.5 text-[11px]">
                  <ChannelDot channel={channel} size={7} />
                  Memfilter ke {activeLabel}
                </Badge>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Autopilot AI hero CTA — the headline feature, surfaced front-and-center */}
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/10 via-tertiary/8 to-transparent">
          <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Rocket className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                    Autopilot AI
                  </h2>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Baru
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Dari pemilihan audiens hingga booking meeting — satu klik, AI menjalankan seluruh pipeline.
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/autopilot">
                <Rocket className="h-4 w-4" />
                Mulai Autopilot
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Band 1: hero + stat cluster */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Pipeline hero — animated mesh gradient backdrop */}
          <Card className="relative overflow-hidden lg:col-span-5">
            <AnimatedHeroBg />
            <CardContent className="relative z-10 flex h-full flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <Badge variant="success" className="gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  +{kpi.pipelineChange}%
                </Badge>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Nilai Pipeline{!isAll ? ` · ${activeLabel}` : ""}
              </p>
              {dealsLoading ? (
                <Skeleton className="mt-1 h-10 w-44" />
              ) : (
                <p className="tnum mt-1 text-4xl font-semibold tracking-tight">
                  {formatIDRCompact(Math.round(pipelineCount))}
                </p>
              )}
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {Math.round(closingCountAnim)} deal closing minggu ini ·{" "}
                {formatIDR(Math.round(closingValueCount))}
              </p>

              {/* Stage distribution mini-bar — segments grow in from 0 width. */}
              <div className="mt-auto pt-6">
                {totalDeals === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Tidak ada deal aktif di channel ini.
                  </p>
                ) : (
                  <>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
                      {funnelData.map((f, i) => {
                        const pct = (f.value / totalDeals) * 100;
                        return (
                          <StageSegment
                            key={`${channel}-${i}-${f.label}`}
                            pct={pct}
                            fill={f.fill}
                            title={`${f.label}: ${f.value}`}
                            delay={i * 0.08}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {funnelData.map((f, i) => (
                        <span key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.fill }} />
                          {f.label} {f.value}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stat cluster (2x2) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            <StatTile
              loading={dealsLoading}
              icon={<MessageCircle className="h-5 w-5" />}
              accent={responseAccent}
              label={responseLabel}
              value={
                kpi.totalConvos > 0
                  ? channel === "tokopedia"
                    ? `${Math.round(totalConvosAnim)}`
                    : `${Math.round(responseRateAnim)}%`
                  : "—"
              }
              sub={
                kpi.totalConvos > 0
                  ? `${Math.round(unansweredAnim)} belum dibalas`
                  : "Tidak ada percakapan di channel ini"
              }
            />
            <StatTile
              loading={dealsLoading}
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="#14B8A6"
              label={isAll ? "Closing minggu ini" : `Closing · ${activeLabel}`}
              value={`${Math.round(closingCountAnim)}`}
              sub={formatIDR(Math.round(closingValueCount))}
            />
            <StatTile
              loading={dealsLoading}
              icon={<Workflow className="h-5 w-5" />}
              accent="#F59E0B"
              label={isAll ? "Cadence aktif" : `Cadence · ${activeLabel}`}
              value={`${Math.round(activeCadencesAnim)}`}
              sub={`${Math.round(enrolledAnim)} kontak terdaftar`}
            />
            <StatTile
              loading={dealsLoading}
              icon={<Users className="h-5 w-5" />}
              accent="#FB5E3B"
              label="Kontak dalam cadence"
              value={`${Math.round(enrolledAnim)}`}
              sub={isAll ? "lintas semua channel" : `via ${activeLabel}`}
            />
          </div>
        </div>

        {/* Band 2: tasks + funnel */}
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                Tugas hari ini{!isAll ? ` · ${activeLabel}` : ""}
              </CardTitle>
              <Badge variant="secondary">
                {(filtered.tasks.length ?? 0) - done.size} tersisa
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.tasks.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Tidak ada tugas untuk channel ini.
                </p>
              ) : (
                <ul className="divide-y">
                  {filtered.tasks.map((task) => {
                    const isDone = done.has(task.id);
                    const isFlashing = flashing.has(task.id);
                    return (
                      <li
                        key={task.id}
                        className={cn(
                          "flex items-center gap-3 px-6 py-3 transition-colors duration-500",
                          isFlashing
                            ? "bg-emerald-100/70"
                            : "hover:bg-muted/40",
                        )}
                      >
                        <motion.div whileTap={{ scale: 0.86 }} className="flex">
                          <Checkbox
                            checked={isDone}
                            onCheckedChange={() => {
                              setDone((prev) => {
                                const next = new Set(prev);
                                if (next.has(task.id)) {
                                  next.delete(task.id);
                                } else {
                                  next.add(task.id);
                                  // Trigger the success-green flash; clear it
                                  // after the CSS fade-out completes.
                                  setFlashing((fprev) => {
                                    const fnext = new Set(fprev);
                                    fnext.add(task.id);
                                    return fnext;
                                  });
                                  window.setTimeout(() => {
                                    setFlashing((fprev) => {
                                      const fnext = new Set(fprev);
                                      fnext.delete(task.id);
                                      return fnext;
                                    });
                                  }, 600);
                                }
                                return next;
                              });
                            }}
                          />
                        </motion.div>
                        <Link href={taskHref(task.channel)} className="flex min-w-0 flex-1 items-center gap-3">
                          <ChannelDot channel={task.channel} size={8} />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-sm font-medium transition-colors duration-300",
                                isDone && "text-muted-foreground line-through",
                              )}
                            >
                              {task.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{task.contactName}</p>
                          </div>
                        </Link>
                        <Badge variant={PRIORITY[task.priority]}>{task.priority}</Badge>
                        <span className="hidden w-20 text-right text-xs text-muted-foreground sm:block">
                          {task.due}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>
                Deal per tahap{!isAll ? ` · ${activeLabel}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dealsLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : totalDeals === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  Tidak ada deal aktif di channel ini.
                </div>
              ) : (
                // key forces a fresh entrance animation when the filter changes
                <PipelineStageChart key={channel} data={funnelData} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Band 3: activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              Aktivitas terbaru{!isAll ? ` · ${activeLabel}` : ""}
            </CardTitle>
            {!isAll && (
              <Badge variant="secondary" className="gap-1.5">
                <ChannelDot channel={channel} size={8} />
                {activeLabel}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {filtered.activity.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Tidak ada aktivitas untuk channel ini.
              </p>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.ul
                  key={channel}
                  className="divide-y"
                  initial="hidden"
                  animate="show"
                  exit="hidden"
                >
                  {filtered.activity.map((a, i) => (
                    <ActivityRow key={a.id} index={i}>
                      <UserAvatar
                        name={a.actor}
                        className="h-8 w-8 ring-0 ring-primary/0 transition-shadow duration-300 hover:ring-2 hover:ring-primary/40 hover:animate-[pulse_2s_ease-in-out_infinite]"
                      />
                      <p className="flex-1 text-sm">
                        <span className="font-medium">{a.actor}</span>{" "}
                        <span className="text-muted-foreground">{a.action}</span>{" "}
                        <span className="font-medium">{a.target}</span>
                      </p>
                      {a.channel && <ChannelDot channel={a.channel} size={8} />}
                      <span className="w-24 text-right text-xs text-muted-foreground">
                        {formatRelativeID(a.timestamp)}
                      </span>
                    </ActivityRow>
                  ))}
                </motion.ul>
              </AnimatePresence>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

/**
 * Single segment of the pipeline stage distribution bar. Width animates from
 * 0% → `pct`% on mount with a tasteful stagger driven by `delay`.
 */
function StageSegment({
  pct,
  fill,
  title,
  delay,
}: {
  pct: number;
  fill: string;
  title: string;
  delay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      title={title}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${pct}%` }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      style={{ backgroundColor: fill }}
    />
  );
}

/**
 * Activity feed row — fades + slides in from the right with a per-index
 * stagger. Skips animation for reduced-motion users.
 */
function ActivityRow({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className="flex items-center gap-3 px-6 py-3"
      initial={reduce ? false : { opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.32,
        ease: "easeOut",
        delay: reduce ? 0 : Math.min(index * 0.06, 0.6),
      }}
    >
      {children}
    </motion.li>
  );
}

/**
 * KPI tile — hover lifts ~4px with a coral glow, taps gently spring, the
 * accent icon swatch scales 1.05x on hover. All pure Tailwind transitions
 * so we don't pay a runtime motion cost on idle.
 */
function StatTile({
  icon,
  accent,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  sub: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card
      className={cn(
        "group cursor-default transition-all duration-200 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_8px_24px_-12px_rgba(251,94,59,0.45)] hover:ring-1 hover:ring-primary/15",
        "active:translate-y-0 active:scale-[0.98]",
      )}
    >
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-200 ease-out group-hover:scale-105"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            {icon}
          </span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary/60" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-20" />
        ) : (
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}


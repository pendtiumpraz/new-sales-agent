"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Rocket,
  TrendingUp,
  Workflow,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { KpiTile, KpiStrip } from "@/components/shared/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
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
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
  { key: "tokopedia", label: "Tokopedia" },
  { key: "shopee", label: "Shopee" },
  { key: "sms", label: "SMS" },
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
  const activeWs = useWorkspaceStore((s) => s.active);

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
    // "Closing minggu ini" = due in the NEXT 7 days. The old filter had no lower
    // bound, so every OVERDUE deal (expectedClose in the past) was counted as
    // closing this week. Overdue is now tracked separately.
    const closing = filtered.deals.filter((d) => {
      if (!d.expectedClose || d.stage === "tutup") return false;
      const t = +new Date(d.expectedClose); // guard: null/invalid date must not coerce to 1970
      return !Number.isNaN(t) && t >= NOW && t <= WEEK_AHEAD;
    });
    const closingValue = closing.reduce((s, d) => s + d.value, 0);
    const overdueCount = filtered.deals.filter((d) => {
      if (!d.expectedClose || d.stage === "tutup") return false;
      const t = +new Date(d.expectedClose);
      return !Number.isNaN(t) && t < NOW;
    }).length;

    const activeCadences = filtered.cadences.filter((c) => c.status === "active");
    const enrolled = activeCadences.reduce((s, c) => s + c.enrolled, 0);

    // Read-through, not reply rate: `unread` is a read-receipt (unread INBOUND
    // messages), so this is the share of conversations with nothing left unread,
    // and `unread` count = messages still needing attention. Labelled "Dibaca"
    // accordingly — a true reply rate would need the message log this view
    // doesn't load.
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
      overdueCount,
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

  // Per-channel labels keep the KPI tile copy honest. This tile measures
  // read-through (no unread inbound left), not a reply rate — hence "Dibaca".
  const responseLabel =
    channel === "whatsapp"
      ? "Dibaca WhatsApp"
      : channel === "email"
        ? "Dibaca Email"
        : channel === "instagram"
          ? "Dibaca Instagram"
          : channel === "tokopedia"
            ? "Pesanan Tokopedia"
            : "Dibaca pelanggan";
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
      <PageHeader
        title="Dashboard"
        description={`Ringkasan hari ini${activeWs ? ` · Workspace: ${activeWs.name}` : ""}`}
      >
        <Select value={channel} onValueChange={(v) => setChannel(v as ChannelKey)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.key === "all" ? "Semua channel" : f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild>
          <Link href="/autopilot">
            <Rocket className="h-4 w-4" />
            Mulai Autopilot
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* First-run setup checklist (auto-hides when complete or dismissed) */}
        <OnboardingChecklist />

        {/* KPI strip — pipeline · closing · read-through · cadence (maks 4) */}
        <KpiStrip>
          <KpiTile
            loading={dealsLoading}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="#FB5E3B"
            label={isAll ? "Nilai pipeline" : `Pipeline · ${activeLabel}`}
            value={formatIDRCompact(Math.round(pipelineCount))}
            sub={`${totalDeals} deal di funnel`}
          />
          <KpiTile
            loading={dealsLoading}
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="#14B8A6"
            label={isAll ? "Closing minggu ini" : `Closing · ${activeLabel}`}
            value={`${Math.round(closingCountAnim)}`}
            sub={
              kpi.overdueCount > 0
                ? `${formatIDR(Math.round(closingValueCount))} · ${kpi.overdueCount} lewat tempo`
                : formatIDR(Math.round(closingValueCount))
            }
          />
          <KpiTile
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
                ? `${Math.round(unansweredAnim)} belum dibaca`
                : "Tidak ada percakapan di channel ini"
            }
          />
          <KpiTile
            loading={dealsLoading}
            icon={<Workflow className="h-5 w-5" />}
            accent="#F59E0B"
            label={isAll ? "Cadence aktif" : `Cadence · ${activeLabel}`}
            value={`${Math.round(activeCadencesAnim)}`}
            sub={`${Math.round(enrolledAnim)} kontak terdaftar`}
          />
        </KpiStrip>

        {/* Band 2: tasks + funnel */}
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                Tugas prioritas hari ini{!isAll ? ` · ${activeLabel}` : ""}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {(filtered.tasks.length ?? 0) - done.size} tersisa
                </Badge>
                <Link href="/inbox" className="text-xs font-medium text-primary hover:underline">
                  Lihat semua
                </Link>
              </div>
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
                            ? "bg-success/15"
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
                        <span className="hidden w-16 text-right text-xs text-muted-foreground sm:block">
                          {task.due}
                        </span>
                        <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2.5">
                          <Link href={taskHref(task.channel)}>Buka</Link>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                Funnel pipeline{!isAll ? ` · ${activeLabel}` : ""}
              </CardTitle>
              <Link href="/pipeline" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Pipeline <ArrowRight className="h-3.5 w-3.5" />
              </Link>
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
            <div className="flex items-center gap-2">
              {!isAll && (
                <Badge variant="secondary" className="gap-1.5">
                  <ChannelDot channel={channel} size={8} />
                  {activeLabel}
                </Badge>
              )}
              <Link href="/reports" className="text-xs font-medium text-primary hover:underline">
                Lihat semua
              </Link>
            </div>
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



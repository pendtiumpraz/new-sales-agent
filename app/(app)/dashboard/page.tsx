"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useActivity,
  useConversations,
  useDashboard,
  useTasks,
} from "@/lib/api-mock/hooks";
import { formatIDR, formatIDRCompact } from "@/lib/utils/format-idr";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

const PipelineFunnel = dynamic(
  () => import("@/components/dashboard/pipeline-funnel").then((m) => m.PipelineFunnel),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> },
);

const STAGE_LABEL: Record<string, string> = {
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
];

export default function DashboardPage() {
  const { data: kpi, isLoading } = useDashboard();
  const { data: tasks } = useTasks();
  const { data: activity } = useActivity();
  const { data: conversations } = useConversations();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState("all");

  const taskHref = (ch: string) => {
    const convo = conversations?.find((c) => c.channel === ch);
    return convo ? `/inbox/${convo.id}` : "/inbox";
  };

  const funnelData =
    kpi?.funnel.map((f, i) => ({
      label: STAGE_LABEL[f.stage],
      value: f.count,
      fill: FUNNEL_FILL[i],
    })) ?? [];

  const totalDeals = kpi?.funnel.reduce((s, f) => s + f.count, 0) ?? 0;
  const filteredActivity = (activity ?? []).filter(
    (a) => channel === "all" || a.channel === channel,
  );

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
        {/* Channel quick filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setChannel(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                channel === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.key !== "all" && <ChannelDot channel={f.key} size={8} />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Band 1: hero + stat cluster */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Pipeline hero */}
          <Card className="overflow-hidden lg:col-span-5">
            <CardContent className="flex h-full flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <Badge variant="success" className="gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  +{kpi?.pipelineChange ?? 0}%
                </Badge>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">Nilai Pipeline</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-10 w-44" />
              ) : (
                <p className="tnum mt-1 text-4xl font-semibold tracking-tight">
                  {formatIDRCompact(kpi?.pipelineValue ?? 0)}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {kpi?.closingCount ?? 0} deal closing minggu ini ·{" "}
                {kpi ? formatIDR(kpi.closingValue) : ""}
              </p>

              {/* Stage distribution mini-bar */}
              <div className="mt-auto pt-6">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                  {funnelData.map((f, i) => (
                    <div
                      key={i}
                      title={`${f.label}: ${f.value}`}
                      style={{
                        width: `${totalDeals ? (f.value / totalDeals) * 100 : 0}%`,
                        backgroundColor: f.fill,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {funnelData.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.fill }} />
                      {f.label} {f.value}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stat cluster (2x2) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            <StatTile
              loading={isLoading}
              icon={<MessageCircle className="h-5 w-5" />}
              accent="#25D366"
              label="Respon WhatsApp"
              value={kpi ? `${kpi.waResponseRate}%` : ""}
              sub={`${kpi?.waUnanswered ?? 0} belum dibalas`}
            />
            <StatTile
              loading={isLoading}
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="#14B8A6"
              label="Closing minggu ini"
              value={kpi ? `${kpi.closingCount}` : ""}
              sub={kpi ? formatIDR(kpi.closingValue) : ""}
            />
            <StatTile
              loading={isLoading}
              icon={<Workflow className="h-5 w-5" />}
              accent="#F59E0B"
              label="Cadence aktif"
              value={kpi ? `${kpi.activeCadences}` : ""}
              sub={`${kpi?.enrolled ?? 0} kontak terdaftar`}
            />
            <StatTile
              loading={isLoading}
              icon={<Users className="h-5 w-5" />}
              accent="#3B82F6"
              label="Kontak dalam cadence"
              value={kpi ? `${kpi.enrolled}` : ""}
              sub="lintas semua channel"
            />
          </div>
        </div>

        {/* Band 2: tasks + funnel */}
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Tugas hari ini</CardTitle>
              <Badge variant="secondary">{(tasks?.length ?? 0) - done.size} tersisa</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {(tasks ?? []).map((task) => {
                  const isDone = done.has(task.id);
                  return (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={() =>
                          setDone((prev) => {
                            const next = new Set(prev);
                            if (next.has(task.id)) next.delete(task.id);
                            else next.add(task.id);
                            return next;
                          })
                        }
                      />
                      <Link href={taskHref(task.channel)} className="flex min-w-0 flex-1 items-center gap-3">
                        <ChannelDot channel={task.channel} size={8} />
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-medium", isDone && "text-muted-foreground line-through")}>
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
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Funnel Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-[280px] w-full" /> : <PipelineFunnel data={funnelData} />}
            </CardContent>
          </Card>
        </div>

        {/* Band 3: activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Aktivitas terbaru</CardTitle>
            {channel !== "all" && (
              <Badge variant="secondary" className="gap-1.5">
                <ChannelDot channel={channel} size={8} />
                {CHANNEL_FILTERS.find((f) => f.key === channel)?.label}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {filteredActivity.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Tidak ada aktivitas untuk channel ini.
              </p>
            ) : (
              <ul className="divide-y">
                {filteredActivity.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-6 py-3">
                    <UserAvatar name={a.actor} className="h-8 w-8" />
                    <p className="flex-1 text-sm">
                      <span className="font-medium">{a.actor}</span>{" "}
                      <span className="text-muted-foreground">{a.action}</span>{" "}
                      <span className="font-medium">{a.target}</span>
                    </p>
                    {a.channel && <ChannelDot channel={a.channel} size={8} />}
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      {formatRelativeID(a.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            {icon}
          </span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30" />
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

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  TrendingUp,
  Workflow,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
// Pink → aqua ramp uses both brand accents (primary + tertiary)
const FUNNEL_FILL = ["#ffbcd9", "#e7aacf", "#c2c0cf", "#9ad8d2", "#87fff0"];

const PRIORITY: Record<string, "destructive" | "warning" | "muted"> = {
  tinggi: "destructive",
  sedang: "warning",
  rendah: "muted",
};

export default function DashboardPage() {
  const { data: kpi, isLoading } = useDashboard();
  const { data: tasks } = useTasks();
  const { data: activity } = useActivity();
  const { data: conversations } = useConversations();
  const [done, setDone] = useState<Set<string>>(new Set());

  // Link each task to the first conversation on its channel (demo step 4).
  const taskHref = (channel: string) => {
    const convo = conversations?.find((c) => c.channel === channel);
    return convo ? `/inbox/${convo.id}` : "/inbox";
  };

  const funnelData =
    kpi?.funnel.map((f, i) => ({
      label: STAGE_LABEL[f.stage],
      value: f.count,
      fill: FUNNEL_FILL[i],
    })) ?? [];

  return (
    <div>
      <PageHeader
        title="Dasbor"
        description="Ringkasan performa sales tim Anda hari ini."
      >
        <Button asChild>
          <Link href="/cadences/new">
            <Workflow className="h-4 w-4" />
            Buat cadence
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            loading={isLoading}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="#87fff0"
            label="Nilai Pipeline"
            value={kpi ? formatIDRCompact(kpi.pipelineValue) : ""}
            sub={
              <span className="text-tertiary">
                +{kpi?.pipelineChange}% vs bulan lalu
              </span>
            }
          />
          <KpiCard
            loading={isLoading}
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="#3B82F6"
            label="Closing minggu ini"
            value={kpi ? `${kpi.closingCount} deal` : ""}
            sub={kpi ? formatIDR(kpi.closingValue) : ""}
          />
          <KpiCard
            loading={isLoading}
            icon={<MessageCircle className="h-5 w-5" />}
            accent="#25D366"
            label="Respon WhatsApp"
            value={kpi ? `${kpi.waResponseRate}%` : ""}
            sub={`${kpi?.waUnanswered ?? 0} percakapan belum dibalas`}
          />
          <KpiCard
            loading={isLoading}
            icon={<Workflow className="h-5 w-5" />}
            accent="#6366F1"
            label="Cadence aktif"
            value={kpi ? `${kpi.activeCadences}` : ""}
            sub={`${kpi?.enrolled ?? 0} kontak dalam cadence`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tasks */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Tugas hari ini</CardTitle>
              <Badge variant="secondary">
                {(tasks?.length ?? 0) - done.size} tersisa
              </Badge>
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
                      <Link
                        href={taskHref(task.channel)}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <ChannelDot channel={task.channel} size={8} />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm font-medium",
                              isDone && "text-muted-foreground line-through",
                            )}
                          >
                            {task.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {task.contactName}
                          </p>
                        </div>
                      </Link>
                      <Badge variant={PRIORITY[task.priority]}>{task.priority}</Badge>
                      <span className="w-20 text-right text-xs text-muted-foreground">
                        {task.due}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Funnel Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
                <PipelineFunnel data={funnelData} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(activity ?? []).map((a) => (
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
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
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            {icon}
          </span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/40" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-28" />
        ) : (
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

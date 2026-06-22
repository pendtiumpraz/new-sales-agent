"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Handshake,
  Lock,
  Mail,
  Package,
  Radar,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  UserCircle2,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatRowSkeleton, ListSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { MarketFitPanel } from "@/components/workspaces/market-fit-panel";
import { SalesPlayPanel } from "@/components/workspaces/sales-play-panel";
import { WorkspaceDiscoveryPanel } from "@/components/workspaces/workspace-discovery-panel";
import { WorkspaceChatPanel } from "@/components/workspaces/workspace-chat-panel";
import { cn } from "@/lib/utils";
import type { WorkspaceType } from "@/lib/workspace/store";

interface LeadRow {
  id: string;
  fullName: string;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  leadType: string | null;
}
interface WorkspaceDetail {
  id: string;
  name: string;
  type: WorkspaceType;
  productId: string | null;
  targetSegment: string | null;
  status: string;
  ownerUserId: string;
  ownerName: string | null;
  leadCount: number;
  leads: LeadRow[];
}

const TYPE_META: Record<WorkspaceType, { label: string; icon: typeof Briefcase; cls: string }> = {
  lead_gen: { label: "Cari lead", icon: Target, cls: "bg-emerald-100 text-emerald-700" },
  partner: { label: "Cari partner", icon: Handshake, cls: "bg-blue-100 text-blue-700" },
  offering: { label: "Penawaran", icon: Package, cls: "bg-violet-100 text-violet-700" },
  retention: { label: "Follow-up retensi", icon: RefreshCw, cls: "bg-amber-100 text-amber-700" },
  custom: { label: "Lainnya", icon: Briefcase, cls: "bg-muted text-muted-foreground" },
};

export default function WorkspaceHubPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const r = await fetch(`/api/workspaces/${id}`);
      if (r.status === 404) throw new Error("notfound");
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: WorkspaceDetail };
    },
    retry: false,
  });

  const archive = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Workspace diarsipkan");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      router.push("/workspaces");
    },
    onError: () => toast.error("Gagal mengarsipkan (cek hak akses)"),
  });

  const ws = q.data?.data;

  // Gate the rest of the hub behind setup. MarketFitPanel owns the market-fit
  // query and reports whether a result exists (avoids a dual-query race).
  const [mfReady, setMfReady] = useState(false);
  const setupDone = !!ws?.productId && mfReady;

  if (q.isError) {
    return (
      <div>
        <PageHeader title="Workspace" />
        <div className="p-6">
          <EmptyState
            icon={Briefcase}
            title="Workspace tidak ditemukan"
            description="Workspace ini tidak ada atau bukan milikmu. Sales hanya bisa membuka workspace sendiri."
            action={
              <Button asChild variant="outline">
                <Link href="/workspaces">
                  <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const meta = ws ? TYPE_META[ws.type] ?? TYPE_META.custom : TYPE_META.custom;
  const TypeIcon = meta.icon;

  return (
    <div>
      <PageHeader title={ws?.name ?? "Memuat…"} description="Hub workspace — semua aktivitas sales fokus di sini (doc 44).">
        <Button asChild variant="ghost" size="sm">
          <Link href="/workspaces">
            <ArrowLeft className="h-4 w-4" /> Semua workspace
          </Link>
        </Button>
        {ws && (
          <Button variant="outline" size="sm" onClick={() => archive.mutate()} disabled={archive.isPending}>
            <Archive className="h-4 w-4" /> {archive.isPending ? "Mengarsipkan…" : "Arsipkan"}
          </Button>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        {q.isLoading || !ws ? (
          <div className="space-y-4"><StatRowSkeleton n={4} /><ListSkeleton rows={6} /></div>
        ) : (
          <>
            {/* Header card: type/product/target + owner + lead count */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <span className={"flex h-11 w-11 items-center justify-center rounded-xl " + meta.cls}>
                  <TypeIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold">{ws.name}</p>
                    <Badge variant="muted" className={meta.cls}>
                      {meta.label}
                    </Badge>
                    {ws.status === "archived" && (
                      <Badge variant="muted" className="bg-muted text-muted-foreground">
                        Diarsipkan
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {ws.targetSegment && (
                      <span className="inline-flex items-center gap-1">
                        <Target className="h-3 w-3" /> {ws.targetSegment}
                      </span>
                    )}
                    {ws.productId && (
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3 w-3" /> Produk terhubung
                      </span>
                    )}
                    {ws.ownerName && (
                      <span className="inline-flex items-center gap-1">
                        <UserCircle2 className="h-3 w-3" /> {ws.ownerName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {ws.leadCount} lead
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Setup stepper — Produk → Market-Fit → Discovery */}
            <MarketFitPanel workspaceId={id} productId={ws.productId} onSetupChange={setMfReady} />

            {/* Sales Play editor — alur & adab obrolan */}
            {setupDone ? (
              <>
                {/* Langkah 3 — Discovery (inline: tambah lead di sini) */}
                <WorkspaceDiscoveryPanel workspaceId={id} />

                {/* Langkah 4 — Sales Script */}
                <div className="space-y-1.5">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Langkah 4 — Sales Script (alur · adab · teknik · materi)
                  </p>
                  <SalesPlayPanel workspaceId={id} />
                </div>

                {/* Langkah 5 — Eksekusi (inline: chat lead di sini) */}
                <WorkspaceChatPanel workspaceId={id} leads={ws.leads} />

                {/* Lainnya — sekunder (di luar urutan utama) */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lainnya</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { href: `/contacts/profiles?workspace=${id}`, icon: Users, label: "Profil" },
                      { href: `/cadences?workspace=${id}`, icon: Mail, label: "Cadence" },
                      { href: `/pipeline?workspace=${id}`, icon: TrendingUp, label: "Pipeline" },
                    ].map((l) => {
                      const Icon = l.icon;
                      return (
                        <Link key={l.href} href={l.href} className="group block">
                          <Card className="h-full transition hover:border-primary/40 hover:shadow-md">
                            <CardContent className="flex items-center gap-2 p-3 text-sm">
                              <Icon className="h-4 w-4 text-muted-foreground" /> {l.label}
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Langkah 3–5 ke-lock sampai setup (1–2) selesai */}
                <FlowStep n={3} icon={Radar} title="Discovery — cari kontak" desc="Kebuka setelah setup (langkah 1–2) selesai." status="locked" />
                <FlowStep n={4} icon={Sparkles} title="Sales Script" desc="Kebuka setelah setup." status="locked" />
                <FlowStep n={5} icon={Send} title="Eksekusi — kirim & pantau" desc="Kebuka setelah ada lead." status="locked" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* Numbered, gated flow step — keeps the workspace pipeline in order (1→5). */
function FlowStep({
  n,
  icon: Icon,
  title,
  desc,
  status,
  href,
  cta,
}: {
  n: number;
  icon: typeof Radar;
  title: string;
  desc: string;
  status: "done" | "active" | "locked";
  href?: string;
  cta?: string;
}) {
  const done = status === "done";
  const locked = status === "locked";
  return (
    <Card className={cn("transition", locked && "opacity-60")}>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            done
              ? "bg-primary text-primary-foreground"
              : status === "active"
                ? "bg-primary/15 text-primary ring-2 ring-primary/30"
                : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <Check className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="h-4 w-4 text-primary" /> {title}
          </p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        {!locked && href && cta && (
          <Button asChild size="sm" variant={status === "active" ? "default" : "outline"}>
            <Link href={href}>
              {cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

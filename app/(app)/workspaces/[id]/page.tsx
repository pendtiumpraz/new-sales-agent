"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  Briefcase,
  Handshake,
  Inbox,
  Mail,
  Package,
  Radar,
  RefreshCw,
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

  // Scoped-flow quick links — carry the workspace id as ?workspace=<id>. The
  // target pages (discovery, profiles, cadences, inbox, pipeline) DO read this
  // param via useSearchParams and filter their data to this workspace.
  const flowLinks = ws
    ? [
        { href: `/contacts/discovery?workspace=${id}`, icon: Radar, label: "Discovery", desc: "Cari & crawl prospek baru" },
        { href: `/contacts/profiles?workspace=${id}`, icon: Users, label: "Profil", desc: "Kelola lead & kontak" },
        { href: `/cadences?workspace=${id}`, icon: Mail, label: "Cadence", desc: "Urutan outreach multi-channel" },
        { href: `/inbox?workspace=${id}`, icon: Inbox, label: "Inbox", desc: "Balasan omni-channel workspace ini" },
        { href: `/pipeline?workspace=${id}`, icon: TrendingUp, label: "Pipeline", desc: "Deal & tahap closing" },
      ]
    : [];

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
            <MarketFitPanel workspaceId={id} productId={ws.productId} />

            {/* Scoped flow quick links */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alur sales</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {flowLinks.map((l) => {
                  const Icon = l.icon;
                  return (
                    <Link key={l.href} href={l.href} className="group block">
                      <Card className="h-full transition hover:border-primary/40 hover:shadow-md">
                        <CardContent className="flex flex-col gap-2 p-4">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-medium">{l.label}</p>
                            <p className="text-[11px] text-muted-foreground">{l.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Leads scoped to this workspace */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lead di workspace ini ({ws.leads.length})
              </p>
              {ws.leads.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Belum ada lead"
                  description="Lead yang di-assign ke workspace ini akan muncul di sini. Mulai dari Discovery untuk menambah prospek."
                  action={
                    <Button asChild>
                      <Link href={`/contacts/discovery?workspace=${id}`}>
                        <Radar className="h-4 w-4" /> Mulai Discovery
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <Card>
                  <CardContent className="divide-y p-0">
                    {ws.leads.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.fullName}</p>
                          {(p.title || p.companyName) && (
                            <p className="truncate text-xs text-muted-foreground">
                              {[p.title, p.companyName].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        {p.leadType && (
                          <Badge variant="muted" className="shrink-0 bg-muted text-muted-foreground">
                            {p.leadType === "b2c_customer" ? "B2C" : p.leadType === "b2b_partner" ? "B2B" : p.leadType}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  ChevronRight,
  Handshake,
  LayoutGrid,
  Package,
  Plus,
  RefreshCw,
  Target,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import type { WorkspaceType } from "@/lib/workspace/store";

interface ProductOption {
  id: string;
  name: string;
  category: string | null;
}
interface WorkspaceRow {
  id: string;
  name: string;
  type: WorkspaceType;
  productId: string | null;
  productName: string | null;
  targetSegment: string | null;
  status: string;
  ownerUserId: string;
  ownerName: string | null;
  leadCount: number;
}

// ID labels for each workspace type (doc 44). No i18n keys — inline strings.
const TYPE_META: Record<WorkspaceType, { label: string; icon: typeof Briefcase; cls: string }> = {
  lead_gen: { label: "Cari lead", icon: Target, cls: "bg-emerald-100 text-emerald-700" },
  partner: { label: "Cari partner", icon: Handshake, cls: "bg-blue-100 text-blue-700" },
  offering: { label: "Penawaran", icon: Package, cls: "bg-violet-100 text-violet-700" },
  retention: { label: "Follow-up retensi", icon: RefreshCw, cls: "bg-amber-100 text-amber-700" },
  custom: { label: "Lainnya", icon: Briefcase, cls: "bg-muted text-muted-foreground" },
};
const TYPE_ORDER: WorkspaceType[] = ["lead_gen", "partner", "offering", "retention", "custom"];

export default function WorkspacesPage() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<"all" | WorkspaceType>("all");
  const [showArchived, setShowArchived] = useState(false); // doc 49 — Arsip view
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<WorkspaceType>("lead_gen");
  const [productId, setProductId] = useState("");
  const [targetSegment, setTargetSegment] = useState("");

  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const r = await fetch("/api/workspaces");
      if (r.status === 403) throw new Error("forbidden");
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: WorkspaceRow[]; products: ProductOption[] };
    },
    retry: false,
  });

  const create = useMutation({
    mutationFn: async (body: { name: string; type: WorkspaceType; productId: string | null; targetSegment: string | null }) => {
      const r = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Workspace dibuat");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setOpen(false);
      setName("");
      setType("lead_gen");
      setProductId("");
      setTargetSegment("");
    },
    onError: () => toast.error("Gagal membuat workspace (cek hak akses & koneksi DB)"),
  });

  // Archive (DELETE → status archived) / restore (PATCH status active), doc 49.
  const archiveWs = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => {
      const r = restore
        ? await fetch(`/api/workspaces/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }) })
        : await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.error ?? "gagal");
      return j;
    },
    onSuccess: (_d, { restore }) => {
      toast.success(restore ? "Workspace dipulihkan" : "Workspace diarsipkan");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: () => toast.error("Gagal (cek hak akses & DB)"),
  });

  const all = (q.data?.data ?? []).filter((w) => (showArchived ? w.status === "archived" : w.status !== "archived"));
  const products = q.data?.products ?? [];
  const visible = typeFilter === "all" ? all : all.filter((w) => w.type === typeFilter);

  return (
    <div>
      <PageHeader
        title="Workspaces"
        description="Wadah fokus per sales — pisahkan produk/tujuan biar nggak campur aduk. Manajer melihat semua, sales hanya miliknya."
      >
        <Button variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {showArchived ? "Lihat aktif" : "Lihat arsip"}
        </Button>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Buat workspace
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Type filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={
              "rounded-full px-3 py-1 text-xs font-medium transition " +
              (typeFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
            }
          >
            Semua
          </button>
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition " +
                (typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {TYPE_META[t].label}
            </button>
          ))}
        </div>

        {q.isError ? (
          <EmptyState
            icon={LayoutGrid}
            title="Tidak bisa memuat workspace"
            description="Pastikan kamu login dan punya akses data. Hubungi manajer jika masalah berlanjut."
          />
        ) : q.isLoading ? (
          <CardGridSkeleton count={6} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="Belum ada workspace"
            description="Buat workspace pertama untuk fokus pada satu tujuan — misal 'Cari lead AI Engineer', 'Cari partner', atau 'Penawaran Produk X'."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Buat workspace
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((w) => {
              const meta = TYPE_META[w.type] ?? TYPE_META.custom;
              const Icon = meta.icon;
              return (
                <Link key={w.id} href={`/workspaces/${w.id}`} className="group block">
                  <Card className="h-full transition hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " + meta.cls}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{w.name}</p>
                            <Badge variant="muted" className={"mt-0.5 " + meta.cls}>
                              {meta.label}
                            </Badge>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        {w.productName && (
                          <p className="flex items-center gap-1.5">
                            <Package className="h-3 w-3" /> {w.productName}
                          </p>
                        )}
                        {w.targetSegment && (
                          <p className="flex items-center gap-1.5">
                            <Target className="h-3 w-3" /> {w.targetSegment}
                          </p>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {w.leadCount} lead
                        </span>
                        <div className="flex items-center gap-1.5">
                          {w.ownerName && <span className="truncate">oleh {w.ownerName}</span>}
                          <button
                            type="button"
                            title={showArchived ? "Pulihkan" : "Arsipkan"}
                            className="rounded p-1 hover:bg-accent hover:text-foreground"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              archiveWs.mutate({ id: w.id, restore: showArchived });
                            }}
                          >
                            {showArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat workspace</DialogTitle>
            <DialogDescription>
              Satu workspace = satu fokus sales. Pilih tujuan + (opsional) produk & segmen target.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Nama</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cari lead AI Engineer"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-type">Tipe</Label>
              <select
                id="ws-type"
                value={type}
                onChange={(e) => setType(e.target.value as WorkspaceType)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
              >
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-product">Produk (opsional)</Label>
              <select
                id="ws-product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
              >
                <option value="">Tanpa produk</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.category ? ` · ${p.category}` : ""}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Belum ada produk — tambahkan dulu di Settings/Onboarding.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-segment">Segmen target (opsional)</Label>
              <Input
                id="ws-segment"
                value={targetSegment}
                onChange={(e) => setTargetSegment(e.target.value)}
                placeholder="AI Engineer Jakarta"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Batal
            </Button>
            <Button
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  type,
                  productId: productId || null,
                  targetSegment: targetSegment.trim() || null,
                })
              }
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? "Menyimpan…" : "Buat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

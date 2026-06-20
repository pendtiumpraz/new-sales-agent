"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, FileText, Plus, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { Toolbar } from "@/components/shared/toolbar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";

interface QuoteRow {
  id: string;
  number: string;
  title: string;
  customerName: string | null;
  customerCompany: string | null;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draf", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Terkirim", cls: "bg-blue-100 text-blue-700" },
  viewed: { label: "Dibuka", cls: "bg-amber-100 text-amber-700" },
  accepted: { label: "Diterima", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
  expired: { label: "Kadaluarsa", cls: "bg-muted text-muted-foreground" },
};
const STATUS_ORDER = ["draft", "sent", "viewed", "accepted", "rejected"];

const fmtMoney = (n: number, currency: string) =>
  currency === "IDR" ? "Rp" + Math.round(n || 0).toLocaleString("id-ID") : `${currency} ${(n || 0).toLocaleString("en-US")}`;

export default function PenawaranPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const workspaceId = useSearchParams().get("workspace");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false); // doc 49 — Arsip view
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [product, setProduct] = useState("");
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["quotes", workspaceId, showArchived],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.set("workspace", workspaceId);
      if (showArchived) params.set("archived", "1");
      const qs = params.toString();
      const r = await fetch(`/api/quotes${qs ? `?${qs}` : ""}`);
      if (r.status === 403) throw new Error("forbidden");
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: QuoteRow[] };
    },
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      let draft: { title?: string; items?: unknown[]; notes?: string; coverSubject?: string; coverBody?: string } = {};
      if (useAi && (product.trim() || title.trim())) {
        const cr = await fetch("/api/quotes/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product: product.trim() || title.trim(), customerName, customerCompany, notes }),
        });
        if (cr.ok) draft = (await cr.json()).data ?? {};
      }
      const body = {
        title: title.trim() || draft.title || product.trim() || "Penawaran",
        items: draft.items ?? [],
        taxRate: 0.11,
        notes: draft.notes ?? notes ?? null,
        coverSubject: draft.coverSubject ?? null,
        coverBody: draft.coverBody ?? null,
        customerName: customerName.trim() || null,
        customerEmail: customerEmail.trim() || null,
        customerCompany: customerCompany.trim() || null,
        workspaceId: workspaceId ?? null,
      };
      const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("gagal");
      return (await r.json()).data as QuoteRow;
    },
    onSuccess: (row) => {
      toast.success("Penawaran dibuat");
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setOpen(false);
      setTitle(""); setCustomerName(""); setCustomerEmail(""); setCustomerCompany(""); setProduct(""); setNotes("");
      router.push(`/penawaran/${row.id}`);
    },
    onError: () => toast.error("Gagal membuat penawaran (cek hak akses & DB)"),
  });

  const all = useMemo(() => q.data?.data ?? [], [q.data]);
  const visible = useMemo(() => {
    let list = statusFilter === "all" ? all : all.filter((x) => x.status === statusFilter);
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (x) =>
          x.number.toLowerCase().includes(s) ||
          x.title.toLowerCase().includes(s) ||
          (x.customerName ?? "").toLowerCase().includes(s) ||
          (x.customerCompany ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [all, statusFilter, search]);

  const columns: DataColumn<QuoteRow>[] = [
    { key: "number", header: "No.", sortValue: (x) => x.number, cell: (x) => <span className="font-mono text-xs text-muted-foreground">{x.number}</span> },
    { key: "title", header: "Judul", sortValue: (x) => x.title.toLowerCase(), cell: (x) => <span className="font-medium">{x.title}</span> },
    {
      key: "customer",
      header: "Pelanggan",
      cell: (x) => (
        <span className="text-muted-foreground">
          {x.customerName || "—"}
          {x.customerCompany ? ` · ${x.customerCompany}` : ""}
        </span>
      ),
    },
    { key: "total", header: "Total", align: "right", sortValue: (x) => x.total, cell: (x) => <span className="font-semibold">{fmtMoney(x.total, x.currency)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (x) => {
        const m = STATUS_META[x.status] ?? STATUS_META.draft;
        return <Badge variant="muted" className={m.cls}>{m.label}</Badge>;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Penawaran" description="Susun penawaran (AI bantu draft), kirim lewat mailbox-mu, lacak dibuka & diterima — otomatis update deal.">
        <Button variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {showArchived ? "Lihat aktif" : "Lihat arsip"}
        </Button>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Buat penawaran
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <Toolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Cari no / judul / pelanggan…"
          filters={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {q.isError ? (
          <EmptyState icon={FileText} title="Tidak bisa memuat penawaran" description="Pastikan kamu login & punya akses data." />
        ) : (
          <DataTable
            columns={columns}
            data={visible}
            rowKey={(x) => x.id}
            loading={q.isLoading}
            onRowClick={(x) => router.push(`/penawaran/${x.id}`)}
            emptyIcon={FileText}
            emptyTitle={search || statusFilter !== "all" ? "Tidak ada penawaran yang cocok" : "Belum ada penawaran"}
            emptyDescription={
              search || statusFilter !== "all"
                ? undefined
                : "Buat penawaran pertama — AI bisa bantu susun item, harga, syarat, dan email pengantarnya."
            }
            emptyAction={
              search || statusFilter !== "all" ? undefined : (
                <Button onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> Buat penawaran
                </Button>
              )
            }
          />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat penawaran</DialogTitle>
            <DialogDescription>Isi pelanggan & produk. AI bisa menyusun draf item + email pengantar; kamu rapikan di editor.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-title">Judul</Label>
              <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Penawaran Implementasi CRM" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="q-cn">Pelanggan</Label>
                <Input id="q-cn" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Budi" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-cc">Perusahaan</Label>
                <Input id="q-cc" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} placeholder="PT Maju" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-ce">Email pelanggan</Label>
              <Input id="q-ce" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="budi@ptmaju.co.id" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              <Sparkles className="h-4 w-4 text-violet-500" /> Bantu susun dengan AI
            </label>
            {useAi && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="q-prod">Produk/jasa</Label>
                  <Input id="q-prod" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Implementasi & pelatihan CRM 3 bulan" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-notes">Catatan untuk AI (opsional)</Label>
                  <Input id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="budget ~50jt, butuh integrasi WhatsApp" />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>Batal</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || (!title.trim() && !product.trim())}>
              {create.isPending ? "Menyusun…" : useAi ? "Susun dengan AI" : "Buat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

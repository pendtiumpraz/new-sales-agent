"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Plus, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/skeletons";

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
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [product, setProduct] = useState("");
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["quotes", workspaceId],
    queryFn: async () => {
      const r = await fetch(`/api/quotes${workspaceId ? `?workspace=${workspaceId}` : ""}`);
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

  const all = q.data?.data ?? [];
  const visible = statusFilter === "all" ? all : all.filter((x) => x.status === statusFilter);

  return (
    <div>
      <PageHeader title="Penawaran" description="Susun penawaran (AI bantu draft), kirim lewat mailbox-mu, lacak dibuka & diterima — otomatis update deal.">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Buat penawaran
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", ...STATUS_ORDER].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={"rounded-full px-3 py-1 text-xs font-medium transition " + (statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")}
            >
              {s === "all" ? "Semua" : STATUS_META[s]?.label ?? s}
            </button>
          ))}
        </div>

        {q.isError ? (
          <EmptyState icon={FileText} title="Tidak bisa memuat penawaran" description="Pastikan kamu login & punya akses data." />
        ) : q.isLoading ? (
          <CardGridSkeleton count={6} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Belum ada penawaran"
            description="Buat penawaran pertama — AI bisa bantu susun item, harga, syarat, dan email pengantarnya."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Buat penawaran</Button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((x) => {
              const meta = STATUS_META[x.status] ?? STATUS_META.draft;
              return (
                <Link key={x.id} href={`/penawaran/${x.id}`} className="group block">
                  <Card className="h-full transition hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{x.title}</p>
                          <p className="text-[11px] text-muted-foreground">{x.number}</p>
                        </div>
                        <Badge variant="muted" className={meta.cls}>{meta.label}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {x.customerName || "—"}{x.customerCompany ? ` · ${x.customerCompany}` : ""}
                      </p>
                      <p className="mt-auto border-t pt-2 text-sm font-semibold">{fmtMoney(x.total, x.currency)}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
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

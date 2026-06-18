"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, ExternalLink, Lock, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, TableSkeleton } from "@/components/shared/skeletons";

interface Item { desc: string; qty: number; unitPrice: number }
interface Quote {
  id: string; number: string; title: string; currency: string;
  items: Item[]; taxRate: number; subtotal: number; taxAmount: number; total: number;
  validUntil: string | null; notes: string | null; coverSubject: string | null; coverBody: string | null;
  customerName: string | null; customerEmail: string | null; customerCompany: string | null;
  status: string; publicToken: string; toEmail: string | null;
  sentAt: string | null; viewedAt: string | null; acceptedAt: string | null; rejectedAt: string | null;
  deletedAt?: string | null;
}
interface Mailbox { id: string; fromEmail: string; fromName?: string | null }

const fmtMoney = (n: number, c: string) => (c === "IDR" ? "Rp" + Math.round(n || 0).toLocaleString("id-ID") : `${c} ${(n || 0).toLocaleString("en-US")}`);
const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draf", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Terkirim", cls: "bg-blue-100 text-blue-700" },
  viewed: { label: "Dibuka", cls: "bg-amber-100 text-amber-700" },
  accepted: { label: "Diterima", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
};

export default function PenawaranEditor() {
  const id = useParams().id as string;
  const router = useRouter();
  const [q, setQ] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [mailboxId, setMailboxId] = useState("");

  const query = useQuery({
    queryKey: ["quote", id],
    queryFn: async () => {
      const r = await fetch(`/api/quotes/${id}`);
      if (!r.ok) throw new Error("gagal");
      return (await r.json()).data as Quote;
    },
    retry: false,
  });
  useEffect(() => { if (query.data) setQ(query.data); }, [query.data]);

  const mailboxes = useQuery({
    queryKey: ["mailboxes"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/mailboxes");
      if (!r.ok) return { data: [] as Mailbox[] };
      return (await r.json()) as { data: Mailbox[] };
    },
    retry: false,
  });

  if (query.isError)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Gagal memuat penawaran. <Link href="/penawaran" className="underline">Kembali ke daftar</Link>
      </div>
    );
  if (query.isLoading || !q)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <TableSkeleton rows={5} cols={3} />
            <TableSkeleton rows={3} cols={1} />
          </div>
          <CardGridSkeleton count={2} />
        </div>
      </div>
    );

  const subtotal = q.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const taxAmount = Math.round(subtotal * (Number(q.taxRate) || 0));
  const total = subtotal + taxAmount;
  // Once a quote leaves draft the customer is looking at live fields on the
  // public page — lock commercial editing (server enforces this with a 409).
  const locked = q.status !== "draft";
  const set = (patch: Partial<Quote>) => setQ({ ...q, ...patch });
  const setItem = (i: number, patch: Partial<Item>) => set({ items: q.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });

  async function save(silent = false) {
    if (!q) return;
    if (locked) {
      if (!silent) toast.error("Penawaran terkunci — duplikat sebagai draf baru untuk mengubah.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: q.title, items: q.items, taxRate: q.taxRate, validUntil: q.validUntil, notes: q.notes,
          coverSubject: q.coverSubject, coverBody: q.coverBody,
          customerName: q.customerName, customerEmail: q.customerEmail, customerCompany: q.customerCompany,
        }),
      });
      if (r.status === 409) {
        const j = await r.json().catch(() => null);
        if (!silent) toast.error(j?.error ?? "Penawaran terkunci");
        return;
      }
      if (!r.ok) throw new Error();
      const updated = (await r.json()).data as Quote;
      setQ(updated);
      if (!silent) toast.success("Tersimpan");
      return updated;
    } catch {
      if (!silent) toast.error("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function compose() {
    if (!q) return;
    setComposing(true);
    try {
      const r = await fetch("/api/quotes/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: q.title, customerName: q.customerName, customerCompany: q.customerCompany, notes: q.notes }),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()).data as { title?: string; items?: Item[]; notes?: string; coverSubject?: string; coverBody?: string };
      set({ title: d.title || q.title, items: d.items?.length ? d.items : q.items, notes: d.notes ?? q.notes, coverSubject: d.coverSubject ?? q.coverSubject, coverBody: d.coverBody ?? q.coverBody });
      toast.success("Draf AI dimasukkan — cek & rapikan");
    } catch {
      toast.error("AI gagal menyusun (cek model aktif di Settings → AI)");
    } finally {
      setComposing(false);
    }
  }

  async function send() {
    if (!q) return;
    if (!q.customerEmail) return toast.error("Isi email pelanggan dulu");
    if (!mailboxId) return toast.error("Pilih mailbox pengirim");
    setSending(true);
    try {
      // Skip the pre-save flush when locked (nothing editable to persist, and
      // the PATCH would 409). A fresh draft still saves before sending.
      if (!locked) await save(true);
      const r = await fetch(`/api/quotes/${id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendingAccountId: mailboxId, toEmail: q.customerEmail }),
      });
      const res = await r.json();
      if (!r.ok || !res.ok) throw new Error(res.error || "gagal");
      toast.success("Penawaran terkirim");
      query.refetch();
    } catch (e) {
      toast.error("Gagal kirim: " + (e instanceof Error ? e.message : "cek mailbox di Pengaturan"));
    } finally {
      setSending(false);
    }
  }

  const meta = STATUS_META[q.status] ?? STATUS_META.draft;
  const link = typeof window !== "undefined" ? `${window.location.origin}/q/${q.publicToken}` : `/q/${q.publicToken}`;
  const archived = !!q.deletedAt;
  async function archive() {
    try {
      const r = await fetch("/api/data/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "quote", id, restore: archived }) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.error ?? "gagal");
      toast.success(archived ? "Penawaran dipulihkan" : "Penawaran diarsipkan");
      if (archived) query.refetch();
      else router.push("/penawaran");
    } catch {
      toast.error("Gagal (cek hak akses & DB)");
    }
  }

  return (
    <div>
      <PageHeader title={`${q.title}`} description={`${q.number} · `}>
        <Badge variant="muted" className={meta.cls}>{meta.label}</Badge>
        <Button variant="outline" className={!archived ? "text-destructive hover:text-destructive" : ""} onClick={archive}>
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {archived ? "Pulihkan" : "Arsipkan"}
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <Link href="/penawaran" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Semua penawaran
        </Link>

        {locked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Penawaran sudah <strong>{meta.label.toLowerCase()}</strong> dan
              terkunci — pelanggan melihat angka di halaman publik secara
              langsung. Untuk mengubah, duplikat sebagai draf baru.
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: items + details */}
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Item penawaran</h3>
                  <Button size="sm" variant="secondary" onClick={compose} disabled={composing || locked}>
                    <Sparkles className="h-4 w-4" /> {composing ? "Menyusun…" : "Susun ulang dgn AI"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {q.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="flex-1" disabled={locked} value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Deskripsi" />
                      <Input className="w-16" disabled={locked} type="number" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
                      <Input className="w-32" disabled={locked} type="number" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} placeholder="Harga" />
                      <button onClick={() => set({ items: q.items.filter((_, k) => k !== i) })} disabled={locked} className="text-muted-foreground hover:text-rose-600 disabled:opacity-40 disabled:hover:text-muted-foreground">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" disabled={locked} onClick={() => set({ items: [...q.items, { desc: "", qty: 1, unitPrice: 0 }] })}>
                    <Plus className="h-4 w-4" /> Tambah item
                  </Button>
                </div>

                <div className="space-y-1 border-t pt-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtMoney(subtotal, q.currency)}</span></div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">PPN ({Math.round((q.taxRate || 0) * 100)}%)</span>
                    <div className="flex items-center gap-2">
                      <Input className="w-20" disabled={locked} type="number" step="0.01" value={q.taxRate} onChange={(e) => set({ taxRate: Number(e.target.value) })} />
                      <span className="w-28 text-right">{fmtMoney(taxAmount, q.currency)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{fmtMoney(total, q.currency)}</span></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-semibold">Email pengantar</h3>
                <Input disabled={locked} value={q.coverSubject ?? ""} onChange={(e) => set({ coverSubject: e.target.value })} placeholder="Subjek email" />
                <textarea
                  value={q.coverBody ?? ""}
                  onChange={(e) => set({ coverBody: e.target.value })}
                  disabled={locked}
                  rows={5}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
                  placeholder="Halo Pak Budi, berikut penawaran kami…"
                />
                <h3 className="pt-2 font-semibold">Syarat & ketentuan</h3>
                <textarea
                  value={q.notes ?? ""}
                  onChange={(e) => set({ notes: e.target.value })}
                  disabled={locked}
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
                  placeholder="Berlaku 14 hari, pembayaran 50% di muka…"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: customer + send */}
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-semibold">Pelanggan</h3>
                <div className="space-y-1.5"><Label>Nama</Label><Input disabled={locked} value={q.customerName ?? ""} onChange={(e) => set({ customerName: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Perusahaan</Label><Input disabled={locked} value={q.customerCompany ?? ""} onChange={(e) => set({ customerCompany: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input disabled={locked} type="email" value={q.customerEmail ?? ""} onChange={(e) => set({ customerEmail: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Berlaku s/d</Label><Input disabled={locked} type="date" value={q.validUntil ?? ""} onChange={(e) => set({ validUntil: e.target.value })} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-semibold">Kirim</h3>
                <div className="space-y-1.5">
                  <Label>Mailbox pengirim</Label>
                  <select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="">Pilih mailbox…</option>
                    {(mailboxes.data?.data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>{m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail}</option>
                    ))}
                  </select>
                  {(mailboxes.data?.data ?? []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Belum ada mailbox. <Link href="/settings/mailboxes" className="underline">Hubungkan dulu</Link> (Gmail/Outlook OAuth).</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => save()} disabled={saving || locked}>
                    <Save className="h-4 w-4" /> {saving ? "…" : "Simpan"}
                  </Button>
                  <Button className="flex-1" onClick={send} disabled={sending}>
                    <Send className="h-4 w-4" /> {sending ? "Mengirim…" : "Kirim"}
                  </Button>
                </div>
                <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3" /> Lihat halaman publik
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
                <h3 className="mb-1 text-sm font-semibold text-foreground">Pelacakan</h3>
                <p>Terkirim: {q.sentAt ? new Date(q.sentAt).toLocaleString("id-ID") : "—"}</p>
                <p>Dibuka: {q.viewedAt ? new Date(q.viewedAt).toLocaleString("id-ID") : "—"}</p>
                <p>Diterima: {q.acceptedAt ? new Date(q.acceptedAt).toLocaleString("id-ID") : "—"}</p>
                {q.rejectedAt && <p>Ditolak: {new Date(q.rejectedAt).toLocaleString("id-ID")}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

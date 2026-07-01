"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Briefcase,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Lock,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  Unlink,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ContentTemplatePicker } from "@/components/shared/content-template-picker";
import { cn } from "@/lib/utils";

interface Item { desc: string; qty: number; unitPrice: number }
interface Quote {
  id: string; number: string; title: string; currency: string;
  items: Item[]; taxRate: number; subtotal: number; taxAmount: number; total: number;
  validUntil: string | null; notes: string | null; coverSubject: string | null; coverBody: string | null;
  customerName: string | null; customerEmail: string | null; customerCompany: string | null;
  contactId: string | null; dealId: string | null;
  status: string; publicToken: string; toEmail: string | null;
  sentAt: string | null; viewedAt: string | null; acceptedAt: string | null; rejectedAt: string | null;
  deletedAt?: string | null;
}
interface Mailbox { id: string; fromEmail: string; fromName?: string | null }

// CRM rows (from /api/contacts, /api/deals — the { ok, data } envelope).
interface CrmContact { id: string; fullName: string; title: string | null; email: string | null; segment: string }
interface CrmDeal { id: string; name: string; value: number; currency: string; status: string; stageId: string | null }
interface Page<T> { items: T[]; nextCursor: string | null }

const fmtMoney = (n: number, c: string) => (c === "IDR" ? "Rp" + Math.round(n || 0).toLocaleString("id-ID") : `${c} ${(n || 0).toLocaleString("en-US")}`);
const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draf", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Terkirim", cls: "bg-blue-100 text-blue-700" },
  viewed: { label: "Dibuka", cls: "bg-amber-100 text-amber-700" },
  accepted: { label: "Diterima", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
};

// ── envelope reader for the CRM APIs ({ ok, data }) — quotes use a bare { data } ─
async function readOk<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
  if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || "gagal");
  return j.data as T;
}

export default function PenawaranEditor() {
  const id = useParams().id as string;
  const router = useRouter();
  const [q, setQ] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [mailboxId, setMailboxId] = useState("");
  const [contactPicker, setContactPicker] = useState(false);
  const [dealPicker, setDealPicker] = useState(false);
  const [templatePicker, setTemplatePicker] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);

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

  // Resolve the linked contact / deal names for display (only when linked).
  const contactId = q?.contactId ?? null;
  const dealId = q?.dealId ?? null;
  const linkedContactQ = useQuery({
    queryKey: ["quote-linked-contact", contactId],
    enabled: !!contactId,
    queryFn: async () => readOk<CrmContact>(await fetch(`/api/contacts/${contactId}`)),
    retry: false,
  });
  const linkedDealQ = useQuery({
    queryKey: ["quote-linked-deal", dealId],
    enabled: !!dealId,
    queryFn: async () => readOk<CrmDeal>(await fetch(`/api/deals/${dealId}`)),
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
  const decided = q.status === "accepted" || q.status === "rejected";
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

  // ── CRM links (internal, never "commercial" → editable in any status) ────────
  // PATCH only the link fields (+ prefilled customer fields while still a draft) so
  // linking works even after the quote is sent/locked.
  async function patchLink(body: Record<string, unknown>, ok: string) {
    if (!q) return;
    setLinking(true);
    try {
      const r = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? "gagal");
      }
      const updated = (await r.json()).data as Quote;
      // Merge only the fields we changed — don't clobber unsaved item/cover edits.
      setQ((prev) =>
        prev
          ? {
              ...prev,
              contactId: updated.contactId,
              dealId: updated.dealId,
              customerName: updated.customerName,
              customerCompany: updated.customerCompany,
              customerEmail: updated.customerEmail,
            }
          : updated,
      );
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menautkan");
    } finally {
      setLinking(false);
    }
  }

  function linkContact(c: CrmContact) {
    setContactPicker(false);
    // On a draft, prefill + persist the customer fields from the chosen contact.
    // Once locked, only the link changes (customer fields stay frozen).
    const body: Record<string, unknown> = { contactId: c.id };
    if (!locked) {
      body.customerName = c.fullName;
      if (c.email) body.customerEmail = c.email;
    }
    void patchLink(body, `Ditautkan ke kontak "${c.fullName}"`);
  }
  function linkDeal(d: CrmDeal) {
    setDealPicker(false);
    void patchLink({ dealId: d.id }, `Ditautkan ke deal "${d.name}"`);
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

  // Rep-side accept (customer confirmed offline) → advances the linked deal to Won.
  async function markAccepted() {
    setAcceptOpen(false);
    setAccepting(true);
    try {
      const r = await fetch(`/api/quotes/${id}/accept`, { method: "POST" });
      const res = await r.json().catch(() => null);
      if (!r.ok) throw new Error(res?.error ?? "gagal");
      toast.success("Penawaran ditandai diterima");
      if (res?.data?.dealWon) {
        toast.success(`Deal "${res.data.dealName ?? "tertaut"}" dipindah ke tahap Menang (Won)`);
      }
      query.refetch();
    } catch (e) {
      toast.error("Gagal menandai diterima: " + (e instanceof Error ? e.message : "cek DB & hak akses"));
    } finally {
      setAccepting(false);
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
              langsung. Untuk mengubah, duplikat sebagai draf baru. (Tautan kontak &
              deal tetap bisa diubah.)
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
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Email pengantar</h3>
                  <Button size="sm" variant="outline" onClick={() => setTemplatePicker(true)} disabled={locked}>
                    <FileText className="h-4 w-4" /> Isi dari template
                  </Button>
                </div>
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

          {/* Right: customer + CRM links + send */}
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Pelanggan</h3>
                  <Button size="sm" variant="outline" onClick={() => setContactPicker(true)} disabled={linking}>
                    <Users className="h-4 w-4" /> {q.contactId ? "Ganti kontak" : "Pilih kontak"}
                  </Button>
                </div>

                {q.contactId ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/[0.05] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {linkedContactQ.isLoading
                          ? "Memuat…"
                          : linkedContactQ.isError
                            ? "Kontak tidak ditemukan"
                            : linkedContactQ.data?.fullName || "Kontak"}
                      </p>
                      <Link href="/contacts" className="text-[11px] text-primary hover:underline">
                        Lihat di Kontak →
                      </Link>
                    </div>
                    <button
                      type="button"
                      title="Lepas tautan kontak"
                      disabled={linking}
                      onClick={() => patchLink({ contactId: null }, "Tautan kontak dilepas")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    Kontak manual — isi manual di bawah, atau pilih dari CRM untuk menautkan.
                  </p>
                )}

                <div className="space-y-1.5"><Label>Nama</Label><Input disabled={locked} value={q.customerName ?? ""} onChange={(e) => set({ customerName: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Perusahaan</Label><Input disabled={locked} value={q.customerCompany ?? ""} onChange={(e) => set({ customerCompany: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input disabled={locked} type="email" value={q.customerEmail ?? ""} onChange={(e) => set({ customerEmail: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Berlaku s/d</Label><Input disabled={locked} type="date" value={q.validUntil ?? ""} onChange={(e) => set({ validUntil: e.target.value })} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Tautan pipeline</h3>
                  <Button size="sm" variant="outline" onClick={() => setDealPicker(true)} disabled={linking}>
                    <Briefcase className="h-4 w-4" /> {q.dealId ? "Ganti deal" : "Tautkan deal"}
                  </Button>
                </div>
                {q.dealId ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/[0.05] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {linkedDealQ.isLoading
                          ? "Memuat…"
                          : linkedDealQ.isError
                            ? "Deal tidak ditemukan"
                            : linkedDealQ.data?.name || "Deal"}
                      </p>
                      <Link href="/pipeline" className="text-[11px] text-primary hover:underline">
                        Lihat di Pipeline →
                      </Link>
                    </div>
                    <button
                      type="button"
                      title="Lepas tautan deal"
                      disabled={linking}
                      onClick={() => patchLink({ dealId: null }, "Tautan deal dilepas")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    Belum tertaut ke deal. Saat penawaran <b>diterima</b>, deal tertaut otomatis
                    dipindah ke tahap <b>Menang</b>.
                  </p>
                )}
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

        {/* Sticky save bar (redesign wireframe 03) — status + Simpan + Kirim */}
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex items-center gap-3 border-t bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          {locked ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-700">
              <Lock className="h-3.5 w-3.5" /> Terkunci — {meta.label.toLowerCase()}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {saving ? "Menyimpan…" : "Klik Simpan untuk menyimpan perubahan."}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!decided && !archived && (
              <Button variant="outline" className="text-emerald-700 hover:text-emerald-700" onClick={() => setAcceptOpen(true)} disabled={accepting}>
                <CheckCircle2 className="h-4 w-4" /> {accepting ? "…" : "Tandai diterima"}
              </Button>
            )}
            <Button variant="outline" onClick={() => save()} disabled={saving || locked}>
              <Save className="h-4 w-4" /> {saving ? "…" : "Simpan"}
            </Button>
            <Button onClick={send} disabled={sending}>
              <Send className="h-4 w-4" /> {sending ? "Mengirim…" : "Kirim"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── contact picker (single-select, prefills the customer block) ── */}
      <PickerModal
        open={contactPicker}
        onClose={() => setContactPicker(false)}
        title="Pilih kontak"
        subtitle="Tautkan penawaran ke kontak CRM"
        icon={<Users className="h-4 w-4" />}
        emptyIcon={Users}
        emptyTitle="Belum ada kontak"
        emptyDesc="Jalankan Discovery / Enrichment dulu untuk mendapatkan kontak."
        fetchUrl="/api/contacts?limit=200"
        rowKey={(c: CrmContact) => c.id}
        filterRow={(c: CrmContact, s) => c.fullName.toLowerCase().includes(s) || (c.title ?? "").toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s)}
        renderPrimary={(c: CrmContact) => c.fullName}
        renderSecondary={(c: CrmContact) => c.email || c.title || "Perorangan"}
        onPick={linkContact}
      />

      {/* ── deal picker (prefers the linked contact's deals, else all) ── */}
      <PickerModal
        open={dealPicker}
        onClose={() => setDealPicker(false)}
        title="Tautkan ke deal"
        subtitle={q.contactId ? "Deal untuk kontak ini (atau semua)" : "Pilih deal di pipeline"}
        icon={<Briefcase className="h-4 w-4" />}
        emptyIcon={Briefcase}
        emptyTitle="Belum ada deal"
        emptyDesc="Buat deal di Pipeline dulu untuk menautkannya."
        fetchUrl={q.contactId ? `/api/deals?contactId=${encodeURIComponent(q.contactId)}&limit=200` : "/api/deals?limit=200"}
        rowKey={(d: CrmDeal) => d.id}
        filterRow={(d: CrmDeal, s) => d.name.toLowerCase().includes(s)}
        renderPrimary={(d: CrmDeal) => d.name}
        renderSecondary={(d: CrmDeal) => `${fmtMoney(d.value, d.currency)} · ${d.status}`}
        onPick={linkDeal}
      />

      {/* ── "Isi dari template" → fills cover subject/body from Konten ── */}
      <ContentTemplatePicker
        open={templatePicker}
        onClose={() => setTemplatePicker(false)}
        channel="email"
        title="Isi email dari template"
        subtitle="Ambil subjek & isi dari template Konten"
        onPick={(t) => {
          set({ coverSubject: t.subject || q.coverSubject, coverBody: t.body || q.coverBody });
          toast.success(`Template "${t.name}" dimasukkan — cek & rapikan`);
        }}
      />

      {/* ── rep-side accept confirm ── */}
      <ConfirmDialog
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        icon={<CheckCircle2 className="h-5 w-5" />}
        tone="tertiary"
        title="Tandai penawaran diterima?"
        body={
          <>
            Status menjadi <b>Diterima</b>.
            {q.dealId
              ? " Deal yang tertaut akan dipindah ke tahap Menang (Won)."
              : " Tidak ada deal tertaut, jadi hanya status penawaran yang berubah."}
          </>
        }
        confirmLabel="Ya, tandai diterima"
        confirmPending={accepting}
        onConfirm={markAccepted}
      />
    </div>
  );
}

// ───────────────────────── generic single-select picker modal ────────────────
// A centered modal (Coral Sunset — mirrors cadence's EnrollModal chrome) that
// READS a list endpoint ({ ok, data:{ items } }), filters client-side, and calls
// onPick(row) on a row click. Used for both the contact and the deal picker.
function PickerModal<T>({
  open,
  onClose,
  title,
  subtitle,
  icon,
  emptyIcon,
  emptyTitle,
  emptyDesc,
  fetchUrl,
  rowKey,
  filterRow,
  renderPrimary,
  renderSecondary,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDesc: string;
  fetchUrl: string;
  rowKey: (row: T) => string;
  filterRow: (row: T, search: string) => boolean;
  renderPrimary: (row: T) => string;
  renderSecondary: (row: T) => string;
  onPick: (row: T) => void;
}) {
  const [search, setSearch] = useState("");

  const listQ = useQuery({
    queryKey: ["picker", fetchUrl],
    enabled: open,
    queryFn: async () => (await readOk<Page<T>>(await fetch(fetchUrl))).items,
    retry: false,
  });
  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => filterRow(r, s));
  }, [rows, search, filterRow]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              {icon}
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* search */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>

        {/* list */}
        <div className="min-h-[180px] flex-1 overflow-y-auto px-2 py-2">
          {listQ.isLoading ? (
            <div className="space-y-1.5 px-3 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : listQ.isError ? (
            <ErrorState
              className="border-0 py-8"
              title="Gagal memuat"
              description="Tidak bisa mengambil daftar. Pastikan kamu login & database tersedia."
              onRetry={() => listQ.refetch()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              className="border-0 py-8"
              icon={emptyIcon}
              title={rows.length === 0 ? emptyTitle : "Tidak ada yang cocok"}
              description={rows.length === 0 ? emptyDesc : "Coba kata kunci lain."}
            />
          ) : (
            <div className="space-y-0.5">
              {filtered.map((r) => (
                <button
                  key={rowKey(r)}
                  type="button"
                  onClick={() => onPick(r)}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-primary/[0.08]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{renderPrimary(r)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{renderSecondary(r)}</p>
                  </div>
                  <Check className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

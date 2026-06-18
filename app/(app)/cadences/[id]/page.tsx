"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, Mail, Plus, Search, Users, Workflow } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChannelDot } from "@/components/shared/channel-dot";

interface CadenceStep {
  channel: string;
  delayDays?: number;
  subject?: string | null;
  content: string;
}
interface Cadence {
  id: string;
  name: string;
  status: string;
  steps: CadenceStep[];
  channelMix?: string[];
  enrolled?: number;
  replyRate?: number;
  deletedAt?: string | null;
}
interface Enrollment {
  id: string;
  contactId: string;
  currentStepIdx?: number | null;
  status: string;
}
interface Contact {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn", instagram: "Instagram", sms: "SMS", call: "Telepon",
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700" },
  draft: { label: "Draf", cls: "bg-muted text-muted-foreground" },
  paused: { label: "Jeda", cls: "bg-amber-100 text-amber-700" },
};

export default function CadenceDetailPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const qc = useQueryClient();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const cadQ = useQuery({
    queryKey: ["cadence", id],
    queryFn: async () => {
      const r = await fetch(`/api/db/cadences/${id}`);
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: Cadence | null };
    },
    retry: false,
  });
  const enrollQ = useQuery({
    queryKey: ["cadence-enrollments", id],
    queryFn: async () => {
      const r = await fetch(`/api/db/cadence-enrollments?cadenceId=${id}`);
      if (!r.ok) return { data: [] as Enrollment[] };
      return (await r.json()) as { data: Enrollment[] };
    },
  });
  const contactsQ = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const r = await fetch("/api/db/contacts");
      if (!r.ok) return { data: [] as Contact[] };
      return (await r.json()) as { data: Contact[] };
    },
  });

  const contactById = useMemo(() => new Map((contactsQ.data?.data ?? []).map((c) => [c.id, c])), [contactsQ.data]);
  const enrolledIds = useMemo(() => new Set((enrollQ.data?.data ?? []).map((e) => e.contactId)), [enrollQ.data]);
  const pickable = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (contactsQ.data?.data ?? [])
      .filter((c) => !enrolledIds.has(c.id))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.company ?? "").toLowerCase().includes(term));
  }, [contactsQ.data, enrolledIds, q]);

  const enroll = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/db/cadence-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadenceId: id, contactIds: [...picked] }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error ?? "gagal");
      return j as { count: number };
    },
    onSuccess: (j) => {
      toast.success(`${j.count} kontak didaftarkan ke cadence`);
      setEnrollOpen(false);
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["cadence-enrollments", id] });
      qc.invalidateQueries({ queryKey: ["cadence", id] });
    },
    onError: (e) => toast.error(e instanceof Error && e.message === "gagal" ? "Mode demo / DB belum aktif" : "Gagal mendaftarkan"),
  });

  // Soft-delete / restore the cadence (doc 49). Archived cadences stay openable
  // here so they can be restored.
  const archiveCad = useMutation({
    mutationFn: async () => {
      const isArchived = !!cadQ.data?.data?.deletedAt;
      const r = await fetch("/api/data/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "cadence", id, restore: isArchived }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error ?? "gagal");
      return j as { archived: boolean };
    },
    onSuccess: (j) => {
      if (j.archived) {
        toast.success("Cadence diarsipkan");
        router.push("/cadences");
      } else {
        toast.success("Cadence dipulihkan");
        qc.invalidateQueries({ queryKey: ["cadence", id] });
        qc.invalidateQueries({ queryKey: ["cadences"] });
      }
    },
    onError: () => toast.error("Gagal (cek hak akses & DB)"),
  });

  const cad = cadQ.data?.data;
  const enrollments = enrollQ.data?.data ?? [];
  // Only "aktif" enrollments are actually running — 'selesai'/'berhenti' are
  // done. Show both so "terdaftar" doesn't conflate finished with in-flight.
  const activeEnrollments = enrollments.filter((e) => (e.status ?? "aktif") === "aktif").length;

  if (cadQ.isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-7 w-64" /><Skeleton className="h-40 w-full rounded-xl" /></div>;
  if (cadQ.isError || !cad) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Cadence tidak ditemukan. <Link href="/cadences" className="underline">Kembali</Link>
      </div>
    );
  }
  const st = STATUS_META[cad.status] ?? STATUS_META.draft;

  return (
    <div>
      <PageHeader title={cad.name} description={`${cad.steps.length} langkah · ${cad.replyRate ?? 0}% balas`}>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className={!cad.deletedAt ? "text-destructive hover:text-destructive" : ""}
            onClick={() => archiveCad.mutate()}
            disabled={archiveCad.isPending}
          >
            {cad.deletedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {cad.deletedAt ? "Pulihkan" : "Arsipkan"}
          </Button>
          <Button onClick={() => setEnrollOpen(true)}>
            <Plus className="h-4 w-4" /> Daftarkan kontak
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-5 p-6">
        <Link href="/cadences" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Semua cadence
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="muted" className={st.cls}>{st.label}</Badge>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> {activeEnrollments} aktif · {enrollments.length} total
          </span>
          <div className="flex items-center gap-1">
            {(cad.channelMix ?? []).map((ch) => <ChannelDot key={ch} channel={ch} size={10} />)}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Steps */}
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold"><Workflow className="h-4 w-4" /> Langkah</h3>
              <div className="space-y-0">
                {cad.steps.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium">{i + 1}</span>
                      {i < cad.steps.length - 1 && <span className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 pb-5">
                      <div className="flex items-center gap-2">
                        <ChannelDot channel={s.channel} size={10} />
                        <span className="text-sm font-medium">{CHANNEL_LABEL[s.channel] ?? s.channel}</span>
                        <span className="text-xs text-muted-foreground">· Hari +{s.delayDays ?? 0}</span>
                      </div>
                      {s.subject && <p className="mt-1 text-sm font-medium">{s.subject}</p>}
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{s.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Enrolled */}
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Kontak terdaftar ({activeEnrollments} aktif / {enrollments.length} total)</h3>
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada kontak. Klik “Daftarkan kontak”.</p>
              ) : (
                <div className="space-y-1.5">
                  {enrollments.map((e) => {
                    const c = contactById.get(e.contactId);
                    return (
                      <div key={e.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c?.name ?? e.contactId}</p>
                          {c?.company && <p className="truncate text-xs text-muted-foreground">{c.company}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <span>Langkah {(e.currentStepIdx ?? 0) + 1}/{cad.steps.length}</span>
                          <Badge variant="muted">{e.status}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Enroll dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daftarkan kontak ke “{cad.name}”</DialogTitle>
            <DialogDescription>Pilih kontak untuk dimasukkan ke cadence ini.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama/perusahaan…" className="pl-8" />
            </div>
            <div className="max-h-72 space-y-1 overflow-auto">
              {pickable.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {contactsQ.isLoading ? "Memuat…" : "Tidak ada kontak (semua sudah terdaftar?)"}
                </p>
              ) : (
                pickable.slice(0, 200).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    />
                    <span className="min-w-0 truncate">
                      {c.name}
                      {c.company && <span className="text-muted-foreground"> · {c.company}</span>}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <span className="mr-auto self-center text-xs text-muted-foreground">{picked.size} dipilih</span>
            <Button variant="outline" onClick={() => setEnrollOpen(false)} disabled={enroll.isPending}>Batal</Button>
            <Button onClick={() => enroll.mutate()} disabled={enroll.isPending || picked.size === 0}>
              <Mail className="h-4 w-4" /> {enroll.isPending ? "Mendaftarkan…" : `Daftarkan ${picked.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

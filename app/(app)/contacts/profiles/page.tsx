"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Briefcase, Building2, Handshake, MapPin, Radar, Sparkles, User2, UserCircle2, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { DataTable, type Column } from "@/components/profiles/data-table";
import { ProfileDetailSheet } from "@/components/profiles/profile-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { ContactPoint } from "@/lib/types/profiling";

interface CompanyRow {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  summary?: string | null;
  source?: string | null;
  capturedMode?: string | null;
  contacts: ContactPoint[];
  peopleCount: number;
}
interface PersonRow {
  id: string;
  fullName: string;
  title?: string | null;
  department?: string | null;
  location?: string | null;
  companyName?: string | null;
  source?: string | null;
  capturedMode?: string | null;
  leadType?: string | null;
  leadReason?: string | null;
  leadScore?: number | null;
  capturedAt?: string | null;
  assignedTo?: string | null;
  workspaceId?: string | null;
  linkedinUrl?: string | null;
  gender?: string | null;
  honorific?: string | null;
  socials?: Record<string, string> | null;
  profileSummary?: string | null;
  contacts: ContactPoint[];
}

interface Member {
  userId: string;
  name: string;
  role: string;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// captured_at null or older than a year → data may be stale, prompt a re-crawl.
function staleInfo(capturedAt?: string | null): { stale: boolean; label: string } {
  if (!capturedAt) return { stale: true, label: "Belum pernah di-crawl" };
  const age = Date.now() - new Date(capturedAt).getTime();
  if (age > YEAR_MS) return { stale: true, label: `Data ${Math.floor(age / YEAR_MS)} thn — perlu re-crawl` };
  return { stale: false, label: "" };
}

// import vs crawl vs hunter — for the source badge.
function sourceBucket(source?: string | null): { label: string; cls: string } | null {
  const s = (source ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("import") || s.includes("excel")) return { label: "Impor", cls: "bg-violet-100 text-violet-700" };
  if (s.includes("hunter")) return { label: "Hunter", cls: "bg-sky-100 text-sky-700" };
  if (s.includes("crawl") || s.includes("linkedin") || s.includes("extension") || s.includes("web"))
    return { label: "Crawl", cls: "bg-amber-100 text-amber-700" };
  return { label: source as string, cls: "bg-muted text-muted-foreground" };
}

function LeadTypeBadge({ leadType }: { leadType?: string | null }) {
  if (leadType === "b2c_customer")
    return (
      <Badge variant="muted" className="gap-1 bg-emerald-100 text-emerald-700">
        <User2 className="h-3 w-3" /> B2C Customer
      </Badge>
    );
  if (leadType === "b2b_partner")
    return (
      <Badge variant="muted" className="gap-1 bg-blue-100 text-blue-700">
        <Handshake className="h-3 w-3" /> B2B Partner
      </Badge>
    );
  return (
    <Badge variant="muted" className="bg-muted text-muted-foreground">
      Belum diklasifikasi
    </Badge>
  );
}

const CONSENT: Record<string, { cls: string; label: string }> = {
  opted_in: { cls: "bg-success/10 text-success", label: "Opt-in" },
  opted_out: { cls: "bg-destructive/10 text-destructive", label: "Opt-out" },
  legitimate_interest: { cls: "bg-info/10 text-info", label: "Legit. interest" },
  unknown: { cls: "bg-muted text-muted-foreground", label: "Unknown" },
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  phone: "Telepon",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  web: "Web",
  other: "Lainnya",
};

// Normalize an Indonesian phone → wa.me digits (62…, no +/spaces).
function toWaDigits(phone: string): string {
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (!d.startsWith("62")) d = "62" + d;
  return d;
}
function linkForChannel(channel: string, value: string): string | null {
  const c = channel.toLowerCase();
  if (c === "email") return `mailto:${value}`;
  if (c === "phone" || c === "tel") return `tel:${value}`;
  if (c === "wa" || c === "whatsapp") return `https://wa.me/${toWaDigits(value)}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (["website", "github", "twitter", "linkedin", "instagram", "tiktok"].includes(c)) return value.startsWith("http") ? value : `https://${value}`;
  return null;
}

function ContactRow({ cp }: { cp: ContactPoint }) {
  const consent = CONSENT[cp.consentStatus] ?? CONSENT.unknown;
  const href = linkForChannel(cp.channel, cp.value);
  const wa = cp.channel === "phone" ? `https://wa.me/${toWaDigits(cp.value)}` : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
        {CHANNEL_LABEL[cp.channel] ?? cp.channel}
      </span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">
          {cp.value}
        </a>
      ) : (
        <span className="font-mono text-foreground">{cp.value}</span>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200"
        >
          WhatsApp
        </a>
      )}
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", consent.cls)}>
        {consent.label}
      </span>
    </div>
  );
}

function Provenance({ source, mode }: { source?: string | null; mode?: string | null }) {
  if (!source && !mode) return null;
  return (
    <p className="mt-2 text-[11px] text-muted-foreground/80">
      Sumber: {source ?? "—"}
      {mode ? ` · mode ${mode}` : ""}
    </p>
  );
}

export default function ProfilesPage() {
  const qc = useQueryClient();
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all"); // all | Crawl | Impor | Hunter
  const [wsShowAll, setWsShowAll] = useState(false); // workspace mode: show all leads to add

  // Workspace scope (doc 44): ?workspace=<id> filters to that workspace's leads.
  const workspaceId = useSearchParams().get("workspace");
  const wsQ = useQuery({
    queryKey: ["workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const r = await fetch(`/api/workspaces/${workspaceId}`);
      if (!r.ok) return null;
      return (await r.json()) as { data?: { name: string } };
    },
  });
  const tagWorkspace = useMutation({
    mutationFn: async (body: { personId: string; workspaceId: string | null }) => {
      const r = await fetch("/api/profiles/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Workspace lead diperbarui");
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: () => toast.error("Gagal ubah workspace lead"),
  });
  // Real enrichment: gender from name + websearch (DuckDuckGo + GitHub) for
  // email/phone/github/site + classify + summary (doc 46).
  const enrich = useMutation({
    mutationFn: async (body: { personId?: string; all?: boolean; companyId?: string; allCompanies?: boolean }) => {
      const r = await fetch("/api/profiles/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { ok: boolean; count: number };
    },
    onSuccess: (d) => {
      toast.success(`Enrich selesai — ${d.count} kontak dicari di web (email/HP/GitHub)`);
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: () => toast.error("Enrich gagal (cek hak akses & DB)"),
    onSettled: () => setClassifyingId(null),
  });

  const membersQ = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const r = await fetch("/api/team/members");
      if (!r.ok) return [] as Member[];
      return ((await r.json()).data ?? []) as Member[];
    },
  });
  const assign = useMutation({
    mutationFn: async (body: { personId: string; assignedTo: string | null }) => {
      const r = await fetch("/api/profiles/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Lead di-assign");
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: () => toast.error("Gagal assign (cek hak akses)"),
  });

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const r = await fetch("/api/db/companies");
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: CompanyRow[] };
    },
  });
  const people = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const r = await fetch("/api/db/people");
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: PersonRow[] };
    },
  });

  const [selected, setSelected] = useState<{ kind: "person" | "company"; data: PersonRow | CompanyRow } | null>(null);
  const openEnrich = (id: string) => {
    setClassifyingId(id);
    if (selected?.kind === "company") enrich.mutate({ companyId: id });
    else enrich.mutate({ personId: id });
  };

  const peopleRows = (people.data?.data ?? [])
    .filter((p) => sourceFilter === "all" || sourceBucket(p.source)?.label === sourceFilter)
    .filter((p) => !workspaceId || wsShowAll || p.workspaceId === workspaceId);

  const peopleCols: Column<PersonRow>[] = [
    { key: "fullName", label: "Nama", sortable: true, sortValue: (p) => p.fullName, render: (p) => (
      <span><span className="font-medium">{p.fullName}</span>{p.honorific ? <span className="ml-1 text-[10px] text-muted-foreground">({p.honorific})</span> : null}</span>
    ) },
    { key: "title", label: "Jabatan", sortable: true, sortValue: (p) => p.title ?? "", render: (p) => p.title ?? "—" },
    { key: "companyName", label: "Perusahaan", sortable: true, sortValue: (p) => p.companyName ?? "", render: (p) => p.companyName ?? "—" },
    { key: "leadType", label: "Tipe", sortable: true, sortValue: (p) => p.leadType ?? "", render: (p) => <LeadTypeBadge leadType={p.leadType} /> },
    { key: "location", label: "Lokasi", sortable: true, sortValue: (p) => p.location ?? "", render: (p) => p.location ?? "—" },
    { key: "contacts", label: "Kontak", sortValue: (p) => p.contacts.length, render: (p) => (p.contacts.length ? `${p.contacts.length}` : "—") },
    { key: "source", label: "Sumber", sortValue: (p) => p.source ?? "", render: (p) => { const s = sourceBucket(p.source); return s ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", s.cls)}>{s.label}</span> : "—"; } },
    { key: "assign", label: "Sales", render: (p) => (
      <select onClick={(e) => e.stopPropagation()} value={p.assignedTo ?? ""} onChange={(e) => assign.mutate({ personId: p.id, assignedTo: e.target.value || null })} className="rounded border bg-background px-1 py-0.5 text-[11px]">
        <option value="">—</option>
        {(membersQ.data ?? []).map((m) => (<option key={m.userId} value={m.userId}>{m.name}</option>))}
      </select>
    ) },
  ];
  const companyCols: Column<CompanyRow>[] = [
    { key: "name", label: "Nama", sortable: true, sortValue: (c) => c.name, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "industry", label: "Industri", sortable: true, sortValue: (c) => c.industry ?? "", render: (c) => c.industry ?? "—" },
    { key: "domain", label: "Domain", sortValue: (c) => c.domain ?? "", render: (c) => c.domain ?? "—" },
    { key: "peopleCount", label: "Orang", sortable: true, align: "right", sortValue: (c) => c.peopleCount, render: (c) => String(c.peopleCount) },
    { key: "contacts", label: "Kontak", sortValue: (c) => c.contacts.length, render: (c) => (c.contacts.length ? `${c.contacts.length}` : "—") },
  ];

  return (
    <div>
      <PageHeader
        title="Profil"
        description="Profiling terpisah — Perusahaan vs Orang — dengan provenance & status consent (doc 20)."
      />
      <div className="p-6">
        <Tabs defaultValue="perusahaan">
          <TabsList>
            <TabsTrigger value="perusahaan" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Perusahaan
              <Badge variant="muted" className="ml-1">
                {companies.data?.data.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="orang" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Orang
              <Badge variant="muted" className="ml-1">
                {people.data?.data.length ?? 0}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* ── Perusahaan ─────────────────────────────────────────── */}
          <TabsContent value="perusahaan" className="mt-5">
            {companies.isLoading ? (
              <CardGridSkeleton count={6} />
            ) : (companies.data?.data.length ?? 0) === 0 ? (
              <EmptyState
                icon={Building2}
                title="Belum ada perusahaan"
                description="Mulai dari Discovery untuk crawl prospek B2B — nama, domain, email, telepon, & sosmed perusahaan terekstrak otomatis dari websitenya."
                action={
                  <Button asChild>
                    <Link href="/contacts/discovery">
                      <Radar className="h-4 w-4" /> Mulai Discovery
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setClassifyingId("__cos__"); enrich.mutate({ allCompanies: true }); }}
                    disabled={enrich.isPending}
                  >
                    <Sparkles className="h-4 w-4" />
                    {classifyingId === "__cos__" && enrich.isPending ? "Mencari di web…" : "Cari domain & kontak (web)"}
                  </Button>
                </div>
                <DataTable
                  columns={companyCols}
                  rows={companies.data?.data ?? []}
                  getRowId={(c) => c.id}
                  onRowClick={(c) => setSelected({ kind: "company", data: c })}
                />
              </>
            )}
          </TabsContent>

          {/* ── Orang ──────────────────────────────────────────────── */}
          <TabsContent value="orang" className="mt-5">
            {people.isLoading ? (
              <CardGridSkeleton count={6} />
            ) : (people.data?.data.length ?? 0) === 0 ? (
              <EmptyState
                icon={Users}
                title="Belum ada kontak orang"
                description="Kontak per-orang (nama, jabatan, email) didapat saat crawl URL + Hunter.io aktif. Mulai Discovery dengan URL perusahaan target."
                action={
                  <Button asChild>
                    <Link href="/contacts/discovery">
                      <Radar className="h-4 w-4" /> Mulai Discovery
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                {workspaceId && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <span>
                      Workspace <b>{wsQ.data?.data?.name ?? "ini"}</b> —{" "}
                      {wsShowAll ? "semua lead (klik + workspace untuk menambah)" : "hanya lead workspace ini"}.
                    </span>
                    <button onClick={() => setWsShowAll((v) => !v)} className="ml-auto text-xs text-primary hover:underline">
                      {wsShowAll ? "Tampilkan workspace saja" : "Tambah lead…"}
                    </button>
                  </div>
                )}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sumber:</span>
                    <select
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                    >
                      <option value="all">Semua</option>
                      <option value="Crawl">Crawl</option>
                      <option value="Impor">Impor</option>
                      <option value="Hunter">Hunter</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setClassifyingId("__all__");
                      enrich.mutate({ all: true });
                    }}
                    disabled={enrich.isPending}
                  >
                    <Sparkles className="h-4 w-4" />
                    {classifyingId === "__all__" && enrich.isPending ? "Mencari di web…" : "Cari kontak & profil (web)"}
                  </Button>
                </div>
                <DataTable
                  columns={peopleCols}
                  rows={peopleRows}
                  getRowId={(p) => p.id}
                  onRowClick={(p) => setSelected({ kind: "person", data: p })}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <ProfileDetailSheet
        kind={selected?.kind ?? null}
        data={selected?.data ?? null}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        onEnrich={openEnrich}
        enriching={enrich.isPending}
      />
    </div>
  );
}

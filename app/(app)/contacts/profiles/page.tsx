"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Building2, Handshake, MapPin, Radar, Sparkles, User2, UserCircle2, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
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
  opted_in: { cls: "bg-success/10 text-emerald-700", label: "Opt-in" },
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

function ContactRow({ cp }: { cp: ContactPoint }) {
  const consent = CONSENT[cp.consentStatus] ?? CONSENT.unknown;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
        {CHANNEL_LABEL[cp.channel] ?? cp.channel}
      </span>
      <span className="font-mono text-foreground">{cp.value}</span>
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
  const classify = useMutation({
    mutationFn: async (body: { personId?: string; all?: boolean }) => {
      const r = await fetch("/api/profiles/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { ok: boolean; count: number };
    },
    onSuccess: (d) => {
      toast.success(`Klasifikasi selesai — ${d.count} kontak diperbarui`);
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: () => toast.error("Klasifikasi gagal — pastikan model AI aktif & DB tersambung"),
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
              <p className="text-sm text-muted-foreground">Memuat…</p>
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
              <div className="grid gap-3 md:grid-cols-2">
                {companies.data?.data.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[c.industry, c.domain].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Badge variant="muted" className="shrink-0 gap-1">
                          <Users className="h-3 w-3" />
                          {c.peopleCount} orang
                        </Badge>
                      </div>
                      {c.summary && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.summary}</p>
                      )}
                      {c.contacts.length > 0 && (
                        <div className="mt-3 space-y-1.5 border-t pt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Kontak perusahaan
                          </p>
                          {c.contacts.map((cp) => (
                            <ContactRow key={cp.id} cp={cp} />
                          ))}
                        </div>
                      )}
                      <Provenance source={c.source} mode={c.capturedMode} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Orang ──────────────────────────────────────────────── */}
          <TabsContent value="orang" className="mt-5">
            {people.isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
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
                      classify.mutate({ all: true });
                    }}
                    disabled={classify.isPending}
                  >
                    <Sparkles className="h-4 w-4" />
                    {classifyingId === "__all__" && classify.isPending ? "Mengklasifikasi…" : "Klasifikasi yang belum"}
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {people.data?.data
                    .filter((p) => sourceFilter === "all" || sourceBucket(p.source)?.label === sourceFilter)
                    .map((p) => {
                    const stale = staleInfo(p.capturedAt);
                    const src = sourceBucket(p.source);
                    return (
                      <Card key={p.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold">{p.fullName}</p>
                              <p className="text-xs text-muted-foreground">
                                {[p.title, p.companyName].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 shrink-0 px-2 text-xs"
                              onClick={() => {
                                setClassifyingId(p.id);
                                classify.mutate({ personId: p.id });
                              }}
                              disabled={classify.isPending && classifyingId === p.id}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {classifyingId === p.id && classify.isPending ? "…" : "Klasifikasi"}
                            </Button>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <LeadTypeBadge leadType={p.leadType} />
                            {src && (
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", src.cls)}>{src.label}</span>
                            )}
                            {stale.stale && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                <AlertTriangle className="h-3 w-3" /> {stale.label}
                              </span>
                            )}
                          </div>
                          {p.leadReason && <p className="mt-1.5 text-[11px] italic text-muted-foreground">“{p.leadReason}”</p>}

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {p.department && <span>{p.department}</span>}
                            {p.location && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {p.location}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <UserCircle2 className="h-3 w-3" />
                              <select
                                value={p.assignedTo ?? ""}
                                onChange={(e) => assign.mutate({ personId: p.id, assignedTo: e.target.value || null })}
                                className="rounded border bg-background px-1 py-0.5 text-[11px] text-foreground"
                                title="Assign lead ke sales"
                              >
                                <option value="">Belum di-assign</option>
                                {(membersQ.data ?? []).length === 0 && <option disabled>(belum ada anggota tim)</option>}
                                {(membersQ.data ?? []).map((m) => (
                                  <option key={m.userId} value={m.userId}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </span>
                          </div>
                          {p.contacts.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t pt-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Kontak orang
                              </p>
                              {p.contacts.map((cp) => (
                                <ContactRow key={cp.id} cp={cp} />
                              ))}
                            </div>
                          )}
                          <Provenance source={p.source} mode={p.capturedMode} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

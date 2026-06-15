"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  contacts: ContactPoint[];
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
      >
        <Link
          href="/contacts/discovery"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Building2 className="h-4 w-4" /> Discovery
        </Link>
      </PageHeader>
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
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {people.data?.data.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4">
                      <p className="font-semibold">{p.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.title, p.companyName].filter(Boolean).join(" · ")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {p.department && <span>{p.department}</span>}
                        {p.location && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {p.location}
                          </span>
                        )}
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
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

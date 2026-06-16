"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ShoppingCart, Store, Upload, User2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { formatIDR } from "@/lib/utils/format-idr";

interface Listing {
  id: string;
  entityType: "company" | "person";
  title: string;
  summary: string | null;
  category: string | null;
  channels: string[];
  priceIdr: number;
  consentStatus: string | null;
}
interface CompanyRow { id: string; name: string; industry?: string | null; domain?: string | null }
interface PersonRow { id: string; fullName: string; title?: string | null; leadType?: string | null; location?: string | null }

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email", whatsapp: "WA", phone: "Telp", linkedin: "LinkedIn", instagram: "IG", web: "Website", website: "Website",
};
function ChannelBadges({ channels }: { channels: string[] }) {
  if (!channels?.length) return <span className="text-[11px] text-muted-foreground">tanpa kontak</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((c) => (
        <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{CHANNEL_LABEL[c] ?? c}</span>
      ))}
    </div>
  );
}
function ConsentBadge({ s }: { s: string | null }) {
  if (!s || s === "unknown") return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">consent: unknown</span>;
  if (s === "opted_in") return <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">opt-in</span>;
  return <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">{s}</span>;
}

export default function MarketplacePage() {
  const qc = useQueryClient();
  const [pfilter, setPfilter] = useState(""); // jabatan/title
  const [ploc, setPloc] = useState(""); // lokasi
  const [plead, setPlead] = useState("all");
  const [category, setCategory] = useState("");
  const [selPeople, setSelPeople] = useState<Set<string>>(new Set());
  const [selCos, setSelCos] = useState<Set<string>>(new Set());

  const browseQ = useQuery({
    queryKey: ["marketplace-browse"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace");
      if (!r.ok) return { enabled: false, data: [] as Listing[] };
      return (await r.json()) as { enabled: boolean; data: Listing[] };
    },
  });
  const companiesQ = useQuery({ queryKey: ["companies"], queryFn: async () => ((await (await fetch("/api/db/companies")).json()).data ?? []) as CompanyRow[] });
  const peopleQ = useQuery({ queryKey: ["people"], queryFn: async () => ((await (await fetch("/api/db/people")).json()).data ?? []) as PersonRow[] });

  const acquire = useMutation({
    mutationFn: async (listingId: string) => {
      const r = await fetch("/api/marketplace/acquire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: (d) => { toast.success(`Diambil: ${d.name}`); qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["people"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const publish = useMutation({
    mutationFn: async (v: { entityType: "company" | "person"; entityIds: string[]; category?: string }) => {
      const r = await fetch("/api/marketplace/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return (await r.json()) as { published: number; skipped: { id: string; reason: string }[] };
    },
    onSuccess: (d) => {
      const skip = d.skipped.length ? ` · ${d.skipped.length} dilewati (${[...new Set(d.skipped.map((s) => s.reason))].join(", ")})` : "";
      toast.success(`${d.published} dipublikasikan${skip}`);
      setSelPeople(new Set()); setSelCos(new Set());
      qc.invalidateQueries({ queryKey: ["marketplace-browse"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  const filteredPeople = useMemo(() => {
    const f = pfilter.trim().toLowerCase();
    const loc = ploc.trim().toLowerCase();
    return (peopleQ.data ?? []).filter((p) => {
      if (plead !== "all" && (p.leadType ?? "") !== plead) return false;
      if (f && !`${p.title ?? ""} ${p.fullName}`.toLowerCase().includes(f)) return false;
      if (loc && !(p.location ?? "").toLowerCase().includes(loc)) return false;
      return true;
    });
  }, [peopleQ.data, pfilter, ploc, plead]);

  if (browseQ.data && !browseQ.data.enabled) {
    return (
      <div>
        <PageHeader title="Marketplace Kontak" description="Jual-beli data perusahaan & orang antar-tenant (doc 41 §6)." />
        <div className="p-6"><EmptyState icon={Store} title="Marketplace nonaktif" description="Platform mode on-prem. Superadmin bisa aktifkan mode SaaS di Superadmin Console." /></div>
      </div>
    );
  }
  const listings = browseQ.data?.data ?? [];
  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };

  return (
    <div>
      <PageHeader title="Marketplace Kontak" description="Jual-beli data perusahaan & orang antar-tenant. Data orang opted-out diblok (UU PDP)." />
      <div className="p-6">
        <Tabs defaultValue="jelajah">
          <TabsList>
            <TabsTrigger value="jelajah" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Jelajah</TabsTrigger>
            <TabsTrigger value="publikasi" className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Publikasikan</TabsTrigger>
          </TabsList>

          {/* Browse + acquire */}
          <TabsContent value="jelajah" className="mt-5">
            {listings.length === 0 ? (
              <EmptyState icon={Store} title="Belum ada listing" description="Belum ada tenant lain yang publikasi. Publikasikan punyamu di tab sebelah." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {listings.map((l) => (
                  <Card key={l.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="muted" className="gap-1">
                          {l.entityType === "company" ? <Building2 className="h-3 w-3" /> : <User2 className="h-3 w-3" />}
                          {l.entityType === "company" ? "Perusahaan" : "Orang"}
                        </Badge>
                        <span className="text-xs font-semibold">{l.priceIdr > 0 ? formatIDR(l.priceIdr) : "Gratis"}</span>
                      </div>
                      <p className="mt-2 font-semibold">{l.title}</p>
                      {l.category && <p className="text-[11px] font-medium text-primary">{l.category}</p>}
                      {l.summary && <p className="text-xs text-muted-foreground">{l.summary}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <ChannelBadges channels={l.channels} />
                        {l.entityType === "person" && <ConsentBadge s={l.consentStatus} />}
                      </div>
                      <Button size="sm" className="mt-3 w-full" onClick={() => acquire.mutate(l.id)} disabled={acquire.isPending}>
                        <ShoppingCart className="h-3.5 w-3.5" /> Ambil ke kontak saya
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Publish — bulk by filter + category */}
          <TabsContent value="publikasi" className="mt-5 space-y-5">
            <div className="rounded-lg border bg-card p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Pilih kontak (centang) lalu publikasikan sekaligus. <b>Perusahaan</b>: nama+website+email+HP. <b>Orang</b>: sosmed+WA+email
                (opted-out diblok). Harga default platform: <b>perusahaan Rp100</b> · <b>orang Rp50</b>.
              </p>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Nama publikasi (mis. AI Engineer Jakarta)" className="h-9" />
            </div>

            {/* People */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orang</p>
                <Input value={pfilter} onChange={(e) => setPfilter(e.target.value)} placeholder="filter jabatan/nama…" className="h-7 w-40 text-xs" />
                <Input value={ploc} onChange={(e) => setPloc(e.target.value)} placeholder="filter lokasi…" className="h-7 w-32 text-xs" />
                <select value={plead} onChange={(e) => setPlead(e.target.value)} className="h-7 rounded-md border bg-background px-2 text-xs">
                  <option value="all">Semua tipe</option>
                  <option value="b2c_customer">B2C</option>
                  <option value="b2b_partner">B2B</option>
                </select>
                <span className="text-[11px] text-muted-foreground">{selPeople.size} dipilih dari {filteredPeople.length}</span>
                <Button size="sm" className="ml-auto h-7 text-xs" disabled={!selPeople.size || publish.isPending}
                  onClick={() => publish.mutate({ entityType: "person", entityIds: [...selPeople], category })}>
                  Publikasikan {selPeople.size} orang
                </Button>
              </div>
              <div className="grid max-h-72 gap-1.5 overflow-auto sm:grid-cols-2">
                {filteredPeople.slice(0, 200).map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent">
                    <input type="checkbox" checked={selPeople.has(p.id)} onChange={() => toggle(selPeople, p.id, setSelPeople)} />
                    <span className="min-w-0 truncate">{p.fullName}<span className="text-muted-foreground"> · {p.title ?? "—"}</span></span>
                  </label>
                ))}
                {filteredPeople.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada orang cocok filter.</p>}
              </div>
            </div>

            {/* Companies */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perusahaan</p>
                <span className="text-[11px] text-muted-foreground">{selCos.size} dipilih</span>
                <Button size="sm" className="ml-auto h-7 text-xs" disabled={!selCos.size || publish.isPending}
                  onClick={() => publish.mutate({ entityType: "company", entityIds: [...selCos], category })}>
                  Publikasikan {selCos.size} perusahaan
                </Button>
              </div>
              <div className="grid max-h-60 gap-1.5 overflow-auto sm:grid-cols-2">
                {(companiesQ.data ?? []).slice(0, 200).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent">
                    <input type="checkbox" checked={selCos.has(c.id)} onChange={() => toggle(selCos, c.id, setSelCos)} />
                    <span className="min-w-0 truncate">{c.name}<span className="text-muted-foreground"> · {c.industry ?? "—"}</span></span>
                  </label>
                ))}
                {(companiesQ.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Belum ada perusahaan.</p>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

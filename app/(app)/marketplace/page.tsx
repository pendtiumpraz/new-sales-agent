"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ShoppingCart, Store, Upload, User2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { formatIDR } from "@/lib/utils/format-idr";

interface Listing {
  id: string;
  entityType: "company" | "person";
  title: string;
  summary: string | null;
  priceIdr: number;
  sellerTenantId: string;
}
interface CompanyRow { id: string; name: string; industry?: string | null; domain?: string | null }
interface PersonRow { id: string; fullName: string; title?: string | null; location?: string | null }

export default function MarketplacePage() {
  const qc = useQueryClient();

  const browseQ = useQuery({
    queryKey: ["marketplace-browse"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace");
      if (!r.ok) return { enabled: false, data: [] as Listing[] };
      return (await r.json()) as { enabled: boolean; data: Listing[] };
    },
  });
  const companiesQ = useQuery({
    queryKey: ["companies"],
    queryFn: async () => ((await (await fetch("/api/db/companies")).json()).data ?? []) as CompanyRow[],
  });
  const peopleQ = useQuery({
    queryKey: ["people"],
    queryFn: async () => ((await (await fetch("/api/db/people")).json()).data ?? []) as PersonRow[],
  });

  const acquire = useMutation({
    mutationFn: async (listingId: string) => {
      const r = await fetch("/api/marketplace/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: (d) => {
      toast.success(`Diambil: ${d.name} — masuk ke kontak Anda`);
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengambil"),
  });
  const publish = useMutation({
    mutationFn: async (v: { entityType: "company" | "person"; entityId: string }) => {
      const r = await fetch("/api/marketplace/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Dipublikasikan ke marketplace");
      qc.invalidateQueries({ queryKey: ["marketplace-browse"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal publikasi"),
  });

  if (browseQ.data && !browseQ.data.enabled) {
    return (
      <div>
        <PageHeader title="Marketplace Kontak" description="Jual-beli data perusahaan & orang antar-tenant (doc 41 §6)." />
        <div className="p-6">
          <EmptyState
            icon={Store}
            title="Marketplace nonaktif"
            description="Platform sedang mode on-prem. Superadmin bisa mengaktifkan mode SaaS di Superadmin Console."
          />
        </div>
      </div>
    );
  }

  const listings = browseQ.data?.data ?? [];

  return (
    <div>
      <PageHeader title="Marketplace Kontak" description="Jual-beli data perusahaan & orang antar-tenant. Data orang wajib ber-consent (UU PDP)." />
      <div className="p-6">
        <Tabs defaultValue="jelajah">
          <TabsList>
            <TabsTrigger value="jelajah" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Jelajah</TabsTrigger>
            <TabsTrigger value="publikasi" className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Publikasikan</TabsTrigger>
          </TabsList>

          {/* Browse + acquire */}
          <TabsContent value="jelajah" className="mt-5">
            {listings.length === 0 ? (
              <EmptyState icon={Store} title="Belum ada listing" description="Belum ada tenant lain yang mempublikasikan kontak. Publikasikan punyamu di tab sebelah." />
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
                      {l.summary && <p className="text-xs text-muted-foreground">{l.summary}</p>}
                      <Button size="sm" className="mt-3 w-full" onClick={() => acquire.mutate(l.id)} disabled={acquire.isPending}>
                        <ShoppingCart className="h-3.5 w-3.5" /> Ambil ke kontak saya
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Publish my entities */}
          <TabsContent value="publikasi" className="mt-5 space-y-5">
            <p className="text-xs text-muted-foreground">
              Publikasikan ke pool platform. <b>Perusahaan</b> bebas; <b>orang</b> hanya yang ber-consent (opt-in/legitimate interest).
            </p>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perusahaan</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(companiesQ.data ?? []).slice(0, 30).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                    <span className="min-w-0 truncate">{c.name}<span className="text-muted-foreground"> · {c.industry ?? "—"}</span></span>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={publish.isPending}
                      onClick={() => publish.mutate({ entityType: "company", entityId: c.id })}>Publikasikan</Button>
                  </div>
                ))}
                {(companiesQ.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Belum ada perusahaan.</p>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orang (consent-gated)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(peopleQ.data ?? []).slice(0, 30).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                    <span className="min-w-0 truncate">{p.fullName}<span className="text-muted-foreground"> · {p.title ?? "—"}</span></span>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={publish.isPending}
                      onClick={() => publish.mutate({ entityType: "person", entityId: p.id })}>Publikasikan</Button>
                  </div>
                ))}
                {(peopleQ.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Belum ada orang.</p>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

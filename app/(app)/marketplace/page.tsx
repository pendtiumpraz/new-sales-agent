"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Building2, ShoppingCart, Store, Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { Toolbar } from "@/components/shared/toolbar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { useAuthStore } from "@/lib/stores/auth-store";
import { formatIDR } from "@/lib/utils/format-idr";

interface Listing {
  id: string;
  entityType: "company" | "person" | "bundle";
  title: string;
  summary: string | null;
  category: string | null;
  channels: string[];
  priceIdr: number;
  consentStatus: string | null;
  status?: string;
  bundleItems?: string[] | null;
  pricingMode?: string | null;
}
interface CompanyRow { id: string; name: string; industry?: string | null; domain?: string | null }

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

export default function MarketplacePage() {
  // Manager-only feature — a rep reaching this URL directly gets a gate, not the
  // cross-tenant pool (matches the sidebar guard + the manager-only API).
  const isRep = useAuthStore((s) => s.currentUser.role) === "Sales Rep";
  if (isRep) {
    return (
      <div>
        <PageHeader title="Marketplace Data" description="Jual-beli data perusahaan antar-tenant." />
        <div className="p-6">
          <EmptyState
            icon={Store}
            title="Khusus manajer"
            description="Marketplace data perusahaan antar-tenant hanya untuk manajer/owner. Hubungi manajermu untuk akses."
          />
        </div>
      </div>
    );
  }
  return <MarketplaceInner />;
}

function MarketplaceInner() {
  const qc = useQueryClient();
  const [selCos, setSelCos] = useState<Set<string>>(new Set());
  // Bundle builder (company-only) — people can't be sold.
  const [bundleName, setBundleName] = useState("");
  const [pricingMode, setPricingMode] = useState<"per_bundle" | "per_company">("per_bundle");
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [cfilter, setCfilter] = useState("");
  const [cindustry, setCindustry] = useState("all");
  // Browse-tab filters (separate from the publish-tab company picker above).
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseCat, setBrowseCat] = useState("all");

  const browseQ = useQuery({
    queryKey: ["marketplace-browse"],
    queryFn: async () => {
      const r = await fetch("/api/marketplace");
      if (!r.ok) return { enabled: false, data: [] as Listing[] };
      return (await r.json()) as { enabled: boolean; data: Listing[] };
    },
  });
  // Distinct keys: these return arrays, but /contacts/profiles caches ["companies"]/
  // ["people"] as {data:[…]} objects — sharing the key crashes marketplace (.filter
  // on an object). Keep them separate (doc 41 §6).
  const companiesQ = useQuery({ queryKey: ["mp-companies"], queryFn: async () => ((await (await fetch("/api/db/companies")).json()).data ?? []) as CompanyRow[] });

  const acquire = useMutation({
    mutationFn: async (listingId: string) => {
      const r = await fetch("/api/marketplace/acquire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: (d) => {
      toast.success(`Diambil: ${d.name}`);
      // refresh both the marketplace publish-source lists and the contacts pages
      for (const k of ["mp-companies", "mp-people", "companies", "people"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  // Create a COMPANY bundle (multi-bundle = run repeatedly). People can't be sold.
  const bundleMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/marketplace/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: bundleName.trim(), industry: cindustry === "all" ? null : cindustry, companyIds: [...selCos], pricingMode, unitPrice }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.error ?? "gagal");
      return j as { count: number };
    },
    onSuccess: (d) => {
      toast.success(`Bundle "${bundleName.trim()}" dibuat — ${d.count} perusahaan`);
      setSelCos(new Set());
      setBundleName("");
      qc.invalidateQueries({ queryKey: ["marketplace-browse"] });
      qc.invalidateQueries({ queryKey: ["marketplace-mine"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat bundle"),
  });

  // doc audit #6 — your own listings + delist/relist (was a dead-end: no unpublish).
  const mineQ = useQuery({
    queryKey: ["marketplace-mine"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => ((await (await fetch("/api/marketplace?scope=mine")).json()).data ?? []) as any[],
  });
  const delistMut = useMutation({
    mutationFn: async (v: { listingId: string; relist: boolean }) => {
      const r = await fetch("/api/marketplace/delist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.error ?? "gagal");
      return j;
    },
    onSuccess: (_d, v) => {
      toast.success(v.relist ? "Listing diaktifkan lagi" : "Listing ditarik (delisted)");
      qc.invalidateQueries({ queryKey: ["marketplace-mine"] });
      qc.invalidateQueries({ queryKey: ["marketplace-browse"] });
    },
    onError: () => toast.error("Gagal (cek hak akses & DB)"),
  });

  const coIndustries = useMemo(
    () => [...new Set((companiesQ.data ?? []).map((c) => c.industry).filter(Boolean) as string[])].sort(),
    [companiesQ.data],
  );
  const filteredCompanies = useMemo(() => {
    const f = cfilter.trim().toLowerCase();
    return (companiesQ.data ?? []).filter((c) => {
      if (cindustry !== "all" && (c.industry ?? "") !== cindustry) return false;
      if (f && !`${c.name} ${c.domain ?? ""} ${c.industry ?? ""}`.toLowerCase().includes(f)) return false;
      return true;
    });
  }, [companiesQ.data, cfilter, cindustry]);

  if (browseQ.isLoading) {
    return (
      <div>
        <PageHeader title="Marketplace Kontak" description="Jual-beli data perusahaan & orang antar-tenant. Data orang opted-out diblok (UU PDP)." />
        <div className="p-6"><CardGridSkeleton count={6} /></div>
      </div>
    );
  }

  if (browseQ.data && !browseQ.data.enabled) {
    return (
      <div>
        <PageHeader title="Marketplace Kontak" description="Jual-beli data perusahaan & orang antar-tenant (doc 41 §6)." />
        <div className="p-6"><EmptyState icon={Store} title="Marketplace nonaktif" description="Platform mode on-prem. Superadmin bisa aktifkan mode SaaS di Superadmin Console." /></div>
      </div>
    );
  }
  // People can't be sold — only companies + bundles appear in the pool.
  const listings = (browseQ.data?.data ?? []).filter((l) => l.entityType !== "person");
  // Plain consts (not hooks): this is after the early returns above.
  const listingCats = [...new Set(listings.map((l) => l.category).filter(Boolean) as string[])].sort();
  const visibleListings = listings.filter((l) => {
    if (browseCat !== "all" && (l.category ?? "") !== browseCat) return false;
    const s = browseSearch.trim().toLowerCase();
    if (s && !`${l.title} ${l.category ?? ""} ${l.summary ?? ""}`.toLowerCase().includes(s)) return false;
    return true;
  });
  const browseColumns: DataColumn<Listing>[] = [
    {
      key: "type",
      header: "Tipe",
      cell: (l) => (
        <Badge variant="muted" className="gap-1">
          {l.entityType === "bundle" ? <Boxes className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
          {l.entityType === "bundle" ? `Bundle · ${l.bundleItems?.length ?? 0} PT` : "Perusahaan"}
        </Badge>
      ),
    },
    {
      key: "title",
      header: "Nama",
      sortValue: (l) => l.title.toLowerCase(),
      cell: (l) => (
        <div className="min-w-0">
          <p className="font-medium">{l.title}</p>
          {l.category && <p className="text-[11px] font-medium text-primary">{l.category}</p>}
          {l.summary && <p className="truncate text-xs text-muted-foreground">{l.summary}</p>}
        </div>
      ),
    },
    { key: "channels", header: "Channel", cell: (l) => <ChannelBadges channels={l.channels} /> },
    {
      key: "price",
      header: "Harga",
      align: "right",
      sortValue: (l) => l.priceIdr,
      cell: (l) => (
        <span className="font-semibold">
          {l.priceIdr > 0 ? formatIDR(l.priceIdr) : "Gratis"}
          {l.entityType === "bundle" && l.pricingMode === "per_company" ? " /PT" : ""}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (l) => (
        <Button size="sm" variant="outline" onClick={() => acquire.mutate(l.id)} disabled={acquire.isPending}>
          <ShoppingCart className="h-3.5 w-3.5" />
          {l.entityType === "bundle" ? `Ambil (${l.bundleItems?.length ?? 0})` : "Ambil"}
        </Button>
      ),
    },
  ];
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
            <TabsTrigger value="saya" className="gap-1.5"><Store className="h-3.5 w-3.5" /> Listing saya</TabsTrigger>
          </TabsList>

          {/* Browse + acquire */}
          <TabsContent value="jelajah" className="mt-5 space-y-4">
            <Toolbar
              search={browseSearch}
              onSearch={setBrowseSearch}
              searchPlaceholder="Cari perusahaan / bundle…"
              filters={
                <Select value={browseCat} onValueChange={setBrowseCat}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Semua bidang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua bidang</SelectItem>
                    {listingCats.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <DataTable
              columns={browseColumns}
              data={visibleListings}
              rowKey={(l) => l.id}
              pageSize={12}
              emptyIcon={Store}
              emptyTitle={browseSearch || browseCat !== "all" ? "Tidak ada listing yang cocok" : "Belum ada listing"}
              emptyDescription={
                browseSearch || browseCat !== "all"
                  ? undefined
                  : "Belum ada tenant lain yang publikasi. Publikasikan punyamu di tab sebelah."
              }
            />
          </TabsContent>

          {/* Buat bundle perusahaan — orang TIDAK boleh dijual */}
          <TabsContent value="publikasi" className="mt-5 space-y-4">
            <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
              <b className="text-foreground">Hanya perusahaan</b> yang bisa dijual — data orang tidak boleh (UU PDP). Pilih perusahaan (filter bidang), beri nama bundle & harga, lalu publikasikan. Bisa buat <b className="text-foreground">banyak bundle</b> sekaligus — 50, 100, berapa pun.
            </div>

            {/* Bundle config */}
            <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Nama bundle</label>
                <Input value={bundleName} onChange={(e) => setBundleName(e.target.value)} placeholder="mis. Logistik Jabodetabek 100" className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Mode harga</label>
                <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as "per_bundle" | "per_company")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="per_bundle">Per bundle (harga total)</option>
                  <option value="per_company">Per perusahaan (× jumlah)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{pricingMode === "per_company" ? "Harga / perusahaan (Rp)" : "Harga bundle (Rp)"}</label>
                <Input type="number" min={0} value={unitPrice || ""} onChange={(e) => setUnitPrice(Number(e.target.value) || 0)} placeholder="0" className="h-9" />
              </div>
              <div className="flex items-end">
                <Button className="w-full" disabled={!selCos.size || !bundleName.trim() || bundleMut.isPending} onClick={() => bundleMut.mutate()}>
                  {bundleMut.isPending ? "Membuat…" : `Buat bundle (${selCos.size})`}
                </Button>
              </div>
            </div>
            {unitPrice > 0 && selCos.size > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {pricingMode === "per_company" ? (
                  <>Total: <b>{formatIDR(unitPrice * selCos.size)}</b> ({selCos.size} × {formatIDR(unitPrice)})</>
                ) : (
                  <>Harga bundle: <b>{formatIDR(unitPrice)}</b> untuk {selCos.size} perusahaan</>
                )}
              </p>
            )}

            {/* Company selector — filter bidang + pilih bebas */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perusahaan</p>
                <Input value={cfilter} onChange={(e) => setCfilter(e.target.value)} placeholder="cari nama/domain…" className="h-7 w-44 text-xs" />
                <select value={cindustry} onChange={(e) => setCindustry(e.target.value)} className="h-7 rounded-md border bg-background px-2 text-xs">
                  <option value="all">Semua bidang</option>
                  {coIndustries.map((i) => (<option key={i} value={i}>{i}</option>))}
                </select>
                <span className="text-[11px] text-muted-foreground">{selCos.size} dipilih dari {filteredCompanies.length}</span>
                <button type="button" onClick={() => setSelCos(new Set(filteredCompanies.map((c) => c.id)))} className="text-[11px] text-primary hover:underline">Pilih semua ({filteredCompanies.length})</button>
                <button type="button" onClick={() => setSelCos(new Set())} className="text-[11px] text-muted-foreground hover:underline">Kosongkan</button>
              </div>
              <div className="grid max-h-72 gap-1.5 overflow-auto sm:grid-cols-2">
                {filteredCompanies.slice(0, 500).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent">
                    <input type="checkbox" checked={selCos.has(c.id)} onChange={() => toggle(selCos, c.id, setSelCos)} />
                    <span className="min-w-0 truncate">{c.name}<span className="text-muted-foreground"> · {c.industry ?? "—"}</span></span>
                  </label>
                ))}
                {filteredCompanies.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada perusahaan cocok filter.</p>}
              </div>
            </div>
          </TabsContent>

          {/* My listings — delist / re-list (doc audit #6) */}
          <TabsContent value="saya" className="mt-5">
            {(mineQ.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Store} title="Belum ada listing milikmu" description="Publikasikan kontak di tab Publikasikan; di sini kamu bisa menariknya kembali (delist)." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {(mineQ.data ?? []).map((l) => {
                  const delisted = l.status === "delisted";
                  return (
                    <Card key={l.id} className={delisted ? "opacity-60" : undefined}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <Badge variant="muted" className="gap-1">
                            {l.entityType === "bundle" ? <Boxes className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                            {l.entityType === "bundle" ? `Bundle · ${(l.bundleItems?.length ?? 0)} PT` : l.entityType === "person" ? "Orang (lama)" : "Perusahaan"}
                          </Badge>
                          <span className="text-xs font-semibold">{l.priceIdr > 0 ? formatIDR(l.priceIdr) : "Gratis"}{l.entityType === "bundle" && l.pricingMode === "per_company" ? " /PT" : ""}</span>
                        </div>
                        <p className="mt-2 font-semibold">{l.title}</p>
                        {l.category && <p className="text-[11px] font-medium text-primary">{l.category}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">Status: {delisted ? "Ditarik (delisted)" : "Aktif"}</p>
                        <Button
                          size="sm"
                          variant={delisted ? "outline" : "destructive"}
                          className="mt-3 w-full"
                          disabled={delistMut.isPending}
                          onClick={() => delistMut.mutate({ listingId: l.id, relist: delisted })}
                        >
                          {delisted ? "Aktifkan lagi" : "Tarik dari marketplace"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

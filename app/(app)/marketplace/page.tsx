"use client";

// Marketplace (lead source) — Module 9 FRONTEND (Sainskerta Loop Phase 04, FINAL
// secondary tick). Wired to the NEW M9 marketplace backend (no mock data): the
// connected channel integrations (tokopedia/shopee/tiktok/lazada) + the product
// listings published on them. Listings that buyers engage with become leads
// upstream, so this is a LEAD SOURCE, not a store. Wires to:
//   GET    /api/marketplace/integrations              (list — MarketplaceIntegrationRow[])
//   GET    /api/marketplace/integrations/trashed      (Sampah view)
//   POST   /api/marketplace/integrations              (connect a store)
//   PATCH  /api/marketplace/integrations/[id]         (manage — store name/channel/status)
//   POST   /api/marketplace/integrations/[id]/sync    (stamp last_sync_at + status)
//   DELETE /api/marketplace/integrations/[id]         (SOFT delete → Sampah, cascade listings)
//   PATCH  /api/marketplace/integrations/[id]/restore (un-trash)
//   DELETE /api/marketplace/integrations/[id]/purge   (HARD delete — irreversible)
//   GET    /api/marketplace/listings                  (list — MarketplaceListingRow[])
//   GET    /api/marketplace/listings/trashed          (Sampah view)
//   POST   /api/marketplace/listings                  (publish a listing)
//   PATCH  /api/marketplace/listings/[id]             (edit — title/price/stock/status)
//   DELETE /api/marketplace/listings/[id]             (SOFT delete)
//   PATCH  /api/marketplace/listings/[id]/restore     (un-trash)
//   DELETE /api/marketplace/listings/[id]/purge       (HARD delete)
//   GET    /api/product                               (resolve product names for the listing form)
// Matches the established design system (Coral Sunset, the (app) shell): stat
// strip, segmented filters + pills + search, list tables, a right drawer, and
// confirm modals. Every band has loading + empty + error states.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronRight,
  Eye,
  Plug,
  Plus,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M9 marketplace backend — { ok, data }) ─────

interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

/** Row from GET /api/marketplace/integrations (modules/marketplace · integration). */
interface IntegrationRow {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  channel: string; // tokopedia | shopee | tiktok | lazada | other
  storeName: string;
  storeId: string | null;
  status: string; // connected | pending | disconnected | error
  config: Record<string, unknown> | null;
  lastSyncAt: string | null;
  listingCount: number;
  connectedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Row from GET /api/marketplace/listings (modules/marketplace · listing_v2). */
interface ListingRow {
  id: string;
  tenantId: string;
  integrationId: string;
  workspaceId: string | null;
  productId: string | null;
  channel: string;
  externalId: string | null;
  title: string;
  url: string | null;
  price: number;
  currency: string;
  stock: number;
  status: string; // draft | active | paused | out_of_stock | removed
  views: number;
  leads: number;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Row from GET /api/product (modules/product · product_v2) — listing form picker. */
interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  status: string;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainTab = "integrasi" | "listing" | "sampah";

const CHANNELS = [
  { value: "tokopedia", label: "Tokopedia" },
  { value: "shopee", label: "Shopee" },
  { value: "tiktok", label: "TikTok Shop" },
  { value: "lazada", label: "Lazada" },
  { value: "other", label: "Lainnya" },
] as const;

const CHANNEL_META: Record<string, { label: string; dot: string }> = {
  tokopedia: { label: "Tokopedia", dot: "#16A34A" },
  shopee: { label: "Shopee", dot: "#EE4D2D" },
  tiktok: { label: "TikTok Shop", dot: "#111111" },
  lazada: { label: "Lazada", dot: "#0F146D" },
  other: { label: "Lainnya", dot: "#6B7280" },
};

const INTEGRATION_STATUSES = ["connected", "pending", "disconnected", "error"] as const;

const INT_STATUS_META: Record<string, { label: string; cls: string }> = {
  connected: { label: "Terhubung", cls: "bg-success/15 text-success" },
  pending: { label: "Menunggu", cls: "bg-warning/15 text-warning" },
  disconnected: { label: "Terputus", cls: "bg-muted text-muted-foreground" },
  error: { label: "Error", cls: "bg-destructive/10 text-destructive" },
};

const LISTING_STATUSES = ["draft", "active", "paused", "out_of_stock", "removed"] as const;

const LISTING_STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-success/15 text-success" },
  draft: { label: "Draf", cls: "bg-muted text-muted-foreground" },
  paused: { label: "Dijeda", cls: "bg-warning/15 text-warning" },
  out_of_stock: { label: "Stok habis", cls: "bg-info/12 text-info" },
  removed: { label: "Dihapus", cls: "bg-destructive/10 text-destructive" },
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function channelMeta(channel: string): { label: string; dot: string } {
  return CHANNEL_META[channel] ?? CHANNEL_META.other;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "TK"
  );
}

function fmtRelID(iso: string | null | undefined): string {
  if (!iso) return "Belum pernah";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Baru saja";
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtIDR(value: number, currency: string): string {
  if (currency === "IDR") {
    if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  return `${currency} ${value.toLocaleString("id-ID")}`;
}

// ── connect/manage drawer state ──────────────────────────────────────────────

interface IntegrationForm {
  open: boolean;
  mode: "create" | "edit";
  id: string | null;
  channel: string;
  storeName: string;
  storeId: string;
  status: string;
}

const EMPTY_INTEGRATION_FORM: IntegrationForm = {
  open: false,
  mode: "create",
  id: null,
  channel: "tokopedia",
  storeName: "",
  storeId: "",
  status: "pending",
};

interface ListingForm {
  open: boolean;
  integrationId: string;
  productId: string;
  title: string;
  price: string;
  stock: string;
  url: string;
  status: string;
}

const EMPTY_LISTING_FORM: ListingForm = {
  open: false,
  integrationId: "",
  productId: "",
  title: "",
  price: "",
  stock: "",
  url: "",
  status: "draft",
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const qc = useQueryClient();

  // live integrations + listings + products (products resolve productId → name)
  const integrationsQ = useQuery({
    queryKey: ["mkt", "integrations", "list"],
    queryFn: async () => readJson<IntegrationRow[]>(await fetch("/api/marketplace/integrations")),
    retry: false,
  });
  const listingsQ = useQuery({
    queryKey: ["mkt", "listings", "list"],
    queryFn: async () => readJson<ListingRow[]>(await fetch("/api/marketplace/listings")),
    retry: false,
  });
  const productsQ = useQuery({
    queryKey: ["mkt", "products", "list"],
    queryFn: async () => readJson<ProductRow[]>(await fetch("/api/product")),
    retry: false,
  });

  const integrations = useMemo(() => integrationsQ.data ?? [], [integrationsQ.data]);
  const listings = useMemo(() => listingsQ.data ?? [], [listingsQ.data]);
  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);

  const integrationById = useMemo(() => {
    const m: Record<string, IntegrationRow> = {};
    for (const i of integrations) m[i.id] = i;
    return m;
  }, [integrations]);
  const productById = useMemo(() => {
    const m: Record<string, ProductRow> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("integrasi");

  // Trashed integrations + listings — lazy (only fetched once Sampah opens), warm.
  const trashedIntQ = useQuery({
    queryKey: ["mkt", "integrations", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () =>
      readJson<IntegrationRow[]>(await fetch("/api/marketplace/integrations/trashed")),
    retry: false,
  });
  const trashedListQ = useQuery({
    queryKey: ["mkt", "listings", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<ListingRow[]>(await fetch("/api/marketplace/listings/trashed")),
    retry: false,
  });
  const trashedInt = useMemo(() => trashedIntQ.data ?? [], [trashedIntQ.data]);
  const trashedList = useMemo(() => trashedListQ.data ?? [], [trashedListQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [chanF, setChanF] = useState<string>("all");
  const [intStatusF, setIntStatusF] = useState<string>("all");
  const [listStatusF, setListStatusF] = useState<string>("all");
  const [intF, setIntF] = useState<string>("all"); // listing → by integration
  const [search, setSearch] = useState("");

  // ── stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const connected = integrations.filter((i) => i.status === "connected").length;
    let activeListings = 0;
    let views = 0;
    let leads = 0;
    for (const l of listings) {
      if (l.status === "active") activeListings++;
      views += l.views;
      leads += l.leads;
    }
    return { connected, integrations: integrations.length, activeListings, views, leads };
  }, [integrations, listings]);

  const visibleIntegrations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return integrations.filter((i) => {
      const okChan = chanF === "all" || i.channel === chanF;
      const okStatus = intStatusF === "all" || i.status === intStatusF;
      const okSearch =
        !q ||
        i.storeName.toLowerCase().includes(q) ||
        (i.storeId ?? "").toLowerCase().includes(q) ||
        channelMeta(i.channel).label.toLowerCase().includes(q);
      return okChan && okStatus && okSearch;
    });
  }, [integrations, chanF, intStatusF, search]);

  const visibleListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      const okInt = intF === "all" || l.integrationId === intF;
      const okStatus = listStatusF === "all" || l.status === listStatusF;
      const okSearch =
        !q ||
        l.title.toLowerCase().includes(q) ||
        (integrationById[l.integrationId]?.storeName ?? "").toLowerCase().includes(q);
      return okInt && okStatus && okSearch;
    });
  }, [listings, intF, listStatusF, search, integrationById]);

  // ── drawers ──────────────────────────────────────────────────────────────────
  const [intForm, setIntForm] = useState<IntegrationForm>(EMPTY_INTEGRATION_FORM);
  const [listForm, setListForm] = useState<ListingForm>(EMPTY_LISTING_FORM);

  function openConnect() {
    setIntForm({ ...EMPTY_INTEGRATION_FORM, open: true, mode: "create" });
  }
  function openManage(i: IntegrationRow) {
    setIntForm({
      open: true,
      mode: "edit",
      id: i.id,
      channel: i.channel,
      storeName: i.storeName,
      storeId: i.storeId ?? "",
      status: i.status,
    });
  }
  function closeIntForm() {
    setIntForm((d) => ({ ...d, open: false }));
  }

  function openPublish() {
    setListForm({
      ...EMPTY_LISTING_FORM,
      open: true,
      integrationId: integrations.find((i) => i.status === "connected")?.id ?? integrations[0]?.id ?? "",
    });
  }
  function closeListForm() {
    setListForm((d) => ({ ...d, open: false }));
  }

  const anyDrawerOpen = intForm.open || listForm.open;
  useEffect(() => {
    if (!anyDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeIntForm();
        closeListForm();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [anyDrawerOpen]);

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteInt, setDeleteInt] = useState<IntegrationRow | null>(null);
  const [restoreInt, setRestoreInt] = useState<IntegrationRow | null>(null);
  const [purgeInt, setPurgeInt] = useState<IntegrationRow | null>(null);
  const [deleteList, setDeleteList] = useState<ListingRow | null>(null);
  const [restoreList, setRestoreList] = useState<ListingRow | null>(null);
  const [purgeList, setPurgeList] = useState<ListingRow | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["mkt"] });
  }

  const connect = useMutation({
    mutationFn: async (f: IntegrationForm) => {
      const body = {
        channel: f.channel,
        storeName: f.storeName.trim(),
        storeId: f.storeId.trim() || null,
        status: f.status,
      };
      return readJson<IntegrationRow>(
        await fetch("/api/marketplace/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, f) => {
      toast.success(`Toko "${f.storeName.trim()}" terhubung`);
      refreshAll();
      closeIntForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghubungkan toko"),
  });

  const manage = useMutation({
    mutationFn: async (f: IntegrationForm) => {
      if (!f.id) throw new Error("Integrasi tidak valid");
      const body = {
        channel: f.channel,
        storeName: f.storeName.trim(),
        storeId: f.storeId.trim() || null,
        status: f.status,
      };
      return readJson<IntegrationRow>(
        await fetch(`/api/marketplace/integrations/${f.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, f) => {
      toast.success(`"${f.storeName.trim()}" diperbarui`);
      refreshAll();
      closeIntForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui integrasi"),
  });

  // Sync = POST /sync — stamps last_sync_at and (if not connected) flips to connected.
  const sync = useMutation({
    mutationFn: async (i: IntegrationRow) =>
      readJson<IntegrationRow>(
        await fetch(`/api/marketplace/integrations/${i.id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(i.status === "connected" ? {} : { status: "connected" }),
        }),
      ),
    onSuccess: (_res, i) => {
      toast.success(`"${i.storeName}" tersinkron`);
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal sinkronisasi"),
  });

  const publish = useMutation({
    mutationFn: async (f: ListingForm) => {
      const body = {
        integrationId: f.integrationId,
        title: f.title.trim(),
        productId: f.productId || null,
        url: f.url.trim() || null,
        price: f.price ? Number(f.price) : 0,
        stock: f.stock ? Number(f.stock) : 0,
        status: f.status,
      };
      return readJson<ListingRow>(
        await fetch("/api/marketplace/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, f) => {
      toast.success(`Listing "${f.title.trim()}" dipublikasikan`);
      refreshAll();
      closeListForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mempublikasikan listing"),
  });

  // SOFT delete integration — cascades to its listings (backend handles cascade).
  const softDeleteInt = useMutation({
    mutationFn: async (i: IntegrationRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/marketplace/integrations/${i.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, i) => {
      toast.success(`"${i.storeName}" dipindah ke Sampah`);
      refreshAll();
      setDeleteInt(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus integrasi");
      setDeleteInt(null);
    },
  });

  const restoreIntM = useMutation({
    mutationFn: async (i: IntegrationRow) =>
      readJson<IntegrationRow>(
        await fetch(`/api/marketplace/integrations/${i.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, i) => {
      toast.success(`"${i.storeName}" dipulihkan`);
      refreshAll();
      setRestoreInt(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan integrasi");
      setRestoreInt(null);
    },
  });

  const purgeIntM = useMutation({
    mutationFn: async (i: IntegrationRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/marketplace/integrations/${i.id}/purge`, { method: "DELETE" }),
      ),
    onSuccess: (_res, i) => {
      toast.success(`"${i.storeName}" dihapus permanen`);
      refreshAll();
      setPurgeInt(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  const softDeleteListM = useMutation({
    mutationFn: async (l: ListingRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/marketplace/listings/${l.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, l) => {
      toast.success(`Listing "${l.title}" dipindah ke Sampah`);
      refreshAll();
      setDeleteList(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus listing");
      setDeleteList(null);
    },
  });

  const restoreListM = useMutation({
    mutationFn: async (l: ListingRow) =>
      readJson<ListingRow>(
        await fetch(`/api/marketplace/listings/${l.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, l) => {
      toast.success(`Listing "${l.title}" dipulihkan`);
      refreshAll();
      setRestoreList(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan listing");
      setRestoreList(null);
    },
  });

  const purgeListM = useMutation({
    mutationFn: async (l: ListingRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/marketplace/listings/${l.id}/purge`, { method: "DELETE" }),
      ),
    onSuccess: (_res, l) => {
      toast.success(`Listing "${l.title}" dihapus permanen`);
      refreshAll();
      setPurgeList(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── form submit ──────────────────────────────────────────────────────────────
  function submitIntForm() {
    if (!intForm.storeName.trim()) {
      toast.error("Nama toko wajib diisi");
      return;
    }
    if (intForm.mode === "create") connect.mutate(intForm);
    else manage.mutate(intForm);
  }
  function submitListForm() {
    if (!listForm.integrationId) {
      toast.error("Pilih integrasi (toko) dulu");
      return;
    }
    if (!listForm.title.trim()) {
      toast.error("Judul listing wajib diisi");
      return;
    }
    publish.mutate(listForm);
  }

  const intSubmitting = connect.isPending || manage.isPending;

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = integrationsQ.isError;
  const forbidden =
    integrationsQ.error instanceof Error && integrationsQ.error.message === "forbidden";

  const totalTrashed = trashedInt.length + trashedList.length;

  return (
    <div>
      <PageHeader
        title="Marketplace"
        description="Hubungkan toko marketplace (Tokopedia / Shopee / TikTok / Lazada) sebagai sumber lead, lalu kelola listing produk di tiap channel. Engagement listing jadi sinyal lead di funnel."
      >
        <Button variant="outline" size="sm" onClick={openPublish} disabled={integrations.length === 0}>
          <Tag className="h-4 w-4" /> Publikasikan listing
        </Button>
        <Button size="sm" onClick={openConnect}>
          <Plug className="h-4 w-4" /> Hubungkan toko
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Toko terhubung"
            value={integrationsQ.isLoading ? null : stats.connected}
            hint={`${stats.integrations} integrasi total`}
            icon={<Store className="h-[18px] w-[18px]" />}
            iconClass="bg-primary/10 text-primary"
          />
          <StatCard
            label="Listing aktif"
            value={listingsQ.isLoading ? null : stats.activeListings}
            hint={`${listings.length} listing total`}
            icon={<Boxes className="h-[18px] w-[18px]" />}
            iconClass="bg-tertiary/[0.12] text-tertiary"
          />
          <StatCard
            label="Total views"
            value={listingsQ.isLoading ? null : stats.views}
            hint="dilihat calon pembeli"
            icon={<Eye className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(199 89% 48% / .14)", color: "#0284c7" }}
          />
          <StatCard
            label="Lead dari marketplace"
            value={listingsQ.isLoading ? null : stats.leads}
            hint="diatribusikan ke listing"
            valueClass="text-primary"
            icon={<UserPlus className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "#25D36618", color: "#1faa52" }}
          />
        </section>

        {/* ============ MAIN TABS: Integrasi | Listing | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "integrasi"} onClick={() => setTab("integrasi")}>
            <Plug className="h-4 w-4" />
            Integrasi
            <CountPill>{integrations.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "listing"} onClick={() => setTab("listing")}>
            <Tag className="h-4 w-4" />
            Listing
            <CountPill>{listings.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <Trash2 className="h-4 w-4" />
            Sampah
            {totalTrashed > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {totalTrashed}
              </span>
            )}
          </TabButton>
        </div>

        {/* ============ INTEGRASI TAB ============ */}
        {tab === "integrasi" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* TOOLBAR */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {[{ value: "all", label: "Semua channel" }, ...CHANNELS].map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChanF(c.value)}
                    className={cn(
                      "h-7 rounded-md px-3 text-xs transition-colors",
                      chanF === c.value
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <span className="hidden h-5 w-px bg-border sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Status:</span>
                {[{ v: "all", label: "Semua" }, ...INTEGRATION_STATUSES.map((s) => ({ v: s, label: INT_STATUS_META[s].label }))].map(
                  (s) => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => setIntStatusF(s.v)}
                      className={cn(
                        "h-7 rounded-full px-3 text-xs transition-colors",
                        intStatusF === s.v
                          ? "bg-foreground font-semibold text-background"
                          : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                      )}
                    >
                      {s.label}
                    </button>
                  ),
                )}
              </div>

              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari toko / channel…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visibleIntegrations.length}</b> toko
              </span>
            </div>

            {/* TABLE */}
            {integrationsQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat integrasi"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar integrasi marketplace. Pastikan kamu login & database tersedia."
                }
                onRetry={() => integrationsQ.refetch()}
              />
            ) : integrations.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Store}
                title="Belum ada toko terhubung"
                description="Hubungkan toko Tokopedia / Shopee / TikTok Shop / Lazada untuk menjadikannya sumber lead. Setelah terhubung, kamu bisa kelola listing produk di tiap channel."
                action={
                  <Button size="sm" onClick={openConnect}>
                    <Plug className="h-4 w-4" /> Hubungkan toko
                  </Button>
                }
              />
            ) : visibleIntegrations.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada integrasi yang cocok"
                description="Coba ubah filter channel / status, atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Toko</th>
                      <th className="px-3 py-3 font-semibold">Channel</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Listing</th>
                      <th className="px-3 py-3 font-semibold">Sinkron terakhir</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleIntegrations.map((i) => (
                      <IntegrationTableRow
                        key={i.id}
                        integration={i}
                        onManage={() => openManage(i)}
                        onSync={() => sync.mutate(i)}
                        onDelete={() => setDeleteInt(i)}
                        syncing={sync.isPending && sync.variables?.id === i.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============ LISTING TAB ============ */}
        {tab === "listing" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* TOOLBAR */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              {/* integration select */}
              <div className="relative">
                <select
                  value={intF}
                  onChange={(e) => setIntF(e.target.value)}
                  className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="all">Toko: Semua</option>
                  {integrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.storeName}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Status:</span>
                {[{ v: "all", label: "Semua" }, ...LISTING_STATUSES.map((s) => ({ v: s, label: LISTING_STATUS_META[s].label }))].map(
                  (s) => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => setListStatusF(s.v)}
                      className={cn(
                        "h-7 rounded-full px-3 text-xs transition-colors",
                        listStatusF === s.v
                          ? "bg-foreground font-semibold text-background"
                          : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                      )}
                    >
                      {s.label}
                    </button>
                  ),
                )}
              </div>

              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari listing / toko…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visibleListings.length}</b> listing
              </span>
            </div>

            {/* TABLE */}
            {listingsQ.isLoading ? (
              <TableLoading />
            ) : listingsQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat listing"
                description="Tidak bisa mengambil daftar listing marketplace. Pastikan kamu login & database tersedia."
                onRetry={() => listingsQ.refetch()}
              />
            ) : listings.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Tag}
                title="Belum ada listing"
                description={
                  integrations.length === 0
                    ? "Hubungkan toko dulu di tab Integrasi, lalu publikasikan listing produk di channel-nya."
                    : "Publikasikan listing produk pada toko yang sudah terhubung — engagement-nya jadi sinyal lead."
                }
                action={
                  integrations.length === 0 ? (
                    <Button size="sm" onClick={openConnect}>
                      <Plug className="h-4 w-4" /> Hubungkan toko
                    </Button>
                  ) : (
                    <Button size="sm" onClick={openPublish}>
                      <Plus className="h-4 w-4" /> Publikasikan listing
                    </Button>
                  )
                }
              />
            ) : visibleListings.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada listing yang cocok"
                description="Coba ubah filter toko / status, atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Listing</th>
                      <th className="px-3 py-3 font-semibold">Toko · channel</th>
                      <th className="px-3 py-3 text-right font-semibold">Harga</th>
                      <th className="px-3 py-3 text-right font-semibold">Stok</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Views · Lead</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleListings.map((l) => (
                      <ListingTableRow
                        key={l.id}
                        listing={l}
                        integration={integrationById[l.integrationId] ?? null}
                        product={l.productId ? productById[l.productId] ?? null : null}
                        onDelete={() => setDeleteList(l)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============ SAMPAH TAB ============ */}
        {tab === "sampah" && (
          <div className="space-y-5">
            {/* trashed integrations */}
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
                <span className="font-semibold text-foreground">Integrasi dihapus</span>
                <span className="text-muted-foreground">
                  <b>Pulihkan</b> mengembalikan toko (& listing-nya) ke tab Integrasi · <b>Hapus permanen</b>{" "}
                  menghapus selamanya (cascade ke listing).
                </span>
                <span className="ml-auto text-muted-foreground">{trashedInt.length} integrasi</span>
              </div>
              {trashedIntQ.isLoading ? (
                <TableLoading rows={3} />
              ) : trashedIntQ.isError ? (
                <ErrorState
                  className="border-0"
                  title="Gagal memuat sampah integrasi"
                  description="Tidak bisa mengambil integrasi yang dihapus."
                  onRetry={() => trashedIntQ.refetch()}
                />
              ) : trashedInt.length === 0 ? (
                <EmptyState
                  className="border-0"
                  icon={Trash2}
                  title="Tidak ada integrasi di sampah"
                  description="Toko yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Toko</th>
                        <th className="px-3 py-3 font-semibold">Channel</th>
                        <th className="px-3 py-3 font-semibold">Dihapus</th>
                        <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {trashedInt.map((i) => (
                        <tr key={i.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold text-muted-foreground">
                                {initialsOf(i.storeName)}
                              </span>
                              <span className="font-medium text-foreground/80">{i.storeName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <ChannelBadge channel={i.channel} />
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {fmtRelID(i.deletedAt)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <TrashedActions
                              onRestore={() => setRestoreInt(i)}
                              onPurge={() => {
                                setPurgeInt(i);
                                setPurgeConfirm("");
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* trashed listings */}
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
                <span className="font-semibold text-foreground">Listing dihapus</span>
                <span className="ml-auto text-muted-foreground">{trashedList.length} listing</span>
              </div>
              {trashedListQ.isLoading ? (
                <TableLoading rows={3} />
              ) : trashedListQ.isError ? (
                <ErrorState
                  className="border-0"
                  title="Gagal memuat sampah listing"
                  description="Tidak bisa mengambil listing yang dihapus."
                  onRetry={() => trashedListQ.refetch()}
                />
              ) : trashedList.length === 0 ? (
                <EmptyState
                  className="border-0"
                  icon={Trash2}
                  title="Tidak ada listing di sampah"
                  description="Listing yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Listing</th>
                        <th className="px-3 py-3 font-semibold">Channel</th>
                        <th className="px-3 py-3 text-right font-semibold">Harga</th>
                        <th className="px-3 py-3 font-semibold">Dihapus</th>
                        <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {trashedList.map((l) => (
                        <tr key={l.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium text-foreground/80">{l.title}</td>
                          <td className="px-3 py-3">
                            <ChannelBadge channel={l.channel} />
                          </td>
                          <td className="px-3 py-3 text-right text-sm text-foreground/80">
                            {fmtIDR(l.price, l.currency)}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {fmtRelID(l.deletedAt)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <TrashedActions
                              onRestore={() => setRestoreList(l)}
                              onPurge={() => {
                                setPurgeList(l);
                                setPurgeConfirm("");
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Legend */}
        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Marketplace = <b>sumber lead</b>: tiap toko terhubung jadi channel, tiap listing yang dilihat /
          ditanya pembeli ditandai sebagai sinyal lead (kolom <b>Views · Lead</b>). <b>Sinkron</b> menarik
          status terbaru dari channel · <b>Hapus</b> memindah ke Sampah (bisa dipulihkan).
        </p>
      </div>

      {/* ===================== CONNECT / MANAGE INTEGRATION DRAWER ===================== */}
      <DrawerBackdrop open={intForm.open} onClose={closeIntForm} />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l border-border bg-card shadow-soft transition-transform duration-300",
          intForm.open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plug className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">
                {intForm.mode === "create" ? "Hubungkan toko" : "Kelola integrasi"}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {intForm.mode === "create"
                  ? "Sambungkan toko marketplace sebagai sumber lead"
                  : intForm.storeName}
              </p>
            </div>
          </div>
          <button
            onClick={closeIntForm}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Channel */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Channel</label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map((c) => {
                const on = intForm.channel === c.value;
                const meta = channelMeta(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setIntForm((d) => ({ ...d, channel: c.value }))}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Store name */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Nama toko
            </label>
            <input
              type="text"
              value={intForm.storeName}
              onChange={(e) => setIntForm((d) => ({ ...d, storeName: e.target.value }))}
              placeholder="mis. Sinar Abadi Official Store"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Store id */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              ID toko di channel <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <input
              type="text"
              value={intForm.storeId}
              onChange={(e) => setIntForm((d) => ({ ...d, storeId: e.target.value }))}
              placeholder="mis. shop_1029384"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              ID/slug toko pada channel. Kredensial sebenarnya disimpan terenkripsi — tidak diisi di sini.
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Status</label>
            <div className="flex flex-wrap gap-2">
              {INTEGRATION_STATUSES.map((s) => {
                const on = intForm.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setIntForm((d) => ({ ...d, status: s }))}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-medium transition-colors",
                      on
                        ? "border-2 border-primary bg-primary/10 text-primary"
                        : "border border-border hover:border-primary/40",
                    )}
                  >
                    {INT_STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={closeIntForm}>
            Batal
          </Button>
          <Button size="sm" disabled={intSubmitting} onClick={submitIntForm}>
            {intSubmitting
              ? "Memproses…"
              : intForm.mode === "create"
                ? "Hubungkan"
                : "Simpan perubahan"}
          </Button>
        </div>
      </aside>

      {/* ===================== PUBLISH LISTING DRAWER ===================== */}
      <DrawerBackdrop open={listForm.open} onClose={closeListForm} />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l border-border bg-card shadow-soft transition-transform duration-300",
          listForm.open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tertiary/[0.12] text-tertiary">
              <Tag className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">Publikasikan listing</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Tampilkan produk di channel marketplace
              </p>
            </div>
          </div>
          <button
            onClick={closeListForm}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Integration */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Toko (integrasi)
            </label>
            <div className="relative">
              <select
                value={listForm.integrationId}
                onChange={(e) => setListForm((d) => ({ ...d, integrationId: e.target.value }))}
                className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                {integrations.length === 0 && <option value="">Belum ada toko terhubung</option>}
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.storeName} · {channelMeta(i.channel).label}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
          </div>

          {/* Product (optional) */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Produk <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <div className="relative">
              <select
                value={listForm.productId}
                onChange={(e) => setListForm((d) => ({ ...d, productId: e.target.value }))}
                className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">— tanpa produk —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Package className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Judul listing
            </label>
            <input
              type="text"
              value={listForm.title}
              onChange={(e) => setListForm((d) => ({ ...d, title: e.target.value }))}
              placeholder="mis. Paket Hemat Kopi Arabika 1kg"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Price + stock */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
                Harga (Rp)
              </label>
              <input
                type="number"
                min={0}
                value={listForm.price}
                onChange={(e) => setListForm((d) => ({ ...d, price: e.target.value }))}
                placeholder="0"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Stok</label>
              <input
                type="number"
                min={0}
                value={listForm.stock}
                onChange={(e) => setListForm((d) => ({ ...d, stock: e.target.value }))}
                placeholder="0"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              URL listing <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <input
              type="url"
              value={listForm.url}
              onChange={(e) => setListForm((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://tokopedia.com/…"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Status</label>
            <div className="flex flex-wrap gap-2">
              {LISTING_STATUSES.map((s) => {
                const on = listForm.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setListForm((d) => ({ ...d, status: s }))}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-medium transition-colors",
                      on
                        ? "border-2 border-primary bg-primary/10 text-primary"
                        : "border border-border hover:border-primary/40",
                    )}
                  >
                    {LISTING_STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={closeListForm}>
            Batal
          </Button>
          <Button size="sm" disabled={publish.isPending} onClick={submitListForm}>
            {publish.isPending ? "Memproses…" : "Publikasikan"}
          </Button>
        </div>
      </aside>

      {/* ===================== SOFT-DELETE CONFIRMS ===================== */}
      <ConfirmModal
        open={!!deleteInt}
        onClose={() => setDeleteInt(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteInt?.storeName}</span> akan dihapus dan
            dipindah ke tab <b>Sampah</b> (cascade ke {deleteInt?.listingCount ?? 0} listing-nya). Kamu masih
            bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDeleteInt.isPending}
        onConfirm={() => deleteInt && softDeleteInt.mutate(deleteInt)}
      />
      <ConfirmModal
        open={!!deleteList}
        onClose={() => setDeleteList(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            Listing <span className="font-medium text-foreground">{deleteList?.title}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b>. Kamu masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDeleteListM.isPending}
        onConfirm={() => deleteList && softDeleteListM.mutate(deleteList)}
      />

      {/* ===================== RESTORE CONFIRMS ===================== */}
      <ConfirmModal
        open={!!restoreInt}
        onClose={() => setRestoreInt(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan integrasi?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreInt?.storeName}</span> akan dikembalikan ke
            tab <b>Integrasi</b> beserta listing-nya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restoreIntM.isPending}
        onConfirm={() => restoreInt && restoreIntM.mutate(restoreInt)}
      />
      <ConfirmModal
        open={!!restoreList}
        onClose={() => setRestoreList(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan listing?"
        body={
          <>
            Listing <span className="font-medium text-foreground">{restoreList?.title}</span> akan
            dikembalikan ke tab <b>Listing</b>.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restoreListM.isPending}
        onConfirm={() => restoreList && restoreListM.mutate(restoreList)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
      <PurgeModal
        open={!!purgeInt || !!purgeList}
        targetLabel={purgeInt?.storeName ?? purgeList?.title ?? ""}
        isIntegration={!!purgeInt}
        value={purgeConfirm}
        onChange={setPurgeConfirm}
        pending={purgeIntM.isPending || purgeListM.isPending}
        onClose={() => {
          setPurgeInt(null);
          setPurgeList(null);
          setPurgeConfirm("");
        }}
        onConfirm={() => {
          if (purgeInt) purgeIntM.mutate(purgeInt);
          else if (purgeList) purgeListM.mutate(purgeList);
        }}
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  valueClass,
  icon,
  iconClass,
  iconStyle,
}: {
  label: string;
  value: number | null;
  hint: string;
  valueClass?: string;
  icon: React.ReactNode;
  iconClass?: string;
  iconStyle?: React.CSSProperties;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {value == null ? (
            <Skeleton className="mt-1.5 h-7 w-14" />
          ) : (
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueClass)}>
              {value.toLocaleString("id-ID")}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClass)}
          style={iconStyle}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const meta = channelMeta(channel);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
      <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

function IntStatusBadge({ status }: { status: string }) {
  const meta = INT_STATUS_META[status] ?? INT_STATUS_META.disconnected;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.cls,
      )}
    >
      {status === "connected" && <Check className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

function ListingStatusBadge({ status }: { status: string }) {
  const meta = LISTING_STATUS_META[status] ?? LISTING_STATUS_META.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function IntegrationTableRow({
  integration,
  onManage,
  onSync,
  onDelete,
  syncing,
}: {
  integration: IntegrationRow;
  onManage: () => void;
  onSync: () => void;
  onDelete: () => void;
  syncing: boolean;
}) {
  const i = integration;
  return (
    <tr className="cursor-pointer transition-colors hover:bg-muted/40" onClick={onManage}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-semibold text-secondary-foreground">
            {initialsOf(i.storeName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{i.storeName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {i.storeId ? `ID: ${i.storeId}` : "Tanpa ID toko"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <ChannelBadge channel={i.channel} />
      </td>
      <td className="px-3 py-3">
        <IntStatusBadge status={i.status} />
      </td>
      <td className="px-3 py-3 text-sm tabular-nums text-foreground/80">{i.listingCount}</td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(i.lastSyncAt)}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            title="Sinkronkan channel"
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            {syncing ? "…" : "Sinkron"}
          </button>
          <button
            type="button"
            onClick={onManage}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
          >
            Kelola
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Hapus (ke Sampah)"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ListingTableRow({
  listing,
  integration,
  product,
  onDelete,
}: {
  listing: ListingRow;
  integration: IntegrationRow | null;
  product: ProductRow | null;
  onDelete: () => void;
}) {
  const l = listing;
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{l.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {product ? product.name : l.externalId ? `ext: ${l.externalId}` : "tanpa produk"}
          </p>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground/80">{integration?.storeName ?? "—"}</p>
          <ChannelBadge channel={l.channel} />
        </div>
      </td>
      <td className="px-3 py-3 text-right text-sm font-medium tabular-nums text-foreground">
        {fmtIDR(l.price, l.currency)}
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground/80">
        {l.stock.toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-3">
        <ListingStatusBadge status={l.status} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> {l.views.toLocaleString("id-ID")}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            <UserPlus className="h-3.5 w-3.5" /> {l.leads.toLocaleString("id-ID")}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          onClick={onDelete}
          title="Hapus (ke Sampah)"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function TrashedActions({
  onRestore,
  onPurge,
}: {
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onRestore}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
      >
        <RotateCcw className="h-3 w-3" /> Pulihkan
      </button>
      <button
        type="button"
        onClick={onPurge}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-3 w-3" /> Hapus permanen
      </button>
    </div>
  );
}

function DrawerBackdrop({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    />
  );
}

function ConfirmModal({
  open,
  onClose,
  icon,
  tone,
  title,
  body,
  confirmLabel,
  confirmPending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  tone: "destructive" | "tertiary";
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              tone === "destructive"
                ? "bg-destructive/[0.12] text-destructive"
                : "bg-tertiary/[0.12] text-tertiary",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmPending}
            className={cn(
              "h-9 rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60",
              tone === "destructive"
                ? "bg-destructive text-white"
                : "bg-tertiary text-tertiary-foreground",
            )}
          >
            {confirmPending ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurgeModal({
  open,
  targetLabel,
  isIntegration,
  value,
  onChange,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  targetLabel: string;
  isIntegration: boolean;
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-lg border border-destructive/30 bg-card p-5 shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-destructive">Hapus permanen?</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
              <span className="font-medium text-foreground">{targetLabel}</span> akan dihapus selamanya
              {isIntegration ? " beserta seluruh listing-nya" : ""}.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] text-muted-foreground">
            Ketik{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-semibold text-foreground">
              HAPUS
            </code>{" "}
            untuk konfirmasi.
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="HAPUS"
            className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={pending || value.trim().toUpperCase() !== "HAPUS"}
            className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Menghapus…" : "Hapus permanen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TableLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

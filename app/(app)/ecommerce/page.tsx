"use client";

// E-Commerce — Module 9 (secondary) FRONTEND (Sainskerta Loop Phase 04, FINAL
// frontend tick). Wired to the NEW M9 ecommerce backend (no mock data):
//   - GET   /api/ecommerce/orders                  → marketplace orders (OrderRow[])
//   - GET   /api/ecommerce/orders/trashed          → soft-deleted orders (Sampah)
//   - DELETE/PATCH /api/ecommerce/orders/[id]…     → soft-delete / restore / purge
//   - GET   /api/ecommerce/carts                   → cart-recovery items (CartRow[])
//   - GET   /api/ecommerce/carts/trashed           → soft-deleted carts (Sampah)
//   - POST  /api/ecommerce/carts/[id]/nudge        → record a recovery nudge (+attempt)
//   - POST  /api/ecommerce/carts/[id]/recover      → mark cart recovered
//   - DELETE/PATCH /api/ecommerce/carts/[id]…      → soft-delete / restore / purge
//
// Channel = tokopedia | shopee | tiktok | other (per the backend enum), each with
// its brand badge + dot. Orders carry a status pill; cart-recovery items show the
// value + abandoned age + a ONE-CLICK WA recovery action (records a nudge on the
// backend + opens a pre-filled wa.me draft to the buyer). Soft-delete/restore/
// purge (Sampah) on BOTH orders and carts. Coral Sunset, in the (app) shell. Every
// band has loading + empty + error states.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  MessageCircle,
  Music2,
  Package,
  RotateCcw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M9 ecommerce backend — { ok, data }) ───────

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

interface OrderItem {
  name: string;
  sku?: string;
  qty: number;
  price: number;
}

/** Row from GET /api/ecommerce/orders (modules/ecommerce · marketplace_order). */
interface OrderRow {
  id: string;
  workspaceId: string | null;
  channel: string; // tokopedia | shopee | tiktok | other
  externalId: string;
  contactId: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  status: string; // pending|paid|shipped|delivered|completed|cancelled|refunded
  total: number;
  currency: string;
  items: OrderItem[];
  note: string | null;
  orderedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Row from GET /api/ecommerce/carts (modules/ecommerce · cart_recovery). */
interface CartRow {
  id: string;
  workspaceId: string | null;
  channel: string;
  externalId: string;
  contactId: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  value: number;
  currency: string;
  items: OrderItem[];
  status: string; // open | recovered | expired | lost
  attempts: number;
  lastAttemptAt: string | null;
  orderId: string | null;
  abandonedAt: string | null;
  recoveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainTab = "orders" | "carts" | "sampah";
type ChannelFilter = "all" | "tokopedia" | "shopee" | "tiktok" | "other";
type OrderStatusFilter = "all" | "pending" | "paid" | "shipped" | "delivered" | "completed" | "cancelled" | "refunded";

/** Channel brand metadata — covers the backend enum (incl. `other`). */
const CHANNEL_META: Record<string, { label: string; color: string; icon: typeof ShoppingBag }> = {
  tokopedia: { label: "Tokopedia", color: "#03AC0E", icon: ShoppingBag },
  shopee: { label: "Shopee", color: "#EE4D2D", icon: Store },
  tiktok: { label: "TikTok Shop", color: "#000000", icon: Music2 },
  other: { label: "Lainnya", color: "#6B7280", icon: Package },
};
function channelMeta(channel: string) {
  return CHANNEL_META[channel] ?? CHANNEL_META.other;
}

const WA = "#25D366";

/** Order-status pill metadata (Coral Sunset semantic tokens). */
const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Menunggu bayar", cls: "border border-dashed border-warning/50 text-warning" },
  paid: { label: "Dibayar", cls: "bg-info/12 text-info" },
  shipped: { label: "Dikirim", cls: "bg-tertiary/15 text-tertiary" },
  delivered: { label: "Sampai", cls: "bg-tertiary/15 text-tertiary" },
  completed: { label: "Selesai", cls: "bg-success/15 text-success" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground" },
  refunded: { label: "Refund", cls: "bg-destructive/10 text-destructive" },
};

/** Cart-recovery status pill metadata. */
const CART_STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Ditinggalkan", cls: "border border-dashed border-warning/50 text-warning" },
  recovered: { label: "Dipulihkan", cls: "bg-success/15 text-success" },
  expired: { label: "Kedaluwarsa", cls: "bg-muted text-muted-foreground" },
  lost: { label: "Hilang", cls: "bg-destructive/10 text-destructive" },
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

function fmtMoney(value: number, currency: string): string {
  if (currency === "IDR") {
    if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  return `${currency} ${value.toLocaleString("id-ID")}`;
}

function fmtRelID(iso: string | null | undefined): string {
  if (!iso) return "—";
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

function itemsSummary(items: OrderItem[]): string {
  if (!items || items.length === 0) return "—";
  const first = items[0]?.name ?? "Item";
  const more = items.length - 1;
  return more > 0 ? `${first} +${more} lainnya` : first;
}

/** Normalise an Indonesian phone to wa.me's bare-international form (62…). */
function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^\d]/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (p.startsWith("8")) p = "62" + p;
  return p;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function EcommercePage() {
  const qc = useQueryClient();

  // ── primary tabs ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("orders");

  // live orders + carts (carts power the "open" recovery badge on the tab too)
  const ordersQ = useQuery({
    queryKey: ["ecom", "orders", "list"],
    queryFn: async () => readJson<OrderRow[]>(await fetch("/api/ecommerce/orders")),
    retry: false,
  });
  const cartsQ = useQuery({
    queryKey: ["ecom", "carts", "list"],
    queryFn: async () => readJson<CartRow[]>(await fetch("/api/ecommerce/carts")),
    retry: false,
  });

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const carts = useMemo(() => cartsQ.data ?? [], [cartsQ.data]);

  // Trashed (orders + carts) — lazy, only fetched once the Sampah tab opens.
  const trashedOrdersQ = useQuery({
    queryKey: ["ecom", "orders", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<OrderRow[]>(await fetch("/api/ecommerce/orders/trashed")),
    retry: false,
  });
  const trashedCartsQ = useQuery({
    queryKey: ["ecom", "carts", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<CartRow[]>(await fetch("/api/ecommerce/carts/trashed")),
    retry: false,
  });
  const trashedOrders = useMemo(() => trashedOrdersQ.data ?? [], [trashedOrdersQ.data]);
  const trashedCarts = useMemo(() => trashedCartsQ.data ?? [], [trashedCartsQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────
  const [chF, setChF] = useState<ChannelFilter>("all");
  const [stF, setStF] = useState<OrderStatusFilter>("all");
  const [search, setSearch] = useState("");

  // ── stats (channel breakdown over live orders) ─────────────────────────────
  const stats = useMemo(() => {
    let revenue = 0;
    const byChannel: Record<string, number> = { tokopedia: 0, shopee: 0, tiktok: 0, other: 0 };
    for (const o of orders) {
      byChannel[o.channel] = (byChannel[o.channel] ?? 0) + 1;
      if (o.status !== "cancelled" && o.status !== "refunded") revenue += o.total;
    }
    const openCarts = carts.filter((c) => c.status === "open");
    const cartValue = openCarts.reduce((s, c) => s + c.value, 0);
    return {
      orders: orders.length,
      revenue,
      byChannel,
      openCarts: openCarts.length,
      cartValue,
    };
  }, [orders, carts]);

  const openCartCount = stats.openCarts;

  // ── filtered views ─────────────────────────────────────────────────────────
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const okCh = chF === "all" || o.channel === chF;
      const okSt = stF === "all" || o.status === stF;
      const hay = `${o.externalId} ${o.buyerName ?? ""} ${itemsSummary(o.items)}`.toLowerCase();
      const okSearch = !q || hay.includes(q);
      return okCh && okSt && okSearch;
    });
  }, [orders, chF, stF, search]);

  const visibleCarts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return carts.filter((c) => {
      const okCh = chF === "all" || c.channel === chF;
      const hay = `${c.externalId} ${c.buyerName ?? ""} ${itemsSummary(c.items)}`.toLowerCase();
      const okSearch = !q || hay.includes(q);
      return okCh && okSearch;
    });
  }, [carts, chF, search]);

  // ── confirm targets ──────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "order" | "cart"; id: string; label: string } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ kind: "order" | "cart"; id: string; label: string } | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<{ kind: "order" | "cart"; id: string; label: string } | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["ecom"] });
  }

  const base = (kind: "order" | "cart") => `/api/ecommerce/${kind === "order" ? "orders" : "carts"}`;

  // ONE-CLICK WA RECOVERY — records a nudge on the backend (+attempt, stamps
  // last_attempt_at) then opens a pre-filled wa.me draft to the buyer. The actual
  // "mark recovered" is a separate, manual confirmation once the buyer pays.
  const nudge = useMutation({
    mutationFn: async (c: CartRow) =>
      readJson<CartRow>(await fetch(`/api/ecommerce/carts/${c.id}/nudge`, { method: "POST" })),
    onSuccess: (_res, c) => {
      const wa = waNumber(c.buyerPhone);
      const meta = channelMeta(c.channel);
      const text = encodeURIComponent(
        `Halo ${c.buyerName ?? "kak"} 👋 keranjang ${itemsSummary(c.items)} di ${meta.label} masih kami simpan. ` +
          `Selesaikan pesanannya sekarang ya — total ${fmtMoney(c.value, c.currency)}. Kami bantu prosesnya. 🙏`,
      );
      if (wa) {
        window.open(`https://wa.me/${wa}?text=${text}`, "_blank", "noopener,noreferrer");
        toast.success(`Draf WA disiapkan untuk ${c.buyerName ?? "pembeli"} — nudge dicatat`);
      } else {
        toast.success("Nudge dicatat — nomor WA pembeli belum ada, isi dulu di CRM");
      }
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengirim recovery"),
  });

  // Mark a cart recovered (buyer checked out) — flips status → recovered.
  const recover = useMutation({
    mutationFn: async (c: CartRow) =>
      readJson<CartRow>(
        await fetch(`/api/ecommerce/carts/${c.id}/recover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`Keranjang ${c.buyerName ?? c.externalId} ditandai pulih`);
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menandai pulih"),
  });

  const softDelete = useMutation({
    mutationFn: async (t: { kind: "order" | "cart"; id: string }) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`${base(t.kind)}/${t.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`${t.kind === "order" ? "Pesanan" : "Keranjang"} dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (t: { kind: "order" | "cart"; id: string }) =>
      readJson<unknown>(await fetch(`${base(t.kind)}/${t.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, t) => {
      toast.success(`${t.kind === "order" ? "Pesanan" : "Keranjang"} dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (t: { kind: "order" | "cart"; id: string }) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`${base(t.kind)}/${t.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`${t.kind === "order" ? "Pesanan" : "Keranjang"} dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const forbidden =
    (ordersQ.error instanceof Error && ordersQ.error.message === "forbidden") ||
    (cartsQ.error instanceof Error && cartsQ.error.message === "forbidden");

  return (
    <div>
      <PageHeader
        title="E-Commerce"
        description="Pesanan marketplace (Tokopedia / Shopee / TikTok Shop) + pemulihan keranjang yang ditinggalkan — recovery satu klik lewat WhatsApp."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/inbox?channel=whatsapp">
            <MessageCircle className="h-4 w-4" style={{ color: WA }} /> Buka Inbox
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total pesanan"
            value={ordersQ.isLoading ? null : stats.orders}
            hint="lintas channel marketplace"
          />
          <StatCard
            label="Pendapatan"
            value={ordersQ.isLoading ? null : stats.revenue}
            money
            hint="di luar batal & refund"
            valueClass="text-primary"
          />
          <StatCard
            label="Keranjang terbuka"
            value={cartsQ.isLoading ? null : stats.openCarts}
            hint="bisa dipulihkan"
            valueClass="text-warning"
          />
          <StatCard
            label="Nilai keranjang"
            value={cartsQ.isLoading ? null : stats.cartValue}
            money
            hint="potensi recovery"
          />
        </section>

        {/* ============ CHANNEL BREAKDOWN ============ */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["tokopedia", "shopee", "tiktok", "other"] as const).map((ch) => {
            const meta = channelMeta(ch);
            const Icon = meta.icon;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => {
                  setChF((cur) => (cur === ch ? "all" : ch));
                  setTab((cur) => (cur === "sampah" ? "orders" : cur));
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left shadow-soft transition-colors",
                  chF === ch ? "border-primary/50 ring-1 ring-primary/20" : "border-border hover:border-primary/30",
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: meta.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-muted-foreground">{meta.label}</p>
                  <p className="text-base font-bold tabular-nums">
                    {ordersQ.isLoading ? "—" : stats.byChannel[ch] ?? 0}
                  </p>
                </div>
              </button>
            );
          })}
        </section>

        {/* ============ MAIN TABS: Pesanan | Keranjang | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
            <ShoppingBag className="h-4 w-4" />
            Pesanan
            <CountPill>{orders.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "carts"} onClick={() => setTab("carts")}>
            <ShoppingCart className="h-4 w-4" />
            Recovery keranjang
            {openCartCount > 0 && (
              <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warning">
                {openCartCount}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <Trash2 className="h-4 w-4" />
            Sampah
            {trashedOrders.length + trashedCarts.length > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashedOrders.length + trashedCarts.length}
              </span>
            )}
          </TabButton>
        </div>

        {/* ============ TOOLBAR (shared by orders + carts) ============ */}
        {tab !== "sampah" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* channel segmented control */}
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {(
                [
                  { v: "all", label: "Semua" },
                  { v: "tokopedia", label: "Tokopedia" },
                  { v: "shopee", label: "Shopee" },
                  { v: "tiktok", label: "TikTok" },
                  { v: "other", label: "Lainnya" },
                ] as const
              ).map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setChF(s.v)}
                  className={cn(
                    "h-7 rounded-md px-3 text-xs transition-colors",
                    chF === s.v
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* status select — orders only */}
            {tab === "orders" && (
              <div className="relative">
                <select
                  value={stF}
                  onChange={(e) => setStF(e.target.value as OrderStatusFilter)}
                  className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="all">Status: Semua</option>
                  <option value="pending">Menunggu bayar</option>
                  <option value="paid">Dibayar</option>
                  <option value="shipped">Dikirim</option>
                  <option value="delivered">Sampai</option>
                  <option value="completed">Selesai</option>
                  <option value="cancelled">Dibatalkan</option>
                  <option value="refunded">Refund</option>
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>
            )}

            {/* inline search */}
            <div className="relative ml-auto w-52">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter no. order / pembeli / produk…"
                className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <span className="text-[11px] text-muted-foreground">
              <b className="text-foreground">{tab === "orders" ? visibleOrders.length : visibleCarts.length}</b> hasil
            </span>
          </div>
        )}

        {/* ============ ORDERS ============ */}
        {tab === "orders" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {ordersQ.isLoading ? (
              <TableLoading />
            ) : ordersQ.isError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat pesanan"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil pesanan marketplace. Pastikan kamu login & database tersedia."
                }
                onRetry={() => ordersQ.refetch()}
              />
            ) : orders.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={ShoppingBag}
                title="Belum ada pesanan"
                description="Pesanan dari Tokopedia / Shopee / TikTok Shop muncul di sini setelah channel marketplace terhubung & menarik order."
              />
            ) : visibleOrders.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada pesanan yang cocok"
                description="Coba ubah filter channel / status atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">No. Order</th>
                      <th className="px-3 py-3 font-semibold">Channel</th>
                      <th className="px-3 py-3 font-semibold">Pembeli</th>
                      <th className="px-3 py-3 font-semibold">Produk</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Waktu</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleOrders.map((o) => (
                      <OrderTableRow
                        key={o.id}
                        order={o}
                        onDelete={() =>
                          setDeleteTarget({ kind: "order", id: o.id, label: `Pesanan ${o.externalId}` })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============ CART RECOVERY ============ */}
        {tab === "carts" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {cartsQ.isLoading ? (
              <TableLoading />
            ) : cartsQ.isError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat keranjang"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil data pemulihan keranjang. Pastikan kamu login & database tersedia."
                }
                onRetry={() => cartsQ.refetch()}
              />
            ) : carts.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={ShoppingCart}
                title="Belum ada keranjang ditinggalkan"
                description="Keranjang yang ditinggalkan pembeli di marketplace muncul di sini — siap dipulihkan satu klik lewat WhatsApp."
              />
            ) : visibleCarts.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada keranjang yang cocok"
                description="Coba ubah filter channel atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Pembeli</th>
                      <th className="px-3 py-3 font-semibold">Channel</th>
                      <th className="px-3 py-3 font-semibold">Isi keranjang</th>
                      <th className="px-3 py-3 text-right font-semibold">Nilai</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Ditinggalkan</th>
                      <th className="px-3 py-3 text-right font-semibold">Recovery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleCarts.map((c) => (
                      <CartTableRow
                        key={c.id}
                        cart={c}
                        onNudge={() => nudge.mutate(c)}
                        onRecover={() => recover.mutate(c)}
                        onDelete={() =>
                          setDeleteTarget({
                            kind: "cart",
                            id: c.id,
                            label: `Keranjang ${c.buyerName ?? c.externalId}`,
                          })
                        }
                        nudging={nudge.isPending && nudge.variables?.id === c.id}
                        recovering={recover.isPending && recover.variables?.id === c.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============ SAMPAH (trash — orders + carts) ============ */}
        {tab === "sampah" && (
          <section className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Pesanan &amp; keranjang yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke
              tab aslinya, <b>Hapus permanen</b> menghapus selamanya.
            </p>

            <TrashBlock
              title="Pesanan terhapus"
              icon={ShoppingBag}
              loading={trashedOrdersQ.isLoading}
              error={trashedOrdersQ.isError}
              onRetry={() => trashedOrdersQ.refetch()}
              empty={trashedOrders.length === 0}
            >
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-semibold">No. Order</th>
                    <th className="px-3 py-3 font-semibold">Channel</th>
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                    <th className="px-3 py-3 font-semibold">Dihapus</th>
                    <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trashedOrders.map((o) => {
                    const meta = channelMeta(o.channel);
                    return (
                      <tr key={o.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-3 py-3 font-mono text-xs text-foreground/80">{o.externalId}</td>
                        <td className="px-3 py-3">
                          <ChannelBadge channel={o.channel} label={meta.label} />
                        </td>
                        <td className="px-3 py-3 text-right font-medium">{fmtMoney(o.total, o.currency)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(o.deletedAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <TrashActions
                            onRestore={() =>
                              setRestoreTarget({ kind: "order", id: o.id, label: `Pesanan ${o.externalId}` })
                            }
                            onPurge={() =>
                              setPurgeTarget({ kind: "order", id: o.id, label: `Pesanan ${o.externalId}` })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TrashBlock>

            <TrashBlock
              title="Keranjang terhapus"
              icon={ShoppingCart}
              loading={trashedCartsQ.isLoading}
              error={trashedCartsQ.isError}
              onRetry={() => trashedCartsQ.refetch()}
              empty={trashedCarts.length === 0}
            >
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Pembeli</th>
                    <th className="px-3 py-3 font-semibold">Channel</th>
                    <th className="px-3 py-3 text-right font-semibold">Nilai</th>
                    <th className="px-3 py-3 font-semibold">Dihapus</th>
                    <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trashedCarts.map((c) => {
                    const meta = channelMeta(c.channel);
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-3 py-3 font-medium text-foreground/80">{c.buyerName ?? c.externalId}</td>
                        <td className="px-3 py-3">
                          <ChannelBadge channel={c.channel} label={meta.label} />
                        </td>
                        <td className="px-3 py-3 text-right font-medium">{fmtMoney(c.value, c.currency)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(c.deletedAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <TrashActions
                            onRestore={() =>
                              setRestoreTarget({
                                kind: "cart",
                                id: c.id,
                                label: `Keranjang ${c.buyerName ?? c.externalId}`,
                              })
                            }
                            onPurge={() =>
                              setPurgeTarget({
                                kind: "cart",
                                id: c.id,
                                label: `Keranjang ${c.buyerName ?? c.externalId}`,
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TrashBlock>
          </section>
        )}

        {/* Legend */}
        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Recovery satu klik{" "}
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-white" style={{ background: WA }}>
            <MessageCircle className="h-3 w-3" /> WA
          </span>{" "}
          mencatat <i>nudge</i> di backend (menambah percobaan + cap waktu) lalu membuka draf WhatsApp ke
          pembeli. Tandai <b>Pulih</b> setelah pembeli checkout. Channel: Tokopedia · Shopee · TikTok Shop ·
          Lainnya.
        </p>
      </div>

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.label}</span> akan dihapus dan
            dipindah ke tab <b>Sampah</b>. Kamu masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan dari Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.label}</span> akan dikembalikan
            ke tab aslinya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.label ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  money,
  valueClass,
}: {
  label: string;
  value: number | null;
  hint: string;
  money?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {value == null ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <span className={cn("text-2xl font-bold tabular-nums", valueClass)}>
            {money ? fmtMoney(value, "IDR") : value.toLocaleString("id-ID")}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
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

function ChannelBadge({ channel, label }: { channel: string; label: string }) {
  const meta = channelMeta(channel);
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
      <span
        className="flex h-5 w-5 items-center justify-center rounded text-white"
        style={{ background: meta.color }}
      >
        <Icon className="h-3 w-3" />
      </span>
      {label}
    </span>
  );
}

function OrderStatusPill({ status }: { status: string }) {
  const meta = ORDER_STATUS_META[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
      {status === "completed" && <Check className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

function CartStatusPill({ status }: { status: string }) {
  const meta = CART_STATUS_META[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
      {status === "recovered" && <Check className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

function OrderTableRow({ order, onDelete }: { order: OrderRow; onDelete: () => void }) {
  const meta = channelMeta(order.channel);
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-3 py-3 font-mono text-xs text-foreground/80">{order.externalId}</td>
      <td className="px-3 py-3">
        <ChannelBadge channel={order.channel} label={meta.label} />
      </td>
      <td className="px-3 py-3">
        <p className="truncate font-medium text-foreground">{order.buyerName || "—"}</p>
        {order.buyerPhone && (
          <p className="truncate text-[11px] text-muted-foreground">{order.buyerPhone}</p>
        )}
      </td>
      <td className="px-3 py-3 text-foreground/80">
        <span className="inline-flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {itemsSummary(order.items)}
        </span>
      </td>
      <td className="px-3 py-3 text-right font-semibold">{fmtMoney(order.total, order.currency)}</td>
      <td className="px-3 py-3">
        <OrderStatusPill status={order.status} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {fmtRelID(order.orderedAt ?? order.createdAt)}
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

function CartTableRow({
  cart,
  onNudge,
  onRecover,
  onDelete,
  nudging,
  recovering,
}: {
  cart: CartRow;
  onNudge: () => void;
  onRecover: () => void;
  onDelete: () => void;
  nudging: boolean;
  recovering: boolean;
}) {
  const meta = channelMeta(cart.channel);
  const isOpen = cart.status === "open";
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <p className="truncate font-medium text-foreground">{cart.buyerName || cart.externalId}</p>
        {cart.buyerPhone ? (
          <p className="truncate text-[11px] text-muted-foreground">{cart.buyerPhone}</p>
        ) : (
          <p className="truncate text-[11px] italic text-muted-foreground">tanpa nomor WA</p>
        )}
      </td>
      <td className="px-3 py-3">
        <ChannelBadge channel={cart.channel} label={meta.label} />
      </td>
      <td className="px-3 py-3 text-foreground/80">
        <span className="inline-flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
          {itemsSummary(cart.items)}
        </span>
      </td>
      <td className="px-3 py-3 text-right font-semibold">{fmtMoney(cart.value, cart.currency)}</td>
      <td className="px-3 py-3">
        <CartStatusPill status={cart.status} />
        {cart.attempts > 0 && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {cart.attempts}× nudge · {fmtRelID(cart.lastAttemptAt)}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(cart.abandonedAt ?? cart.createdAt)}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          {isOpen ? (
            <>
              <button
                type="button"
                onClick={onNudge}
                disabled={nudging}
                title="Kirim pesan recovery via WhatsApp"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: WA }}
              >
                <MessageCircle className="h-3 w-3" /> {nudging ? "…" : "Recovery WA"}
              </button>
              <button
                type="button"
                onClick={onRecover}
                disabled={recovering}
                title="Tandai keranjang sudah pulih (pembeli checkout)"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-success/50 hover:text-success disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> {recovering ? "…" : "Pulih"}
              </button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
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

function TrashBlock({
  title,
  icon: Icon,
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  title: string;
  icon: typeof ShoppingBag;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {loading ? (
        <TableLoading rows={3} />
      ) : error ? (
        <ErrorState
          className="border-0"
          title="Gagal memuat sampah"
          description="Tidak bisa mengambil data yang dihapus."
          onRetry={onRetry}
        />
      ) : empty ? (
        <div className="px-6 py-8 text-center text-xs text-muted-foreground">Kosong.</div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

function TrashActions({ onRestore, onPurge }: { onRestore: () => void; onPurge: () => void }) {
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

function TableLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

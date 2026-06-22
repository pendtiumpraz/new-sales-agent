"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plug, RefreshCw, ShoppingCart } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toolbar } from "@/components/shared/toolbar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { useOrders } from "@/lib/api-mock/hooks";
import { MARKETPLACES } from "@/lib/utils/channel-config";
import { formatDayMonthID } from "@/lib/utils/format-date-id";
import type { Marketplace, Order } from "@/lib/types";
import { toast } from "sonner";

const STATUS: Record<Order["status"], { label: string; variant: "success" | "warning" | "muted" | "destructive" }> = {
  diproses: { label: "Diproses", variant: "warning" },
  dikirim: { label: "Dikirim", variant: "muted" },
  diterima: { label: "Diterima", variant: "success" },
  dibatalkan: { label: "Dibatalkan", variant: "destructive" },
};

// Abandoned carts are stored as "dibatalkan" in the demo data but are a DIFFERENT
// real-world state from a cancelled order: the cart was never checked out, so it
// can be RECOVERED ("keranjang masih kami simpan"). A genuinely cancelled order
// gets a re-offer instead. We branch on the `abandoned` flag to keep the two honest.
const CART_STATUS = { label: "Keranjang ditinggalkan", variant: "warning" as const };

const CONNECTED: Record<Marketplace, boolean> = {
  tokopedia: true,
  shopee: true,
  tiktok: false,
};

export default function EcommercePage() {
  const router = useRouter();
  const { data: orders, isLoading } = useOrders();
  const [recover, setRecover] = useState<Order | null>(null);
  const [connState, setConnState] = useState(CONNECTED);
  const [recovered, setRecovered] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const out: Record<string, { count: number; revenue: number }> = {};
    for (const mp of Object.keys(MARKETPLACES)) out[mp] = { count: 0, revenue: 0 };
    for (const o of orders ?? []) {
      out[o.marketplace].count += 1;
      if (o.status !== "dibatalkan") out[o.marketplace].revenue += o.total;
    }
    return out;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const list = orders ?? [];
    const s = search.trim().toLowerCase();
    return s
      ? list.filter(
          (o) =>
            o.id.toLowerCase().includes(s) ||
            o.customer.toLowerCase().includes(s) ||
            o.product.toLowerCase().includes(s),
        )
      : list;
  }, [orders, search]);

  const columns: DataColumn<Order>[] = [
    { key: "id", header: "Order ID", cell: (o) => <span className="font-mono text-xs">{o.id}</span> },
    {
      key: "channel",
      header: "Channel",
      sortValue: (o) => o.marketplace,
      cell: (o) => (
        <span className="flex items-center gap-1.5">
          <ChannelDot channel={o.marketplace} size={8} />
          <span className="text-xs text-muted-foreground">{MARKETPLACES[o.marketplace].label}</span>
        </span>
      ),
    },
    { key: "customer", header: "Pelanggan", sortValue: (o) => o.customer.toLowerCase(), cell: (o) => o.customer },
    { key: "product", header: "Produk", cell: (o) => <span className="text-muted-foreground">{o.product} <span className="text-xs">×{o.qty}</span></span> },
    { key: "total", header: "Total", align: "right", sortValue: (o) => o.total, cell: (o) => <IDRAmount value={o.total} className="font-medium" /> },
    { key: "date", header: "Tanggal", align: "right", sortValue: (o) => new Date(o.date).getTime(), cell: (o) => <span className="text-xs text-muted-foreground">{formatDayMonthID(o.date)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <Badge variant={o.abandoned ? CART_STATUS.variant : STATUS[o.status].variant}>
          {o.abandoned ? CART_STATUS.label : STATUS[o.status].label}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (o) =>
        recovered.has(o.id) ? (
          <Badge variant="success" className="gap-1">
            <Check className="h-3 w-3" /> {o.abandoned ? "Dipulihkan" : "Ditawarkan ulang"}
          </Badge>
        ) : o.abandoned ? (
          <Button size="sm" variant="outline" onClick={() => setRecover(o)}>
            <ShoppingCart className="h-3.5 w-3.5" /> Pulihkan
          </Button>
        ) : o.status === "dibatalkan" ? (
          <Button size="sm" variant="outline" onClick={() => setRecover(o)}>
            <RefreshCw className="h-3.5 w-3.5" /> Tawarkan ulang
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="E-Commerce"
        description="Pesanan dari Tokopedia, Shopee, dan TikTok Shop dalam satu tempat."
      />

      <div className="space-y-6 p-6">
        {/* Channel cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(MARKETPLACES) as Marketplace[]).map((mp) => {
            const meta = MARKETPLACES[mp];
            const Icon = meta.icon;
            const connected = connState[mp];
            return (
              <Card key={mp}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-semibold">{meta.label}</span>
                    </div>
                    {connected ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="h-3 w-3" />
                        Terhubung (demo)
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setConnState((s) => ({ ...s, [mp]: true }));
                          toast.info(`${meta.label} terhubung (mode demo — koneksi belum disimpan, akan ter-reset saat reload).`);
                        }}
                      >
                        <Plug className="h-3.5 w-3.5" />
                        Hubungkan
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Pesanan</p>
                      <p className="text-xl font-semibold tnum">
                        {connected ? stats[mp]?.count ?? 0 : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Pendapatan</p>
                      {connected ? (
                        <IDRAmount
                          value={stats[mp]?.revenue ?? 0}
                          compact
                          className="text-xl font-semibold text-primary"
                        />
                      ) : (
                        <p className="text-xl font-semibold text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Orders */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Semua pesanan</h2>
            <span className="shrink-0 text-sm text-muted-foreground">{orders?.length ?? 0} pesanan</span>
          </div>
          <Toolbar search={search} onSearch={setSearch} searchPlaceholder="Cari order / pelanggan / produk…" />
          <DataTable
            columns={columns}
            data={filteredOrders}
            rowKey={(o) => o.id}
            loading={isLoading}
            pageSize={12}
            emptyIcon={ShoppingCart}
            emptyTitle={search ? "Tidak ada pesanan yang cocok" : "Belum ada pesanan"}
            emptyDescription={search ? undefined : "Hubungkan channel marketplace untuk menarik pesanan."}
          />
        </div>
      </div>

      {/* WA draft — cart recovery (abandoned) OR re-offer (cancelled) */}
      <Dialog open={!!recover} onOpenChange={(o) => !o && setRecover(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChannelDot channel="whatsapp" size={10} />
              {recover?.abandoned ? "Pulihkan keranjang via WhatsApp" : "Tawarkan ulang via WhatsApp"}
            </DialogTitle>
            <DialogDescription>
              Draf pesan otomatis untuk {recover?.customer}. Mode demo — pesan
              belum benar-benar terkirim; buka percakapan di Inbox untuk
              mengirim.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg p-3 text-sm leading-relaxed" style={{ backgroundColor: "#D9FDD3" }}>
            {recover?.abandoned ? (
              <>
                Halo {recover?.customer} 👋 Keranjang Anda berisi{" "}
                <strong>{recover?.product}</strong> masih kami simpan. Selesaikan
                pesanan sekarang dan dapatkan gratis ongkir hari ini! Balas pesan
                ini untuk bantuan ya 🙏
              </>
            ) : (
              <>
                Halo {recover?.customer} 👋 Pesanan{" "}
                <strong>{recover?.product}</strong> sebelumnya dibatalkan. Bila
                masih dibutuhkan, kami bisa bantu proses ulang dengan harga
                spesial hari ini. Balas pesan ini ya 🙏
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecover(null)}>
              Batal
            </Button>
            <Button
              className="bg-channel-wa text-white hover:opacity-90"
              onClick={() => {
                if (recover) setRecovered((s) => new Set(s).add(recover.id));
                toast.success(`Draf disiapkan untuk ${recover?.customer}. Membuka Inbox…`);
                setRecover(null);
                router.push("/inbox?channel=whatsapp");
              }}
            >
              Buka di Inbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

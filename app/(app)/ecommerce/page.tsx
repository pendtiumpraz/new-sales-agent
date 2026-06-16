"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plug, ShoppingCart } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  const stats = useMemo(() => {
    const out: Record<string, { count: number; revenue: number }> = {};
    for (const mp of Object.keys(MARKETPLACES)) out[mp] = { count: 0, revenue: 0 };
    for (const o of orders ?? []) {
      out[o.marketplace].count += 1;
      if (o.status !== "dibatalkan") out[o.marketplace].revenue += o.total;
    }
    return out;
  }, [orders]);

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
                        Terhubung
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setConnState((s) => ({ ...s, [mp]: true }));
                          toast.success(`${meta.label} terhubung.`);
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

        {/* Orders table */}
        <Card>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Semua pesanan</h2>
            <span className="text-sm text-muted-foreground">{orders?.length ?? 0} pesanan</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Order ID</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, c) => (
                        <TableCell key={c}>
                          <Skeleton className={c === 0 ? "h-4 w-24" : "h-3.5 w-full"} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : (orders ?? []).slice(0, 40).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.id}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <ChannelDot channel={o.marketplace} size={8} />
                          <span className="text-xs text-muted-foreground">
                            {MARKETPLACES[o.marketplace].label}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>{o.customer}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.product}{" "}
                        <span className="text-xs">×{o.qty}</span>
                      </TableCell>
                      <TableCell>
                        <IDRAmount value={o.total} className="font-medium" />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDayMonthID(o.date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS[o.status].variant}>
                          {STATUS[o.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {o.abandoned && !recovered.has(o.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRecover(o)}
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            Pulihkan
                          </Button>
                        ) : o.abandoned ? (
                          <Badge variant="success" className="gap-1">
                            <Check className="h-3 w-3" /> Dipulihkan
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
              {!isLoading && (orders ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada pesanan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Cart recovery WA draft */}
      <Dialog open={!!recover} onOpenChange={(o) => !o && setRecover(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChannelDot channel="whatsapp" size={10} />
              Pulihkan keranjang via WhatsApp
            </DialogTitle>
            <DialogDescription>
              Draf pesan otomatis untuk {recover?.customer}. Mode demo — pesan
              belum benar-benar terkirim; buka percakapan di Inbox untuk
              mengirim.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg p-3 text-sm leading-relaxed" style={{ backgroundColor: "#D9FDD3" }}>
            Halo {recover?.customer} 👋 Keranjang Anda berisi{" "}
            <strong>{recover?.product}</strong> masih kami simpan. Selesaikan
            pesanan sekarang dan dapatkan gratis ongkir hari ini! Balas pesan ini
            untuk bantuan ya 🙏
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

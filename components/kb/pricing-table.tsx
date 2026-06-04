"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { BILLING_OPTIONS, useKbStore } from "@/lib/stores/kb-store";
import type { KbPricingTier } from "@/lib/types/kb";

const BILLING_LABEL: Record<KbPricingTier["billing"], string> = {
  bulanan: "/bln",
  tahunan: "/thn",
  "satu-kali": "satu kali",
};

const emptyDraft = (productId: string): Omit<KbPricingTier, "id"> => ({
  productId,
  tierName: "",
  priceIDR: 0,
  billing: "bulanan",
  features: [],
  minCommitmentMonths: undefined,
});

export function PricingTableEditor() {
  const products = useKbStore((s) => s.kb.products);
  const pricing = useKbStore((s) => s.kb.pricing);
  const addPricing = useKbStore((s) => s.addPricing);
  const updatePricing = useKbStore((s) => s.updatePricing);
  const removePricing = useKbStore((s) => s.removePricing);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbPricingTier | null>(null);
  const [draft, setDraft] = useState<Omit<KbPricingTier, "id">>(
    emptyDraft(products[0]?.id ?? ""),
  );
  const [featuresText, setFeaturesText] = useState("");

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // Group tiers by product for display
  const grouped = useMemo(() => {
    const map = new Map<string, KbPricingTier[]>();
    for (const t of pricing) {
      const list = map.get(t.productId) ?? [];
      list.push(t);
      map.set(t.productId, list);
    }
    return map;
  }, [pricing]);

  function openNew() {
    if (products.length === 0) {
      toast.error("Tambahkan produk terlebih dahulu.");
      return;
    }
    setEditing(null);
    setDraft(emptyDraft(products[0].id));
    setFeaturesText("");
    setOpen(true);
  }
  function openEdit(t: KbPricingTier) {
    setEditing(t);
    setDraft({
      productId: t.productId,
      tierName: t.tierName,
      priceIDR: t.priceIDR,
      billing: t.billing,
      features: t.features,
      minCommitmentMonths: t.minCommitmentMonths,
    });
    setFeaturesText(t.features.join("\n"));
    setOpen(true);
  }
  function save() {
    if (!draft.tierName.trim()) {
      toast.error("Nama tier wajib diisi.");
      return;
    }
    if (!draft.productId) {
      toast.error("Pilih produk untuk tier ini.");
      return;
    }
    const features = featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (editing) {
      updatePricing(editing.id, { ...draft, features });
      toast.success(`Tier "${draft.tierName}" diperbarui.`);
    } else {
      addPricing({ ...draft, features });
      toast.success(`Tier "${draft.tierName}" ditambahkan.`);
    }
    setOpen(false);
  }
  function remove(t: KbPricingTier) {
    removePricing(t.id);
    toast.success(`Tier "${t.tierName}" dihapus.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Daftar harga per produk per tier. AI memakai data ini untuk mencocokkan
          penawaran dengan ukuran prospek.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Tambah tier
        </Button>
      </div>

      {pricing.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Belum ada tier harga"
          description="Tambahkan tier harga untuk setiap produk agar AI bisa memberi penawaran tepat."
        />
      ) : (
        <div className="space-y-4">
          {products.map((p) => {
            const tiers = grouped.get(p.id) ?? [];
            if (tiers.length === 0) return null;
            return (
              <Card key={p.id}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.accent ?? "#FB5E3B" }}
                      />
                      <p className="text-sm font-semibold">{p.name}</p>
                      <Badge variant="muted">{tiers.length} tier</Badge>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Tier</TableHead>
                        <TableHead>Harga</TableHead>
                        <TableHead>Billing</TableHead>
                        <TableHead>Komitmen</TableHead>
                        <TableHead>Fitur</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tiers.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.tierName}</TableCell>
                          <TableCell>
                            <span className="flex items-baseline gap-1">
                              <IDRAmount
                                value={t.priceIDR}
                                className="font-semibold"
                              />
                              <span className="text-xs text-muted-foreground">
                                {BILLING_LABEL[t.billing]}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <Badge variant="secondary" className="capitalize">
                              {t.billing}
                            </Badge>
                          </TableCell>
                          <TableCell className="tnum text-xs text-muted-foreground">
                            {t.minCommitmentMonths
                              ? `${t.minCommitmentMonths} bln`
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {t.features.join(" · ") || "—"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(t)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-rose-600 hover:text-rose-700"
                                onClick={() => remove(t)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          {/* Orphan tiers (product deleted) */}
          {pricing
            .filter((t) => !productById.has(t.productId))
            .map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <Badge variant="warning">Produk hilang</Badge>
                  <span className="text-sm">{t.tierName}</span>
                  <span className="ml-auto">
                    <Button size="sm" variant="ghost" onClick={() => remove(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  </span>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit tier harga" : "Tambah tier harga"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Produk</Label>
                <Select
                  value={draft.productId}
                  onValueChange={(v) => setDraft({ ...draft, productId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih produk" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nama tier</Label>
                <Input
                  value={draft.tierName}
                  onChange={(e) =>
                    setDraft({ ...draft, tierName: e.target.value })
                  }
                  placeholder="Standar"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Harga (IDR)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.priceIDR}
                  onChange={(e) =>
                    setDraft({ ...draft, priceIDR: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Billing</Label>
                <Select
                  value={draft.billing}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      billing: v as KbPricingTier["billing"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_OPTIONS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Komitmen minimum (bulan)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.minCommitmentMonths ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      minCommitmentMonths: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="opsional"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fitur (satu per baris)</Label>
              <Textarea
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder={"Per pengguna / bulan\nCadence multi-channel\nLaporan otomatis"}
                className="min-h-[120px] font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save}>
              {editing ? "Simpan perubahan" : "Tambah tier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

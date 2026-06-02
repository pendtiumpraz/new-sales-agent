"use client";

import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { usePipelineStore } from "@/lib/stores/pipeline-store";
import { SIZE_BANDS } from "@/lib/api-mock/enrichment";
import type {
  EnrichmentCompanySize,
  EnrichmentSegment,
} from "@/lib/types/enrichment";
import { toast } from "sonner";

const SEGMENTS: EnrichmentSegment[] = ["UMKM", "Menengah", "Enterprise"];

// Default size bands per segment — helpful starting point for the form.
const DEFAULT_SIZES: Record<EnrichmentSegment, EnrichmentCompanySize[]> = {
  UMKM: ["1-10", "11-50"],
  Menengah: ["11-50", "51-200"],
  Enterprise: ["201-500", "500+"],
};

export function ProductManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const products = usePipelineStore((s) => s.products);
  const addProduct = usePipelineStore((s) => s.addProduct);
  const removeProduct = usePipelineStore((s) => s.removeProduct);
  const resetProducts = usePipelineStore((s) => s.resetProducts);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [segment, setSegment] = useState<EnrichmentSegment>("Menengah");

  function reset() {
    setName("");
    setDescription("");
    setPrice("");
    setSegment("Menengah");
  }

  function submit() {
    const priceNum = Number(price.replace(/[^0-9]/g, ""));
    if (!name.trim()) {
      toast.error("Nama produk wajib diisi.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("Harga tidak valid.");
      return;
    }
    addProduct({
      name: name.trim(),
      description: description.trim() || "—",
      priceIDR: priceNum,
      targetSegment: segment,
      targetCompanySize: DEFAULT_SIZES[segment],
    });
    toast.success(`Produk "${name.trim()}" ditambahkan. AI memetakan ulang prospek.`);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atur Produk & Harga</DialogTitle>
          <DialogDescription>
            Tambahkan produk Anda di sini — AI akan memetakan produk yang paling cocok ke
            setiap prospek berdasarkan ukuran perusahaan dan nilai deal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Existing products list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Daftar produk ({products.length})
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  resetProducts();
                  toast.success("Daftar produk dikembalikan ke default.");
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border bg-card/50 p-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: p.accent ?? "#64748B" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <Badge variant="muted" className="text-[10px]">
                        {p.targetSegment}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  </div>
                  <IDRAmount
                    value={p.priceIDR}
                    compact
                    className="shrink-0 text-sm font-semibold text-primary"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      removeProduct(p.id);
                      toast.success(`Produk "${p.name}" dihapus.`);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              {products.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Belum ada produk — tambahkan di bawah.
                </p>
              )}
            </div>
          </div>

          {/* Add product form */}
          <div className="space-y-3 rounded-xl border bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tambah produk baru
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama produk">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Paket Custom"
                />
              </Field>
              <Field label="Harga (IDR)">
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="15000000"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <Field label="Deskripsi singkat">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Apa yang ditawarkan, target pelanggan, dan benefit utama."
                rows={2}
              />
            </Field>
            <Field label="Segmen target">
              <Select
                value={segment}
                onValueChange={(v) => setSegment(v as EnrichmentSegment)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} ({DEFAULT_SIZES[s].join(", ")} karyawan)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Tip: AI akan otomatis mencocokkan produk ini ke prospek dengan ukuran
              perusahaan {DEFAULT_SIZES[segment].join(" / ")} karyawan.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button onClick={submit}>
            <Plus className="h-4 w-4" />
            Tambah produk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

// Re-export to keep type imports tree-shakable.
export type { EnrichmentCompanySize, EnrichmentSegment };
export { SIZE_BANDS };

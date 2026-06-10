"use client";

import { useState } from "react";
import { Package, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";

import { IDRAmount } from "@/components/shared/idr-amount";
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
import { cn } from "@/lib/utils";
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

// Segment badge tints — coral / teal / amber per Coral Sunset palette.
const SEGMENT_BADGE: Record<EnrichmentSegment, string> = {
  UMKM: "bg-amber-100 text-amber-800 border border-amber-300/60",
  Menengah: "bg-tertiary/15 text-tertiary border border-tertiary/30",
  Enterprise: "bg-primary/10 text-primary border border-primary/30",
};

// Rotating accent palette for products that have no explicit `accent`.
const PRODUCT_ACCENT_FALLBACK = ["#FB5E3B", "#14B8A6", "#F59E0B"];

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
      <DialogContent className="flex max-h-[min(85vh,720px)] max-w-2xl flex-col overflow-hidden p-0">
        {/* Gradient header strip — sticky at the top of the dialog */}
        <div className="relative shrink-0 overflow-hidden border-b border-primary/10 bg-gradient-to-r from-primary/12 via-tertiary/8 to-amber-500/8 px-6 pb-4 pt-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-tertiary text-white shadow-sm">
              <Package className="h-5 w-5" />
            </span>
            <DialogHeader className="flex-1 space-y-1 text-left">
              <DialogTitle className="text-lg">Atur Produk & Harga</DialogTitle>
              <DialogDescription className="flex items-start gap-1.5 text-xs leading-relaxed">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-tertiary" />
                <span>
                  Tambahkan produk Anda di sini — AI akan memetakan produk yang
                  paling cocok ke setiap prospek berdasarkan ukuran perusahaan
                  dan nilai deal.
                </span>
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Scrollable body — flex-1 + overflow-y-auto so even a long product
            list fits inside the viewport without the whole dialog overflowing. */}
        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 pb-2 pt-4">
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
              {products.map((p, idx) => {
                const accent =
                  p.accent ??
                  PRODUCT_ACCENT_FALLBACK[idx % PRODUCT_ACCENT_FALLBACK.length];
                return (
                  <div
                    key={p.id}
                    className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition-all hover:-translate-y-px hover:shadow-sm"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: `${accent}1A`,
                        color: accent,
                      }}
                    >
                      <Package className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-px text-[10px] font-medium",
                            SEGMENT_BADGE[p.targetSegment],
                          )}
                        >
                          {p.targetSegment}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <span style={{ color: accent }} className="shrink-0">
                      <IDRAmount
                        value={p.priceIDR}
                        compact
                        className="text-sm font-semibold"
                      />
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-70 transition-opacity hover:bg-rose-50 hover:opacity-100"
                      onClick={() => {
                        removeProduct(p.id);
                        toast.success(`Produk "${p.name}" dihapus.`);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-600" />
                    </Button>
                  </div>
                );
              })}
              {products.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Belum ada produk — tambahkan di bawah.
                </p>
              )}
            </div>
          </div>

          {/* Add product form */}
          <div className="space-y-3 rounded-xl border border-tertiary/20 bg-gradient-to-br from-tertiary/8 via-card to-amber-500/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-tertiary">
              <Plus className="h-3 w-3" />
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

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/20 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button
            onClick={submit}
            className="bg-gradient-to-r from-primary to-tertiary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)] hover:brightness-105"
          >
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

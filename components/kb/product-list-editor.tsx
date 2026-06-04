"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_CATEGORIES, useKbStore } from "@/lib/stores/kb-store";
import type { KbProduct } from "@/lib/types/kb";
import { cn } from "@/lib/utils";

// Orange/teal palette only — coral primary, coral mids, teal accent.
const ACCENTS = ["#FB5E3B", "#F6845C", "#F59E0B", "#86C7BE", "#14B8A6", "#0D9488"];

const emptyDraft = (): Omit<KbProduct, "id"> => ({
  name: "",
  description: "",
  sku: "",
  category: "Inti",
  active: true,
  accent: ACCENTS[0],
});

export function ProductListEditor() {
  const products = useKbStore((s) => s.kb.products);
  const addProduct = useKbStore((s) => s.addProduct);
  const updateProduct = useKbStore((s) => s.updateProduct);
  const removeProduct = useKbStore((s) => s.removeProduct);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbProduct | null>(null);
  const [draft, setDraft] = useState<Omit<KbProduct, "id">>(emptyDraft());

  function openNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }
  function openEdit(p: KbProduct) {
    setEditing(p);
    setDraft({
      name: p.name,
      description: p.description,
      sku: p.sku ?? "",
      category: p.category,
      active: p.active,
      accent: p.accent ?? ACCENTS[0],
    });
    setOpen(true);
  }
  function save() {
    if (!draft.name.trim()) {
      toast.error("Nama produk wajib diisi.");
      return;
    }
    if (editing) {
      updateProduct(editing.id, draft);
      toast.success(`Produk "${draft.name}" diperbarui.`);
    } else {
      addProduct(draft);
      toast.success(`Produk "${draft.name}" ditambahkan.`);
    }
    setOpen(false);
  }
  function remove(p: KbProduct) {
    removeProduct(p.id);
    toast.success(`Produk "${p.name}" dihapus (termasuk harga & relasi).`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Produk yang dikenali AI saat menyusun penawaran. Hapus produk akan
          membersihkan harga & relasi terkait.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Tambah produk
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Belum ada produk"
          description="Mulai dengan menambahkan produk inti yang ingin AI tawarkan."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Tambah produk pertama
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="flex items-start gap-3 p-4">
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${p.accent ?? "#FB5E3B"}1A`,
                    color: p.accent ?? "#FB5E3B",
                  }}
                >
                  <Package className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ? <span className="font-mono">{p.sku}</span> : "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={p.active ? "success" : "secondary"}>
                        {p.active ? "Aktif" : "Nonaktif"}
                      </Badge>
                      <Badge variant="secondary">{p.category}</Badge>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                    {p.description}
                  </p>
                  <div className="mt-3 flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => remove(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit produk" : "Tambah produk baru"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nama produk</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Paket Growth"
                />
              </div>
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input
                  value={draft.sku ?? ""}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                  placeholder="AGT-GRW-01"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) =>
                    setDraft({ ...draft, category: v as KbProduct["category"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Apa yang ditawarkan produk ini..."
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Warna aksen</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, accent: c })}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      draft.accent === c
                        ? "scale-110 border-foreground"
                        : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Pilih warna ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Aktif</p>
                <p className="text-xs text-muted-foreground">
                  Produk nonaktif disembunyikan dari AI & sales rep.
                </p>
              </div>
              <Switch
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save}>
              {editing ? "Simpan perubahan" : "Tambah produk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

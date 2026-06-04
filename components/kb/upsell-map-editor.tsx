"use client";

import { useState } from "react";
import { ArrowRight, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useKbStore } from "@/lib/stores/kb-store";
import type { KbUpsellRule } from "@/lib/types/kb";
import { cn } from "@/lib/utils";

const emptyDraft = (productId: string): Omit<KbUpsellRule, "id"> => ({
  fromProductId: productId,
  toProductIds: [],
  rationale: "",
});

export function UpsellMapEditor() {
  const products = useKbStore((s) => s.kb.products);
  const upsell = useKbStore((s) => s.kb.upsellMap);
  const addUpsell = useKbStore((s) => s.addUpsell);
  const updateUpsell = useKbStore((s) => s.updateUpsell);
  const removeUpsell = useKbStore((s) => s.removeUpsell);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbUpsellRule | null>(null);
  const [draft, setDraft] = useState<Omit<KbUpsellRule, "id">>(
    emptyDraft(products[0]?.id ?? ""),
  );

  const productById = new Map(products.map((p) => [p.id, p]));

  function openNew() {
    if (products.length < 2) {
      toast.error("Butuh minimal 2 produk untuk membuat alur upsell.");
      return;
    }
    setEditing(null);
    setDraft(emptyDraft(products[0].id));
    setOpen(true);
  }
  function openEdit(r: KbUpsellRule) {
    setEditing(r);
    setDraft({
      fromProductId: r.fromProductId,
      toProductIds: [...r.toProductIds],
      rationale: r.rationale,
    });
    setOpen(true);
  }
  function save() {
    if (!draft.fromProductId || draft.toProductIds.length === 0) {
      toast.error("Pilih produk awal & minimal 1 produk tujuan.");
      return;
    }
    if (!draft.rationale.trim()) {
      toast.error("Tambahkan alasan upsell untuk AI.");
      return;
    }
    if (draft.toProductIds.includes(draft.fromProductId)) {
      toast.error("Produk tujuan tidak boleh sama dengan produk awal.");
      return;
    }
    if (editing) {
      updateUpsell(editing.id, draft);
      toast.success("Alur upsell diperbarui.");
    } else {
      addUpsell(draft);
      toast.success("Alur upsell ditambahkan.");
    }
    setOpen(false);
  }
  function remove(r: KbUpsellRule) {
    removeUpsell(r.id);
    toast.success("Alur upsell dihapus.");
  }

  function toggleTo(id: string) {
    setDraft((d) => ({
      ...d,
      toProductIds: d.toProductIds.includes(id)
        ? d.toProductIds.filter((p) => p !== id)
        : [...d.toProductIds, id],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Peta upsell — produk apa yang ditawarkan setelah pelanggan membeli
          produk awal. AI memakai ini untuk re-engagement otomatis.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Tambah alur upsell
        </Button>
      </div>

      {upsell.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Belum ada peta upsell"
          description="Susun jalur upsell pertama agar AI bisa menawarkan upgrade yang tepat."
        />
      ) : (
        <div className="space-y-3">
          {upsell.map((rule) => {
            const from = productById.get(rule.fromProductId);
            const toList = rule.toProductIds
              .map((id) => productById.get(id))
              .filter(Boolean);
            return (
              <Card key={rule.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <ProductChip
                        name={from?.name ?? "Produk hilang"}
                        accent={from?.accent}
                        emphasized
                      />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      {toList.length === 0 ? (
                        <Badge variant="warning">Tujuan kosong</Badge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {toList.map((p) => (
                            <ProductChip
                              key={p!.id}
                              name={p!.name}
                              accent={p!.accent}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(rule)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600 hover:text-rose-700"
                        onClick={() => remove(rule)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed bg-muted/30 p-3">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Alasan untuk AI
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {rule.rationale}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit alur upsell" : "Tambah alur upsell"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Dari produk</Label>
              <Select
                value={draft.fromProductId}
                onValueChange={(v) => setDraft({ ...draft, fromProductId: v })}
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
              <Label>Tawarkan upgrade ke</Label>
              <div className="space-y-1.5">
                {products
                  .filter((p) => p.id !== draft.fromProductId)
                  .map((p) => {
                    const on = draft.toProductIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                          on
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50",
                        )}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={() => toggleTo(p.id)}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: p.accent ?? "#FB5E3B" }}
                        />
                        <span className="flex-1">{p.name}</span>
                        <Badge variant="muted" className="text-[10px]">
                          {p.category}
                        </Badge>
                      </label>
                    );
                  })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alasan upsell</Label>
              <Textarea
                value={draft.rationale}
                onChange={(e) =>
                  setDraft({ ...draft, rationale: e.target.value })
                }
                placeholder="Kapan & kenapa upsell ini relevan..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save}>
              {editing ? "Simpan perubahan" : "Tambah alur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductChip({
  name,
  accent,
  emphasized,
}: {
  name: string;
  accent?: string;
  emphasized?: boolean;
}) {
  const color = accent ?? "#FB5E3B";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        emphasized && "shadow-sm",
      )}
      style={{
        backgroundColor: `${color}14`,
        borderColor: `${color}33`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

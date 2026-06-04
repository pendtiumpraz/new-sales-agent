"use client";

import { useState } from "react";
import { Pencil, Plus, Star, Trash2, Users } from "lucide-react";
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
import { SEGMENT_TIERS, useKbStore } from "@/lib/stores/kb-store";
import type { KbSegment, KbSegmentTier } from "@/lib/types/kb";
import { cn } from "@/lib/utils";

const emptyDraft = (): Omit<KbSegment, "id"> => ({
  label: "UMKM",
  description: "",
  revenueBand: "",
  headcountBand: "",
  talkingPoints: [],
});

export function SegmentsEditor() {
  const segments = useKbStore((s) => s.kb.segments);
  const products = useKbStore((s) => s.kb.products);
  const priorityProducts = useKbStore((s) => s.kb.priorityProducts);
  const addSegment = useKbStore((s) => s.addSegment);
  const updateSegment = useKbStore((s) => s.updateSegment);
  const removeSegment = useKbStore((s) => s.removeSegment);
  const setPriorityProducts = useKbStore((s) => s.setPriorityProducts);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbSegment | null>(null);
  const [draft, setDraft] = useState<Omit<KbSegment, "id">>(emptyDraft());
  const [pointsText, setPointsText] = useState("");

  function openNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setPointsText("");
    setOpen(true);
  }
  function openEdit(s: KbSegment) {
    setEditing(s);
    setDraft({
      label: s.label,
      description: s.description,
      revenueBand: s.revenueBand,
      headcountBand: s.headcountBand,
      talkingPoints: s.talkingPoints,
    });
    setPointsText(s.talkingPoints.join("\n"));
    setOpen(true);
  }
  function save() {
    if (!draft.description.trim()) {
      toast.error("Deskripsi segmen wajib diisi.");
      return;
    }
    const talkingPoints = pointsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (editing) {
      updateSegment(editing.id, { ...draft, talkingPoints });
      toast.success(`Segmen "${draft.label}" diperbarui.`);
    } else {
      addSegment({ ...draft, talkingPoints });
      toast.success(`Segmen "${draft.label}" ditambahkan.`);
    }
    setOpen(false);
  }
  function remove(s: KbSegment) {
    removeSegment(s.id);
    toast.success(`Segmen "${s.label}" dihapus.`);
  }

  function togglePriority(segmentId: string, productId: string) {
    const current =
      priorityProducts.find((m) => m.segmentId === segmentId)?.productIds ?? [];
    const next = current.includes(productId)
      ? current.filter((p) => p !== productId)
      : [...current, productId];
    setPriorityProducts(segmentId, next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Segmen target & produk prioritas per segmen. AI memprioritaskan produk
          ini saat menyusun penawaran.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Tambah segmen
        </Button>
      </div>

      {segments.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada segmen"
          description="Definisikan segmen target untuk AI memprioritaskan produk yang tepat."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {segments.map((seg) => {
            const priorityIds =
              priorityProducts.find((m) => m.segmentId === seg.id)?.productIds ??
              [];
            return (
              <Card key={seg.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{seg.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {seg.revenueBand} · {seg.headcountBand}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(seg)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600 hover:text-rose-700"
                        onClick={() => remove(seg)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {seg.description}
                  </p>
                  {seg.talkingPoints.length > 0 && (
                    <div className="rounded-lg border border-dashed bg-muted/30 p-3">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Talking points
                      </p>
                      <ul className="space-y-1 text-xs">
                        {seg.talkingPoints.map((tp, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-muted-foreground"
                          >
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                            {tp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-semibold">Produk prioritas</p>
                    </div>
                    <div className="space-y-1.5">
                      {products.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Tambahkan produk dulu.
                        </p>
                      ) : (
                        products.map((p) => {
                          const on = priorityIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                                on
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-accent/50",
                              )}
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={() =>
                                  togglePriority(seg.id, p.id)
                                }
                              />
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor: p.accent ?? "#FB5E3B",
                                }}
                              />
                              <span className="flex-1 truncate">{p.name}</span>
                              {on && (
                                <Badge variant="muted" className="text-[10px]">
                                  prioritas
                                </Badge>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
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
              {editing ? "Edit segmen" : "Tambah segmen baru"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tingkat segmen</Label>
                <Select
                  value={draft.label}
                  onValueChange={(v) =>
                    setDraft({ ...draft, label: v as KbSegmentTier })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENT_TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Headcount</Label>
                <Input
                  value={draft.headcountBand}
                  onChange={(e) =>
                    setDraft({ ...draft, headcountBand: e.target.value })
                  }
                  placeholder="1–10 karyawan"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Pendapatan tahunan</Label>
                <Input
                  value={draft.revenueBand}
                  onChange={(e) =>
                    setDraft({ ...draft, revenueBand: e.target.value })
                  }
                  placeholder="< Rp 5 M/tahun"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Karakteristik segmen ini..."
                className="min-h-[70px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Talking points (satu per baris)</Label>
              <Textarea
                value={pointsText}
                onChange={(e) => setPointsText(e.target.value)}
                placeholder={"Setup di bawah 10 menit\nHemat 6 jam/minggu"}
                className="min-h-[100px] font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save}>
              {editing ? "Simpan perubahan" : "Tambah segmen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

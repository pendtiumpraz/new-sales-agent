"use client";

import { useState } from "react";
import {
  Clock,
  Heart,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RETENTION_TYPES, useKbStore } from "@/lib/stores/kb-store";
import type {
  KbRetentionFlow,
  KbRetentionTriggerType,
} from "@/lib/types/kb";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  KbRetentionTriggerType,
  {
    label: string;
    icon: typeof RefreshCw;
    badgeVariant: "secondary" | "muted" | "success";
    iconBg: string;
    iconColor: string;
  }
> = {
  "repeat-order": {
    label: "Repeat order",
    icon: RefreshCw,
    badgeVariant: "secondary",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  "after-sales": {
    label: "After-sales",
    icon: Sparkles,
    badgeVariant: "muted",
    iconBg: "bg-tertiary/10",
    iconColor: "text-tertiary",
  },
  loyalty: {
    label: "Loyalty",
    icon: Heart,
    badgeVariant: "success",
    iconBg: "bg-success/10",
    iconColor: "text-emerald-700",
  },
};

const emptyDraft = (): Omit<KbRetentionFlow, "id"> => ({
  name: "",
  type: "repeat-order",
  trigger: "",
  action: "",
  delayDays: 0,
  productIds: [],
  segmentIds: [],
  active: true,
});

export function RetentionFlowsEditor() {
  const flows = useKbStore((s) => s.kb.retentionFlows);
  const products = useKbStore((s) => s.kb.products);
  const segments = useKbStore((s) => s.kb.segments);
  const addRetention = useKbStore((s) => s.addRetention);
  const updateRetention = useKbStore((s) => s.updateRetention);
  const removeRetention = useKbStore((s) => s.removeRetention);
  const toggleRetention = useKbStore((s) => s.toggleRetention);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbRetentionFlow | null>(null);
  const [draft, setDraft] = useState<Omit<KbRetentionFlow, "id">>(emptyDraft());

  const productById = new Map(products.map((p) => [p.id, p]));
  const segmentById = new Map(segments.map((s) => [s.id, s]));

  function openNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }
  function openEdit(f: KbRetentionFlow) {
    setEditing(f);
    setDraft({
      name: f.name,
      type: f.type,
      trigger: f.trigger,
      action: f.action,
      delayDays: f.delayDays,
      productIds: [...f.productIds],
      segmentIds: [...f.segmentIds],
      active: f.active,
    });
    setOpen(true);
  }
  function save() {
    if (!draft.name.trim() || !draft.trigger.trim() || !draft.action.trim()) {
      toast.error("Nama, trigger, dan aksi wajib diisi.");
      return;
    }
    if (editing) {
      updateRetention(editing.id, draft);
      toast.success(`Alur "${draft.name}" diperbarui.`);
    } else {
      addRetention(draft);
      toast.success(`Alur "${draft.name}" ditambahkan.`);
    }
    setOpen(false);
  }
  function remove(f: KbRetentionFlow) {
    removeRetention(f.id);
    toast.success(`Alur "${f.name}" dihapus.`);
  }

  function toggleScope(field: "productIds" | "segmentIds", id: string) {
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(id)
        ? d[field].filter((x) => x !== id)
        : [...d[field], id],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Aturan retensi: repeat order, after-sales, dan loyalty. AI menjalankan
          aksi otomatis berdasarkan trigger di sini.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Tambah alur retensi
        </Button>
      </div>

      {flows.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Belum ada alur retensi"
          description="Tambahkan minimal satu alur agar AI bisa menjaga pelanggan tetap aktif."
        />
      ) : (
        <div className="space-y-3">
          {flows.map((f) => {
            const meta = TYPE_META[f.type];
            const Icon = meta.icon;
            return (
              <Card
                key={f.id}
                className={cn(!f.active && "opacity-60")}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        meta.iconBg,
                        meta.iconColor,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{f.name}</p>
                        <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {f.delayDays === 0
                            ? "Langsung"
                            : `+${f.delayDays} hari`}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-dashed bg-muted/30 p-3">
                          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Trigger
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {f.trigger}
                          </p>
                        </div>
                        <div className="rounded-lg border border-dashed bg-muted/30 p-3">
                          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Aksi AI
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {f.action}
                          </p>
                        </div>
                      </div>
                      {(f.productIds.length > 0 || f.segmentIds.length > 0) && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                          {f.productIds.length === 0 ? (
                            <Badge variant="muted">Semua produk</Badge>
                          ) : (
                            f.productIds.map((id) => {
                              const p = productById.get(id);
                              if (!p) return null;
                              return (
                                <Badge key={id} variant="muted">
                                  {p.name}
                                </Badge>
                              );
                            })
                          )}
                          {f.segmentIds.length > 0 &&
                            f.segmentIds.map((id) => {
                              const s = segmentById.get(id);
                              if (!s) return null;
                              return (
                                <Badge key={id} variant="secondary">
                                  {s.label}
                                </Badge>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Switch
                        checked={f.active}
                        onCheckedChange={() => toggleRetention(f.id)}
                      />
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(f)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-600 hover:text-rose-700"
                          onClick={() => remove(f)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit alur retensi" : "Tambah alur retensi"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nama alur</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Repeat order — Starter ke Growth"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Jenis</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      type: v as KbRetentionTriggerType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tunda (hari)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.delayDays}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      delayDays: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <Textarea
                value={draft.trigger}
                onChange={(e) =>
                  setDraft({ ...draft, trigger: e.target.value })
                }
                placeholder="Kapan alur ini berjalan..."
                className="min-h-[70px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Aksi AI</Label>
              <Textarea
                value={draft.action}
                onChange={(e) =>
                  setDraft({ ...draft, action: e.target.value })
                }
                placeholder="Apa yang harus AI lakukan..."
                className="min-h-[70px]"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block">Berlaku untuk produk</Label>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Kosongkan = semua produk
                </p>
                <div className="space-y-1">
                  {products.map((p) => {
                    const on = draft.productIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 text-xs"
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={() => toggleScope("productIds", p.id)}
                        />
                        <span>{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Berlaku untuk segmen</Label>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Kosongkan = semua segmen
                </p>
                <div className="space-y-1">
                  {segments.map((s) => {
                    const on = draft.segmentIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 text-xs"
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={() => toggleScope("segmentIds", s.id)}
                        />
                        <span>{s.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Aktifkan alur</p>
                <p className="text-xs text-muted-foreground">
                  Alur nonaktif tidak akan dijalankan AI.
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
              {editing ? "Simpan perubahan" : "Tambah alur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

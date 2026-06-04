"use client";

import { useState } from "react";
import { Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useKbStore } from "@/lib/stores/kb-store";
import type { KbStrategyNote } from "@/lib/types/kb";

const ALL = "__ALL__";

const emptyDraft = (): Omit<KbStrategyNote, "id"> => ({
  title: "",
  body: "",
  segmentId: null,
});

export function StrategyEditor() {
  const notes = useKbStore((s) => s.kb.marketingStrategy);
  const segments = useKbStore((s) => s.kb.segments);
  const addStrategy = useKbStore((s) => s.addStrategy);
  const updateStrategy = useKbStore((s) => s.updateStrategy);
  const removeStrategy = useKbStore((s) => s.removeStrategy);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbStrategyNote | null>(null);
  const [draft, setDraft] = useState<Omit<KbStrategyNote, "id">>(emptyDraft());

  function openNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }
  function openEdit(n: KbStrategyNote) {
    setEditing(n);
    setDraft({ title: n.title, body: n.body, segmentId: n.segmentId ?? null });
    setOpen(true);
  }
  function save() {
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.error("Judul & isi catatan wajib diisi.");
      return;
    }
    if (editing) {
      updateStrategy(editing.id, draft);
      toast.success("Catatan strategi diperbarui.");
    } else {
      addStrategy(draft);
      toast.success("Catatan strategi ditambahkan.");
    }
    setOpen(false);
  }
  function remove(n: KbStrategyNote) {
    removeStrategy(n.id);
    toast.success("Catatan dihapus.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Catatan strategi & playbook spesifik klien. Dijadikan rujukan AI saat
          merancang opening message & follow-up.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Tambah catatan
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Belum ada catatan strategi"
          description="Tambahkan playbook & pesan kunci agar AI lebih on-brand."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((n) => {
            const seg = segments.find((s) => s.id === n.segmentId);
            return (
              <Card key={n.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-amber-700">
                        <Lightbulb className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          {n.title}
                        </p>
                        <div className="mt-1">
                          {seg ? (
                            <Badge variant="muted">{seg.label}</Badge>
                          ) : (
                            <Badge variant="secondary">Semua segmen</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(n)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600 hover:text-rose-700"
                        onClick={() => remove(n)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {n.body}
                  </p>
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
              {editing ? "Edit catatan strategi" : "Tambah catatan strategi"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Judul</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Tonjolkan kepatuhan UU PDP"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Berlaku untuk segmen</Label>
              <Select
                value={draft.segmentId ?? ALL}
                onValueChange={(v) =>
                  setDraft({ ...draft, segmentId: v === ALL ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Semua segmen</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Isi catatan</Label>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Strategi, pesan kunci, atau guard-rail untuk AI..."
                className="min-h-[140px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save}>
              {editing ? "Simpan perubahan" : "Tambah catatan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

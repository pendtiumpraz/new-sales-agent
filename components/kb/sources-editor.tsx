"use client";

import { useMemo, useState } from "react";
import {
  Database,
  FileText,
  Globe,
  Layers,
  MessageCircleQuestion,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { SOURCE_KINDS, useKbStore } from "@/lib/stores/kb-store";
import type { KbSource, KbSourceKind, KbSourceStatus } from "@/lib/types/kb";
import { cn } from "@/lib/utils";
import { formatRelativeID } from "@/lib/utils/format-date-id";

// ── Meta per source kind — icon + tint (coral or teal only) ────────────────
const KIND_META: Record<
  KbSourceKind,
  {
    label: string;
    icon: typeof FileText;
    iconBg: string;
    iconColor: string;
  }
> = {
  pdf: {
    label: "PDF",
    icon: FileText,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  url: {
    label: "URL",
    icon: Globe,
    iconBg: "bg-tertiary/10",
    iconColor: "text-tertiary",
  },
  faq: {
    label: "FAQ",
    icon: MessageCircleQuestion,
    iconBg: "bg-warning/15",
    iconColor: "text-amber-700",
  },
  doc: {
    label: "Dokumen",
    icon: FileText,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
};

const STATUS_META: Record<
  KbSourceStatus,
  { label: string; variant: "success" | "warning" | "muted" | "destructive" }
> = {
  indexed: { label: "Terindeks", variant: "success" },
  indexing: { label: "Mengindeks", variant: "warning" },
  stale: { label: "Usang", variant: "muted" },
  error: { label: "Error", variant: "destructive" },
};

type KindFilter = "all" | KbSourceKind;

// Deterministic chunk count from content length (per spec).
function computeChunks(content: string): number {
  return Math.max(8, Math.floor(content.length / 40));
}

const emptyDraft = (): Omit<KbSource, "id"> => ({
  kind: "pdf",
  title: "",
  description: "",
  ref: "",
  question: "",
  answer: "",
  segmentScope: [],
  chunks: 8,
  lastIndexedAt: new Date().toISOString(),
  status: "indexed",
  active: true,
});

export function SourcesEditor() {
  const sources = useKbStore((s) => s.kb.sources);
  const segments = useKbStore((s) => s.kb.segments);
  const upsertSource = useKbStore((s) => s.upsertSource);
  const removeSource = useKbStore((s) => s.removeSource);
  const toggleSourceActive = useKbStore((s) => s.toggleSourceActive);
  const setSourceStatus = useKbStore((s) => s.setSourceStatus);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbSource | null>(null);
  const [draft, setDraft] = useState<Omit<KbSource, "id">>(emptyDraft());
  const [filter, setFilter] = useState<KindFilter>("all");

  const segmentById = useMemo(
    () => new Map(segments.map((s) => [s.id, s])),
    [segments],
  );

  const filtered = useMemo(
    () =>
      filter === "all" ? sources : sources.filter((s) => s.kind === filter),
    [sources, filter],
  );

  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = {
      all: sources.length,
      pdf: 0,
      url: 0,
      faq: 0,
      doc: 0,
    };
    for (const s of sources) counts[s.kind] += 1;
    return counts;
  }, [sources]);

  function openNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  }

  function openEdit(s: KbSource) {
    setEditing(s);
    setDraft({
      kind: s.kind,
      title: s.title,
      description: s.description ?? "",
      ref: s.ref ?? "",
      question: s.question ?? "",
      answer: s.answer ?? "",
      segmentScope: [...(s.segmentScope ?? [])],
      chunks: s.chunks,
      lastIndexedAt: s.lastIndexedAt,
      status: s.status,
      active: s.active,
    });
    setOpen(true);
  }

  function save() {
    if (!draft.title.trim()) {
      toast.error("Judul sumber wajib diisi.");
      return;
    }
    if (draft.kind === "faq") {
      if (!draft.question?.trim() || !draft.answer?.trim()) {
        toast.error("Pertanyaan dan jawaban FAQ wajib diisi.");
        return;
      }
    }
    if ((draft.kind === "pdf" || draft.kind === "doc") && !draft.ref?.trim()) {
      toast.error("Nama file wajib diisi.");
      return;
    }
    if (draft.kind === "url" && !draft.ref?.trim()) {
      toast.error("URL wajib diisi.");
      return;
    }

    // Compute deterministic chunk count from content payload.
    const corpus =
      draft.kind === "faq"
        ? `${draft.question ?? ""} ${draft.answer ?? ""}`
        : `${draft.title} ${draft.description ?? ""} ${draft.ref ?? ""}`;
    const chunks = computeChunks(corpus);

    if (editing) {
      upsertSource({
        ...editing,
        ...draft,
        chunks,
        status: "indexed",
        lastIndexedAt: new Date().toISOString(),
      });
      toast.success(`Sumber "${draft.title}" diperbarui.`);
    } else {
      upsertSource({
        ...draft,
        chunks,
        status: "indexed",
        lastIndexedAt: new Date().toISOString(),
      });
      toast.success(`Sumber "${draft.title}" ditambahkan.`);
    }
    setOpen(false);
  }

  function remove(s: KbSource) {
    removeSource(s.id);
    toast.success(`Sumber "${s.title}" dihapus.`);
  }

  function reindex(s: KbSource) {
    setSourceStatus(s.id, "indexing");
    toast.message("Reindeks dimulai…", {
      description: `"${s.title}" sedang diproses ulang.`,
    });
    // Simulated finish — flips to indexed after a short delay.
    setTimeout(() => {
      setSourceStatus(s.id, "indexed");
      toast.success(`"${s.title}" siap dipakai oleh AI.`);
    }, 1400);
  }

  function toggleScope(id: string) {
    setDraft((d) => {
      const cur = d.segmentScope ?? [];
      return {
        ...d,
        segmentScope: cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id],
      };
    });
  }

  const filterChips: { value: KindFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    ...SOURCE_KINDS.map((k) => ({ value: k.value, label: k.label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Sumber Advanced RAG: PDF, URL, FAQ, dan dokumen yang dipakai AI untuk
          menyusun jawaban. Hapus segmen tidak menghapus sumber — hanya melepas
          cakupan.
        </p>
        <Button onClick={openNew} className="shrink-0">
          <Plus className="h-4 w-4" />
          Tambah sumber
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filterChips.map((c) => {
          const on = filter === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setFilter(c.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <span>{c.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tnum",
                  on
                    ? "bg-primary-foreground/20"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {kindCounts[c.value]}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Database}
          title={
            sources.length === 0
              ? "Belum ada sumber pengetahuan"
              : "Tidak ada sumber untuk filter ini"
          }
          description={
            sources.length === 0
              ? "Tambahkan PDF, URL, atau FAQ agar Advanced RAG punya bahan baku."
              : "Coba pilih filter lain atau tambahkan sumber baru."
          }
          action={
            sources.length === 0 ? (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" />
                Tambah sumber pertama
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => {
            const meta = KIND_META[s.kind];
            const status = STATUS_META[s.status];
            const Icon = meta.icon;
            return (
              <Card
                key={s.id}
                className={cn(
                  "group transition-shadow hover:shadow-sm",
                  !s.active && "opacity-60",
                )}
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        meta.iconBg,
                        meta.iconColor,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {s.title}
                        </p>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      {s.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                      {s.ref && (
                        <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">
                          {s.ref}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Switch
                        checked={s.active}
                        onCheckedChange={() => toggleSourceActive(s.id)}
                        aria-label={`Aktifkan sumber ${s.title}`}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => reindex(s)}
                            disabled={s.status === "indexing"}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Reindeks
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => remove(s)}
                            className="text-rose-600 focus:text-rose-700"
                          >
                            <Trash2 className="h-4 w-4" />
                            Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {s.kind === "faq" && s.question && (
                    <div className="rounded-lg border border-dashed bg-muted/30 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Tanya
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed">
                        {s.question}
                      </p>
                      {s.answer && (
                        <>
                          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Jawab
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {s.answer}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      <span className="tnum">{s.chunks}</span> chunks
                    </span>
                    <span>Terakhir: {formatRelativeID(s.lastIndexedAt)}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {!s.segmentScope || s.segmentScope.length === 0 ? (
                        <Badge variant="muted">Semua segmen</Badge>
                      ) : (
                        s.segmentScope.map((sid) => {
                          const seg = segmentById.get(sid);
                          if (!seg) return null;
                          return (
                            <Badge key={sid} variant="secondary">
                              {seg.label}
                            </Badge>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit sumber pengetahuan" : "Tambah sumber pengetahuan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Jenis sumber</Label>
              <Select
                value={draft.kind}
                onValueChange={(v) =>
                  setDraft({ ...draft, kind: v as KbSourceKind })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Judul</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={
                  draft.kind === "faq"
                    ? "FAQ Onboarding 10 menit"
                    : draft.kind === "url"
                      ? "Halaman harga website"
                      : "Brosur Paket Growth"
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Deskripsi singkat</Label>
              <Textarea
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Catatan singkat untuk tim — kapan sumber ini dipakai AI."
                className="min-h-[60px]"
              />
            </div>

            {(draft.kind === "pdf" || draft.kind === "doc") && (
              <div className="space-y-1.5">
                <Label>Nama file (mock — tanpa upload)</Label>
                <Input
                  value={draft.ref ?? ""}
                  onChange={(e) => setDraft({ ...draft, ref: e.target.value })}
                  placeholder="brosur-growth-v3.pdf"
                />
              </div>
            )}

            {draft.kind === "url" && (
              <div className="space-y-1.5">
                <Label>URL</Label>
                <Input
                  type="url"
                  value={draft.ref ?? ""}
                  onChange={(e) => setDraft({ ...draft, ref: e.target.value })}
                  placeholder="https://agenticsales.id/harga"
                />
              </div>
            )}

            {draft.kind === "faq" && (
              <>
                <div className="space-y-1.5">
                  <Label>Sumber FAQ (opsional)</Label>
                  <Input
                    value={draft.ref ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, ref: e.target.value })
                    }
                    placeholder="Tim Customer Success"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pertanyaan</Label>
                  <Textarea
                    value={draft.question ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, question: e.target.value })
                    }
                    placeholder="Berapa lama setup awal sampai bisa terima pesan WhatsApp pertama?"
                    className="min-h-[60px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Jawaban</Label>
                  <Textarea
                    value={draft.answer ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, answer: e.target.value })
                    }
                    placeholder="Setup standar di bawah 10 menit..."
                    className="min-h-[100px]"
                  />
                </div>
              </>
            )}

            <div>
              <Label className="mb-1.5 block">Cakupan segmen</Label>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Kosongkan = berlaku untuk semua segmen
              </p>
              <div className="space-y-1">
                {segments.map((s) => {
                  const on = (draft.segmentScope ?? []).includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 text-xs"
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => toggleScope(s.id)}
                      />
                      <span>{s.label}</span>
                      <span className="text-muted-foreground">
                        — {s.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Aktifkan sumber</p>
                <p className="text-xs text-muted-foreground">
                  Sumber nonaktif tidak diambil oleh retriever.
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
              {editing ? "Simpan perubahan" : "Tambah sumber"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Sparkles, Wand2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContentStore } from "@/lib/stores/content-store";
import {
  CONTENT_AI_DRAFTS,
  CONTENT_TYPE_META,
  CONTENT_TYPES,
} from "@/lib/utils/content-config";
import type { ContentItem, ContentType } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string; // ISO date — used when launching from the calendar
}

const TAG_OPTIONS = ["promo", "edukasi", "studi-kasus", "lebaran", "umkm"];

export function ContentCreateDialog({ open, onOpenChange, defaultDate }: Props) {
  const add = useContentStore((s) => s.add);
  const [type, setType] = useState<ContentType>("wa-broadcast");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("Pelanggan VIP");
  const [scheduledDate, setScheduledDate] = useState("");
  const [cta, setCta] = useState("Klik untuk daftar");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [draftIdx, setDraftIdx] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Reset state each time the dialog opens
  useEffect(() => {
    if (open) {
      setType("wa-broadcast");
      setTitle("");
      setSubject("");
      setBody("");
      setAudience("Pelanggan VIP");
      setScheduledDate(defaultDate ?? "");
      setCta("Klik untuk daftar");
      setTags(new Set());
      setDraftIdx(0);
    }
  }, [open, defaultDate]);

  const drafts = useMemo(() => CONTENT_AI_DRAFTS[type], [type]);

  function generate() {
    setGenerating(true);
    setTimeout(() => {
      const next = drafts[draftIdx % drafts.length];
      // For email drafts that include "Subjek: ..." line, peel it into subject
      if (type === "email-campaign" && next.startsWith("Subjek:")) {
        const [first, ...rest] = next.split("\n");
        setSubject(first.replace(/^Subjek:\s*/, ""));
        setBody(rest.join("\n").trimStart());
      } else {
        setBody(next);
      }
      setDraftIdx((i) => i + 1);
      setGenerating(false);
    }, 550);
  }

  function save(scheduleIt: boolean) {
    if (!title.trim()) {
      toast.error("Judul wajib diisi.");
      return;
    }
    if (scheduleIt && !scheduledDate) {
      toast.error("Pilih tanggal jadwal terlebih dahulu.");
      return;
    }
    const now = new Date().toISOString();
    const item: ContentItem = {
      id: `cn_local_${Date.now()}`,
      title: title.trim(),
      type,
      status: scheduleIt ? "scheduled" : "draft",
      body,
      subject: type === "email-campaign" ? subject || undefined : undefined,
      audience,
      scheduledFor: scheduleIt
        ? new Date(`${scheduledDate}T09:00:00+07:00`).toISOString()
        : undefined,
      author: "Andi Hidayat",
      createdAt: now,
      updatedAt: now,
      tags: Array.from(tags),
      cta,
    };
    add(item);
    toast.success(
      scheduleIt
        ? `"${item.title}" dijadwalkan ${scheduledDate}.`
        : `Draf "${item.title}" disimpan.`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buat konten baru</DialogTitle>
          <DialogDescription>
            Rancang konten lalu simpan sebagai draf atau langsung jadwalkan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-1.5">
            <Label htmlFor="cn-title">Judul</Label>
            <Input
              id="cn-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Misal: ${
                CONTENT_TYPE_META[type].label === "WhatsApp Broadcast"
                  ? "Promo Lebaran 2026"
                  : "Newsletter Mei 2026"
              }`}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Jenis konten</Label>
            <Select value={type} onValueChange={(v) => setType(v as ContentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: CONTENT_TYPE_META[t].color }}
                      />
                      {CONTENT_TYPE_META[t].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cn-aud">Audiens</Label>
            <Input
              id="cn-aud"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>

          {type === "email-campaign" && (
            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="cn-subj">Subjek email</Label>
              <Input
                id="cn-subj"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subjek email yang menarik..."
              />
            </div>
          )}

          <div className="sm:col-span-2 grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cn-body">Isi konten</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={generating}
                onClick={generate}
              >
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                {generating ? "Memuat template…" : "Pakai template"}
              </Button>
            </div>
            <Textarea
              id="cn-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tulis konten Anda — atau klik Template untuk isi cepat."
              className="min-h-[160px]"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cn-cta">CTA</Label>
            <Input
              id="cn-cta"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cn-date" className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Tanggal jadwal (opsional)
            </Label>
            <Input
              id="cn-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min="2026-05-25"
            />
          </div>

          <div className="sm:col-span-2 grid gap-1.5">
            <Label>Tag</Label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((t) => {
                const on = tags.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setTags((prev) => {
                        const next = new Set(prev);
                        if (next.has(t)) next.delete(t);
                        else next.add(t);
                        return next;
                      })
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    #{t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save(false)}>
              Simpan sebagai draf
            </Button>
            <Button onClick={() => save(true)}>
              <Sparkles className="h-4 w-4" />
              Simpan &amp; jadwalkan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

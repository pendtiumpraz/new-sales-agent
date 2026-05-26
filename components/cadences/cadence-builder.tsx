"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CHANNELS, channelMeta } from "@/lib/utils/channel-config";
import { cn } from "@/lib/utils";
import type { CadenceStep, CadenceStepChannel } from "@/lib/types";
import { toast } from "sonner";

const BUILDER_CHANNELS: CadenceStepChannel[] = [
  "whatsapp",
  "email",
  "sms",
  "linkedin",
  "call",
];

const VARIABLES = ["{{nama}}", "{{perusahaan}}", "{{produk}}"];

const AI_DRAFTS: Record<string, string[]> = {
  whatsapp: [
    "Halo {{nama}} 👋 Saya lihat {{perusahaan}} sedang berkembang. Banyak tim sales menghemat 6 jam/minggu dengan menyatukan WhatsApp & email. Boleh saya tunjukkan lewat demo 15 menit?",
    "Selamat pagi {{nama}}, satu tips singkat: tim yang follow-up dalam 5 menit menutup 3× lebih banyak deal. Kami otomatiskan itu untuk {{perusahaan}}. Tertarik lihat?",
  ],
  email: [
    "Subjek: Ide cepat untuk tim sales {{perusahaan}}\n\nHalo {{nama}},\n\nSaya perhatikan {{perusahaan}} mengandalkan banyak channel. Kami bantu menyatukannya jadi satu inbox sehingga tidak ada lead terlewat. Boleh saya kirim studi kasus singkat?\n\nSalam,\nTim Agentic Sales",
    "Subjek: {{nama}}, 3× lebih cepat closing untuk {{perusahaan}}\n\nHalo {{nama}}, terlampir cara tim sejenis memakai {{produk}} untuk mempercepat closing. Berkenan demo singkat minggu ini?",
  ],
  sms: [
    "{{nama}}, pengingat demo {{produk}} besok 14:00 WIB. Balas YA untuk konfirmasi. - Agentic Sales",
  ],
  linkedin: [
    "Halo {{nama}}, senang terhubung! Saya bantu tim sales di {{perusahaan}} mempercepat closing lewat cadence multi-channel. Boleh saya bagikan 1 ide singkat?",
  ],
  call: [
    "Telepon {{nama}}: konfirmasi kebutuhan utama {{perusahaan}}, pastikan anggaran, dan jadwalkan demo. Catat keberatan untuk follow-up.",
  ],
};

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

let stepSeq = 100;
const newStep = (channel: CadenceStepChannel): CadenceStep => ({
  id: `step_${stepSeq++}`,
  channel,
  delayDays: 2,
  subject: channel === "email" ? "Penawaran untuk {{perusahaan}}" : undefined,
  content: AI_DRAFTS[channel]?.[0] ?? "",
});

export function CadenceBuilder() {
  const router = useRouter();
  const [name, setName] = useState("Cadence Baru");
  const [steps, setSteps] = useState<CadenceStep[]>([
    {
      id: "step_1",
      channel: "whatsapp",
      delayDays: 0,
      content: AI_DRAFTS.whatsapp[0],
    },
    {
      id: "step_2",
      channel: "email",
      delayDays: 2,
      subject: "Penawaran untuk {{perusahaan}}",
      content: AI_DRAFTS.email[0],
    },
    { id: "step_3", channel: "call", delayDays: 3, content: AI_DRAFTS.call[0] },
  ]);
  const [selectedId, setSelectedId] = useState("step_1");
  const [days, setDays] = useState<Set<string>>(
    new Set(["Sen", "Sel", "Rab", "Kam", "Jum"]),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const selected = steps.find((s) => s.id === selectedId) ?? null;

  function update(id: string, patch: Partial<CadenceStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addStep() {
    const s = newStep("whatsapp");
    setSteps((prev) => [...prev, s]);
    setSelectedId(s.id);
  }
  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(steps[0]?.id ?? "");
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const oldIndex = steps.findIndex((s) => s.id === active.id);
      const newIndex = steps.findIndex((s) => s.id === over.id);
      setSteps((prev) => arrayMove(prev, oldIndex, newIndex));
    }
  }

  return (
    <div>
      <PageHeader title="Cadence Builder" description="Rangkai langkah lintas channel.">
        <Button
          variant="outline"
          onClick={() => router.push("/cadences")}
        >
          Batal
        </Button>
        <Button
          onClick={() => {
            toast.success(`Cadence "${name}" disimpan & diaktifkan.`);
            router.push("/cadences");
          }}
        >
          <Sparkles className="h-4 w-4" />
          Simpan & Aktifkan
        </Button>
      </PageHeader>

      <div className="p-6">
        <div className="mb-4 max-w-md">
          <Label htmlFor="cad-name" className="mb-1.5 block">
            Nama cadence
          </Label>
          <Input
            id="cad-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <Tabs defaultValue="steps">
          <TabsList>
            <TabsTrigger value="steps">Langkah ({steps.length})</TabsTrigger>
            <TabsTrigger value="settings">Pengaturan</TabsTrigger>
          </TabsList>

          <TabsContent value="steps">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
              {/* Step list */}
              <div className="space-y-3">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={steps.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {steps.map((step, i) => (
                        <SortableStep
                          key={step.id}
                          step={step}
                          index={i}
                          active={step.id === selectedId}
                          onSelect={() => setSelectedId(step.id)}
                          onRemove={() => removeStep(step.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <Button variant="outline" className="w-full border-dashed" onClick={addStep}>
                  <Plus className="h-4 w-4" />
                  Tambah langkah
                </Button>
              </div>

              {/* Step editor */}
              <div>
                {selected ? (
                  <StepEditor
                    step={selected}
                    onChange={(patch) => update(selected.id, patch)}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-10 text-center text-sm text-muted-foreground">
                      Pilih langkah untuk mengeditnya.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="max-w-xl">
              <CardContent className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1.5 block">Jam mulai kirim</Label>
                    <Select defaultValue="08:00">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["07:00", "08:00", "09:00", "10:00"].map((h) => (
                          <SelectItem key={h} value={h}>
                            {h} WIB
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block">Jam berhenti kirim</Label>
                    <Select defaultValue="17:00">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["15:00", "16:00", "17:00", "18:00"].map((h) => (
                          <SelectItem key={h} value={h}>
                            {h} WIB
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Hari pengiriman</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const on = days.has(d);
                      return (
                        <button
                          key={d}
                          onClick={() =>
                            setDays((prev) => {
                              const next = new Set(prev);
                              if (next.has(d)) next.delete(d);
                              else next.add(d);
                              return next;
                            })
                          }
                          className={cn(
                            "h-9 w-12 rounded-md border text-sm font-medium transition-colors",
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label htmlFor="max-send" className="mb-1.5 block">
                    Maksimal kirim per hari
                  </Label>
                  <Input
                    id="max-send"
                    type="number"
                    defaultValue={50}
                    className="max-w-[120px]"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Lewati hari libur nasional</p>
                    <p className="text-xs text-muted-foreground">
                      Tunda pengiriman saat tanggal merah Indonesia.
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SortableStep({
  step,
  index,
  active,
  onSelect,
  onRemove,
}: {
  step: CadenceStep;
  index: number;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });
  const meta = channelMeta(step.channel);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-3 transition-shadow",
        active && "border-primary ring-1 ring-primary",
        isDragging && "shadow-lg",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ChannelDot channel={step.channel} size={8} />
            {meta.label}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {step.delayDays === 0
              ? "Langsung"
              : `${step.delayDays} hari setelah langkah sebelumnya`}
          </p>
        </div>
      </button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function StepEditor({
  step,
  onChange,
}: {
  step: CadenceStep;
  onChange: (patch: Partial<CadenceStep>) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">Channel</Label>
            <Select
              value={step.channel}
              onValueChange={(v) =>
                onChange({
                  channel: v as CadenceStepChannel,
                  subject:
                    v === "email" ? step.subject ?? "Penawaran untuk {{perusahaan}}" : undefined,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILDER_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CHANNELS[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Tunda (hari)</Label>
            <Input
              type="number"
              min={0}
              value={step.delayDays}
              onChange={(e) => onChange({ delayDays: Number(e.target.value) })}
            />
          </div>
        </div>

        {step.channel === "email" && (
          <div>
            <Label className="mb-1.5 block">Subjek</Label>
            <Input
              value={step.subject ?? ""}
              onChange={(e) => onChange({ subject: e.target.value })}
            />
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Isi pesan</Label>
            <AiAssistDialog
              channel={step.channel}
              onApply={(content) => onChange({ content })}
            />
          </div>
          <Textarea
            value={step.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="min-h-[180px]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Sisipkan variabel:</span>
            {VARIABLES.map((v) => (
              <button
                key={v}
                onClick={() => onChange({ content: `${step.content} ${v}` })}
                className="rounded border bg-secondary px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:border-primary"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AiAssistDialog({
  channel,
  onApply,
}: {
  channel: CadenceStepChannel;
  onApply: (content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const drafts = AI_DRAFTS[channel] ?? AI_DRAFTS.whatsapp;
  const draft = drafts[idx % drafts.length];

  function regenerate() {
    setGenerating(true);
    setTimeout(() => {
      setIdx((i) => i + 1);
      setGenerating(false);
    }, 600);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Wand2 className="h-3.5 w-3.5 text-primary" />
        Bantuan AI
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Draf otomatis — {channelMeta(channel).label}
          </DialogTitle>
          <DialogDescription>
            Draf disesuaikan dengan channel dan praktik terbaik sales Indonesia.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[140px] whitespace-pre-line rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
          {generating ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              Menyusun draf...
            </span>
          ) : (
            draft
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={regenerate} disabled={generating}>
            <Sparkles className="h-4 w-4" />
            Buat ulang
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              setOpen(false);
              toast.success("Draf AI diterapkan ke langkah.");
            }}
          >
            Gunakan draf ini
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

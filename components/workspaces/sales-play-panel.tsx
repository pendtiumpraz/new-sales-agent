"use client";

// Sales Play editor — the per-workspace config that drives the conversation
// orchestrator (priceGate bridge, value ladder, worth-of-cost anchors, adab,
// handoff). Collapsible to keep the hub tidy. Lists use one-per-line textareas.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SalesPlay } from "@/lib/types/sales-play";

const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function SalesPlayPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<SalesPlay | null>(null);

  const q = useQuery({
    queryKey: ["sales-play", workspaceId],
    queryFn: async () => {
      const r = await fetch(`/api/workspaces/${workspaceId}/sales-play`);
      if (!r.ok) throw new Error("gagal");
      return (await r.json()).plan as SalesPlay;
    },
  });
  useEffect(() => {
    if (q.data) setPlan(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/workspaces/${workspaceId}/sales-play`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("Sales Play disimpan");
      qc.invalidateQueries({ queryKey: ["sales-play", workspaceId] });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  const patch = (p: Partial<SalesPlay>) => setPlan((c) => (c ? { ...c, ...p } : c));
  const patchAdab = (p: Partial<SalesPlay["adab"]>) =>
    setPlan((c) => (c ? { ...c, adab: { ...c.adab, ...p } } : c));
  const patchGate = (p: Partial<SalesPlay["priceGate"]>) =>
    setPlan((c) => (c ? { ...c, priceGate: { ...c.priceGate, ...p } } : c));
  const patchWoc = (p: Partial<SalesPlay["worthOfCost"]>) =>
    setPlan((c) => (c ? { ...c, worthOfCost: { ...c.worthOfCost, ...p } } : c));
  const patchHandoff = (p: Partial<SalesPlay["handoff"]>) =>
    setPlan((c) => (c ? { ...c, handoff: { ...c.handoff, ...p } } : c));

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4 text-primary" /> Sales Play
            <span className="text-xs font-normal text-muted-foreground">— alur &amp; adab obrolan</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
        </button>

        {open &&
          (q.isLoading || !plan ? (
            <div className="px-4 pb-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 border-t p-4">
              <div>
                <Label className="text-xs">Tahap (tetap)</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {plan.stages.map((s) => (
                    <span key={s.key} className="rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>

              <Field label="Jawaban saat ditanya harga di awal (bridge)">
                <Textarea value={plan.priceGate.earlyPriceBridge} onChange={(e) => patchGate({ earlyPriceBridge: e.target.value })} rows={2} />
              </Field>

              <Field label="Value ladder — 1 poin per baris (disampaikan sebelum harga)">
                <Textarea value={toLines(plan.valueLadder)} onChange={(e) => patch({ valueLadder: fromLines(e.target.value) })} rows={3} placeholder={"hemat waktu follow-up\nlead nggak ada yang ke-skip"} />
              </Field>

              <Field label="Anchor worth-of-cost — 1 per baris (biaya masalah)">
                <Textarea value={toLines(plan.worthOfCost.costAnchors)} onChange={(e) => patchWoc({ costAnchors: fromLines(e.target.value) })} rows={2} placeholder={"1 closing hilang = Rp 2jt"} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Maks kalimat / bubble">
                  <Input type="number" min={1} max={4} value={plan.adab.maxSentencesPerBubble} onChange={(e) => patchAdab({ maxSentencesPerBubble: Number(e.target.value) || 2 })} />
                </Field>
                <Field label="Emoji">
                  <Select value={plan.adab.emoji} onValueChange={(v) => patchAdab({ emoji: v as SalesPlay["adab"]["emoji"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="sparse">Secukupnya</SelectItem>
                      <SelectItem value="warm">Hangat</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <label className="flex items-center justify-between text-sm">
                <span>Filler &quot;hmm&quot; diizinkan</span>
                <Switch checked={plan.adab.allowFiller} onCheckedChange={(v) => patchAdab({ allowFiller: v })} />
              </label>

              <Field label="Topik dilarang — 1 per baris">
                <Textarea value={toLines(plan.adab.forbiddenTopics)} onChange={(e) => patchAdab({ forbiddenTopics: fromLines(e.target.value) })} rows={2} />
              </Field>

              <Field label="Handoff: kata kunci eskalasi — 1 per baris">
                <Textarea value={toLines(plan.handoff.keywords)} onChange={(e) => patchHandoff({ keywords: fromLines(e.target.value) })} rows={2} />
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={plan.handoff.onNegotiation} onCheckedChange={(v) => patchHandoff({ onNegotiation: v })} /> Nego → handoff
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={plan.handoff.onComplaint} onCheckedChange={(v) => patchHandoff({ onComplaint: v })} /> Komplain → handoff
                </label>
              </div>

              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan Sales Play"}
              </Button>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

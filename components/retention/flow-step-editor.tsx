"use client";

import { Clock, GripVertical, Plus, Trash2 } from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useRetentionStore } from "@/lib/stores/retention-store";
import type {
  RetentionStep,
  RetentionStepChannel,
} from "@/lib/types/retention";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL: Record<RetentionStepChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
};

const CHANNELS: RetentionStepChannel[] = ["whatsapp", "email", "sms"];

const VARIABLES = ["{{nama}}", "{{perusahaan}}", "{{produk}}"];

let stepSeq = 1000;
function makeStep(channel: RetentionStepChannel = "whatsapp"): RetentionStep {
  return {
    id: `rs_new_${stepSeq++}`,
    channel,
    delayDays: 2,
    subject: channel === "email" ? "Pesan untuk {{perusahaan}}" : undefined,
    content: "",
  };
}

/**
 * Two-pane step editor — left = step list, right = editor for the selected
 * step. Modeled after components/cadences/cadence-builder.tsx but operating
 * on the retention store.
 */
export function FlowStepEditor({
  flowId,
  selectedId,
  onSelect,
}: {
  flowId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const flow = useRetentionStore((s) => s.flows.find((f) => f.id === flowId));
  const updateStep = useRetentionStore((s) => s.updateStep);
  const addStep = useRetentionStore((s) => s.addStep);
  const removeStep = useRetentionStore((s) => s.removeStep);

  if (!flow) return null;
  const selected = flow.steps.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
      <div className="space-y-3">
        <div className="space-y-2">
          {flow.steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              active={step.id === selectedId}
              onSelect={() => onSelect(step.id)}
              onRemove={() => {
                removeStep(flowId, step.id);
                if (selectedId === step.id) {
                  const remaining = flow.steps.filter((s) => s.id !== step.id);
                  onSelect(remaining[0]?.id ?? "");
                }
              }}
            />
          ))}
        </div>
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={() => {
            const s = makeStep();
            addStep(flowId, s);
            onSelect(s.id);
          }}
        >
          <Plus className="h-4 w-4" />
          Tambah langkah
        </Button>
      </div>

      <div>
        {selected ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block">Channel</Label>
                  <Select
                    value={selected.channel}
                    onValueChange={(v) =>
                      updateStep(flowId, selected.id, {
                        channel: v as RetentionStepChannel,
                        subject:
                          v === "email"
                            ? selected.subject ?? "Pesan untuk {{perusahaan}}"
                            : undefined,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CHANNEL_LABEL[c]}
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
                    value={selected.delayDays}
                    onChange={(e) =>
                      updateStep(flowId, selected.id, {
                        delayDays: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              {selected.channel === "email" && (
                <div>
                  <Label className="mb-1.5 block">Subjek</Label>
                  <Input
                    value={selected.subject ?? ""}
                    onChange={(e) =>
                      updateStep(flowId, selected.id, {
                        subject: e.target.value,
                      })
                    }
                  />
                </div>
              )}

              <div>
                <Label className="mb-1.5 block">Isi pesan</Label>
                <Textarea
                  value={selected.content}
                  onChange={(e) =>
                    updateStep(flowId, selected.id, { content: e.target.value })
                  }
                  className="min-h-[180px]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    Sisipkan variabel:
                  </span>
                  {VARIABLES.map((v) => (
                    <button
                      key={v}
                      onClick={() =>
                        updateStep(flowId, selected.id, {
                          content: `${selected.content} ${v}`,
                        })
                      }
                      className="rounded border bg-accent px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:border-primary"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Pilih langkah di sebelah kiri untuk mengeditnya.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  active,
  onSelect,
  onRemove,
}: {
  step: RetentionStep;
  index: number;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-3 transition-shadow",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <span className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </span>
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ChannelDot channel={step.channel} size={8} />
            {CHANNEL_LABEL[step.channel]}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {step.delayDays === 0
              ? "Langsung"
              : `${step.delayDays} hari setelah langkah sebelumnya`}
          </p>
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

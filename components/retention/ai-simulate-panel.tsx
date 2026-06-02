"use client";

import { useMemo, useState } from "react";
import { BookOpen, RefreshCw, Sparkles } from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sampleAiMessage } from "@/lib/api-mock/retention";
import type { RetentionFlow } from "@/lib/types/retention";

const CHANNEL_LABEL = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
} as const;

/**
 * "Simulasi AI" — renders a sample message with variables filled in from a
 * mock KB context. Static demo; no real LLM call.
 */
export function AiSimulatePanel({
  flow,
  stepId,
}: {
  flow: RetentionFlow;
  stepId: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [tick, setTick] = useState(0);
  const step = useMemo(
    () => flow.steps.find((s) => s.id === stepId) ?? flow.steps[0],
    [flow, stepId],
  );

  const rendered = useMemo(() => {
    // tick exists to let "regenerate" subtly vary the sample for demo polish.
    void tick;
    return step ? sampleAiMessage(flow, step) : "";
  }, [flow, step, tick]);

  function regenerate() {
    setGenerating(true);
    setTimeout(() => {
      setTick((n) => n + 1);
      setGenerating(false);
    }, 600);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Simulasi pesan AI
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Disusun AI berbasis Basis Pengetahuan klien.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerate}
          disabled={generating}
        >
          <RefreshCw
            className={
              generating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
            }
          />
          Buat ulang
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* KB context chips */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="muted" className="gap-1">
            <BookOpen className="h-3 w-3" />
            KB: {flow.kbFlowId ?? "n/a"}
          </Badge>
          <Badge variant="secondary">Segmen: {flow.segmentTarget ?? "Semua"}</Badge>
          {step && (
            <Badge variant="outline" className="gap-1.5">
              <ChannelDot channel={step.channel} size={6} />
              {CHANNEL_LABEL[step.channel]}
            </Badge>
          )}
          {step && (
            <Badge variant="outline" className="tnum">
              Hari +{step.delayDays}
            </Badge>
          )}
        </div>

        {/* Sample customer header */}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <p className="font-medium text-foreground">Konteks contoh</p>
          <ul className="mt-1 grid gap-0.5 text-muted-foreground sm:grid-cols-2">
            <li>
              <span className="text-foreground">Pelanggan:</span> Ibu Maharani
            </li>
            <li>
              <span className="text-foreground">Perusahaan:</span> PT Sinar Mas
            </li>
            <li>
              <span className="text-foreground">Produk:</span> Paket Starter
            </li>
            <li>
              <span className="text-foreground">Pembelian terakhir:</span> 32
              hari lalu
            </li>
          </ul>
        </div>

        {/* Rendered message */}
        <div className="min-h-[160px] whitespace-pre-line rounded-lg border bg-card p-4 text-sm leading-relaxed">
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
              Menyusun pesan dari Basis Pengetahuan...
            </span>
          ) : (
            rendered || "Tidak ada langkah untuk disimulasikan."
          )}
        </div>
      </CardContent>
    </Card>
  );
}

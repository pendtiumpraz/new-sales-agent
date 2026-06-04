"use client";

import { useMemo } from "react";
import {
  AlarmClock,
  AlertTriangle,
  Bot,
  HandHeart,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  SentimentBadge,
  SentimentSparkline,
  toneFromScore,
} from "@/components/inbox/sentiment-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSentiment } from "@/lib/api-mock/handoff";
import { useHandoffStore } from "@/lib/stores/handoff-store";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { HandoffTrigger } from "@/lib/types/handoff";

const TRIGGER_META: Record<
  HandoffTrigger,
  { label: string; icon: typeof ShieldAlert }
> = {
  sentiment: { label: "Sentimen turun", icon: ShieldAlert },
  timeout: { label: "Tanpa respons", icon: AlarmClock },
  complexity: { label: "Topik kompleks", icon: AlertTriangle },
};

const CURRENT_AGENT = "Anda";

/**
 * Compact handoff summary, sized for the workspace right rail. Reuses the same
 * `handoff-store` actions as the full `HandoffPanel` so state stays in sync.
 */
export function WorkspaceHandoffCard({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const config = useHandoffStore((s) => s.config);
  const state = useHandoffStore((s) =>
    conversationId ? s.states[conversationId] : undefined,
  );
  const getActiveTriggers = useHandoffStore((s) => s.getActiveTriggers);
  const takeOver = useHandoffStore((s) => s.takeOver);
  const releaseHandoff = useHandoffStore((s) => s.releaseHandoff);

  const sentiment = useMemo(
    () => (conversationId ? getSentiment(conversationId) : null),
    [conversationId],
  );

  // Re-derived on every render — cheap, and depends on store state we already
  // subscribe to via `state` and `config` above.
  void state;
  void config;
  const activeTriggers: HandoffTrigger[] = conversationId
    ? getActiveTriggers(conversationId)
    : [];

  if (!conversationId || !sentiment) {
    return (
      <Card className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Handoff & sentimen
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Pilih percakapan untuk melihat pemicu handoff dan sentimen.
        </p>
      </Card>
    );
  }

  const handedOff = state?.status === "handed-off";
  const tone = toneFromScore(sentiment.score);

  function onTakeOver() {
    if (!conversationId) return;
    takeOver(conversationId, CURRENT_AGENT);
    toast.success(
      "Percakapan diambil alih. Konteks lengkap diserahkan kepada Anda.",
    );
  }

  function onRelease() {
    if (!conversationId) return;
    releaseHandoff(conversationId);
    toast.success("Percakapan dikembalikan ke AI.");
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Handoff & sentimen
        </p>
        <SentimentBadge
          score={sentiment.score}
          trend={sentiment.trend}
          size="compact"
        />
      </div>

      <div className="space-y-2 px-4 pb-3 pt-3">
        <SentimentSparkline history={sentiment.history} />
        <p className="text-[10px] text-muted-foreground">
          {tone === "negative"
            ? "Tren menurun — perlu perhatian agen."
            : tone === "positive"
              ? "Tren positif — AI menangani dengan baik."
              : "Tren stabil — dipantau berkala."}
        </p>
      </div>

      <Separator />

      <div className="space-y-2 p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Pemicu aktif
        </p>
        {activeTriggers.length === 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700">
            Tidak ada pemicu aktif.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {activeTriggers.map((t) => {
              const meta = TRIGGER_META[t];
              const Icon = meta.icon;
              return (
                <li
                  key={t}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                    "border-rose-200 bg-rose-50/70 text-rose-700",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {meta.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Separator />

      <div className="space-y-2 p-4">
        {handedOff ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-tertiary/30 bg-tertiary/10 px-3 py-2">
              <UserCheck className="h-4 w-4 text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">
                  Diambil alih oleh {state?.takenOverBy ?? CURRENT_AGENT}
                </p>
                {state?.takenOverAt && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatRelativeID(state.takenOverAt)}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onRelease}
            >
              <Bot className="h-3.5 w-3.5" />
              Kembalikan ke AI
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={onTakeOver}
            variant={activeTriggers.length > 0 ? "default" : "outline"}
          >
            <HandHeart className="h-3.5 w-3.5" />
            Ambil alih
          </Button>
        )}
      </div>
    </Card>
  );
}

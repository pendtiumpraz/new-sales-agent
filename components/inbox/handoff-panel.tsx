"use client";

import Link from "next/link";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  Bot,
  Clock,
  HandHeart,
  ListChecks,
  Settings2,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  SentimentBadge,
  SentimentSparkline,
  toneFromScore,
} from "@/components/inbox/sentiment-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { getSentiment } from "@/lib/api-mock/handoff";
import { useHandoffStore } from "@/lib/stores/handoff-store";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import type { HandoffTrigger } from "@/lib/types/handoff";

const CURRENT_AGENT = "Anda";

const TRIGGER_META: Record<HandoffTrigger, { label: string; desc: string; icon: typeof AlertTriangle }> = {
  sentiment: {
    label: "Sentimen turun",
    desc: "Skor di bawah ambang batas",
    icon: ShieldAlert,
  },
  timeout: {
    label: "Tanpa respons",
    desc: "Melebihi batas waktu konfigurasi",
    icon: AlarmClock,
  },
  complexity: {
    label: "Topik kompleks",
    desc: "Cocok dengan daftar eskalasi",
    icon: AlertTriangle,
  },
};

export function HandoffPanel({ conversationId }: { conversationId: string }) {
  const sentiment = getSentiment(conversationId);
  const config = useHandoffStore((s) => s.config);
  const state = useHandoffStore((s) => s.states[conversationId]);
  const activeTriggers = useHandoffStore((s) =>
    s.getActiveTriggers(conversationId),
  );
  const takeOver = useHandoffStore((s) => s.takeOver);
  const releaseHandoff = useHandoffStore((s) => s.releaseHandoff);
  const toggleAutoReply = useHandoffStore((s) => s.toggleAutoReplyForConversation);

  const handedOff = state?.status === "handed-off";
  const tone = toneFromScore(sentiment.score);
  const minutesSinceAi = Math.max(
    0,
    Math.round(
      (Date.now() - new Date(sentiment.lastAiResponseAt).getTime()) / 60_000,
    ),
  );

  function onTakeOver() {
    takeOver(conversationId, CURRENT_AGENT);
    toast.success(
      "Percakapan diambil alih. Konteks lengkap diserahkan kepada Anda.",
    );
  }

  function onRelease() {
    releaseHandoff(conversationId);
    toast.success("Percakapan dikembalikan ke AI.");
  }

  return (
    <aside className="scrollbar-thin hidden w-80 shrink-0 overflow-y-auto border-l bg-card xl:block">
      <div className="space-y-1 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Handoff & sentimen</h3>
          <Button variant="ghost" size="icon" asChild className="h-7 w-7">
            <Link href="/settings/handoff" title="Pengaturan handoff">
              <Settings2 className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pemicu otomatis untuk mengalihkan ke manusia.
        </p>
      </div>

      <Separator />

      {/* Sentiment block */}
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sentimen saat ini
          </p>
          <SentimentBadge score={sentiment.score} trend={sentiment.trend} />
        </div>
        <SentimentSparkline history={sentiment.history} />
        <p className="text-[11px] text-muted-foreground">
          {tone === "negative"
            ? "Tren menurun — perlu perhatian agen."
            : tone === "positive"
              ? "Tren positif — AI menangani dengan baik."
              : "Tren stabil — dipantau berkala."}
        </p>
      </div>

      <Separator />

      {/* Timing */}
      <div className="space-y-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Waktu balasan AI terakhir
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium tnum">{minutesSinceAi} menit lalu</span>
          <span className="text-xs text-muted-foreground">
            (batas {config.timeoutMinutes} mnt)
          </span>
        </div>
      </div>

      <Separator />

      {/* Active triggers */}
      <div className="space-y-3 p-5">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Pemicu aktif
        </p>
        {activeTriggers.length === 0 ? (
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-xs text-success">
            Tidak ada pemicu aktif — AI lanjut menangani.
          </div>
        ) : (
          <ul className="space-y-2">
            {activeTriggers.map((t) => {
              const meta = TRIGGER_META[t];
              const Icon = meta.icon;
              return (
                <li
                  key={t}
                  className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-danger">
                      {meta.label}
                    </p>
                    <p className="text-[11px] text-danger/80">{meta.desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {sentiment.topics.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Topik terdeteksi:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sentiment.topics.map((t) => (
                <Badge key={t} variant="muted" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Take over */}
      <div className="space-y-3 p-5">
        {handedOff ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-tertiary/30 bg-tertiary/10 px-3 py-2.5">
              <UserCheck className="h-4 w-4 text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  Diambil alih oleh {state?.takenOverBy ?? CURRENT_AGENT}
                </p>
                {state?.takenOverAt && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatRelativeID(state.takenOverAt)}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={onRelease}>
              <Bot className="h-4 w-4" />
              Kembalikan ke AI
            </Button>
          </>
        ) : (
          <Button
            className="w-full"
            onClick={onTakeOver}
            variant={activeTriggers.length > 0 ? "default" : "outline"}
          >
            <HandHeart className="h-4 w-4" />
            Ambil alih
            <ArrowRight className="ml-auto h-4 w-4" />
          </Button>
        )}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5 text-tertiary" />
              Auto-reply AI aktif
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {config.autoReplyEnabled
                ? "AI menyusun draf jawaban otomatis."
                : "Anda menulis manual setiap balasan."}
            </p>
          </div>
          <Switch
            checked={config.autoReplyEnabled}
            onCheckedChange={() => toggleAutoReply(conversationId)}
            disabled={handedOff}
          />
        </div>
      </div>

      <Separator />

      {/* Product mentions — feeds market mapping */}
      {sentiment.productMentions.length > 0 && (
        <div className="space-y-2 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Produk disebut
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sentiment.productMentions.map((p) => (
              <Badge key={p} variant="secondary" className="text-[10px]">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

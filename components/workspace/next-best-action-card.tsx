"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Heart,
  MessageCircle,
  Send,
  ShieldAlert,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IDRAmount } from "@/components/shared/idr-amount";
import { useHandoffStore } from "@/lib/stores/handoff-store";
import { useKbStore } from "@/lib/stores/kb-store";
import { usePipelineStore } from "@/lib/stores/pipeline-store";
import { getSentiment } from "@/lib/api-mock/handoff";
import { channelMeta } from "@/lib/utils/channel-config";
import { cn } from "@/lib/utils";
import type { AiTemp, Contact, Deal } from "@/lib/types";

type Confidence = AiTemp;

interface Action {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  confidence: Confidence;
  cta: string;
  onClick: () => void;
}

const CONFIDENCE_DOT: Record<Confidence, string> = {
  panas: "bg-primary",
  hangat: "bg-amber-500",
  dingin: "bg-sky-500",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  panas: "Panas",
  hangat: "Hangat",
  dingin: "Dingin",
};

interface NextBestActionCardProps {
  contact: Contact;
  deal: Deal | null;
  conversationId: string | null;
}

/**
 * The hero card of the unified workspace. Synthesizes recommendations from:
 *  - Sentiment (Wave 2C, via handoff mock + store)
 *  - Enrichment analysis (Wave 2A, via pipeline-store)
 *  - KB upsell map + retention flows (Wave 2B, via kb-store)
 *
 * Pure mock logic — derives a 1–2 action set based on the heuristics in the
 * Wave 3 spec.
 */
export function NextBestActionCard({
  contact,
  deal,
  conversationId,
}: NextBestActionCardProps) {
  const analyses = usePipelineStore((s) => s.analyses);
  const products = usePipelineStore((s) => s.products);
  const kb = useKbStore((s) => s.kb);
  const handoffStates = useHandoffStore((s) => s.states);
  const takeOver = useHandoffStore((s) => s.takeOver);

  const analysis = useMemo(
    () => (deal ? analyses.find((a) => a.dealId === deal.id) ?? null : null),
    [analyses, deal],
  );

  const sentiment = useMemo(
    () => (conversationId ? getSentiment(conversationId) : null),
    [conversationId],
  );

  const handedOff = conversationId
    ? handoffStates[conversationId]?.status === "handed-off"
    : false;

  const channelLabel = channelMeta(contact.channelPreference).label;

  // Resolve the top matched product → look up its KB pricing tier (Wave 2B).
  const topProductId = analysis?.matchedProducts[0] ?? null;
  const topProduct = topProductId
    ? products.find((p) => p.id === topProductId) ?? null
    : null;

  const kbProductMatch = useMemo(() => {
    if (!topProduct) return null;
    // Loose name-match — both Wave 2A and Wave 2B seed "Paket Starter / Growth /
    // Enterprise" so this will line up in the demo data.
    return kb.products.find(
      (p) => p.name.toLowerCase() === topProduct.name.toLowerCase(),
    );
  }, [kb.products, topProduct]);

  const kbPriceTier = useMemo(() => {
    if (!kbProductMatch) return null;
    // Cheapest tier — best opening offer.
    return [...kb.pricing]
      .filter((t) => t.productId === kbProductMatch.id)
      .sort((a, b) => a.priceIDR - b.priceIDR)[0];
  }, [kb.pricing, kbProductMatch]);

  // Retention flow scoped by product or open to all when stage is closed.
  const retentionFlow = useMemo(() => {
    if (!kbProductMatch) {
      return kb.retentionFlows.find((f) => f.active) ?? null;
    }
    return (
      kb.retentionFlows.find(
        (f) => f.active && f.productIds.includes(kbProductMatch.id),
      ) ??
      kb.retentionFlows.find((f) => f.active) ??
      null
    );
  }, [kb.retentionFlows, kbProductMatch]);

  // ── Compose actions ────────────────────────────────────────────────────
  const actions: Action[] = useMemo(() => {
    const list: Action[] = [];
    const negative = sentiment ? sentiment.score < 0 : false;
    const positive = sentiment ? sentiment.score > 30 : false;
    const stage = deal?.stage;
    const advancedStage =
      stage === "kualifikasi" ||
      stage === "penawaran" ||
      stage === "negosiasi" ||
      stage === "tutup";

    // 1) Negative sentiment → escalate.
    if (negative) {
      list.push({
        id: "escalate",
        label: "Eskalasi ke human / cek keluhan",
        description:
          "Sentimen percakapan turun. Ambil alih dari AI untuk mencegah churn.",
        icon: ShieldAlert,
        confidence: "panas",
        cta: handedOff ? "Sudah diambil alih" : "Ambil alih sekarang",
        onClick: () => {
          if (handedOff) return;
          if (conversationId) takeOver(conversationId, "Anda");
          toast.success(
            "Eskalasi diterapkan — Anda kini menangani percakapan ini.",
          );
        },
      });
    }

    // 2) Positive sentiment + advanced stage → offer top product.
    if (positive && advancedStage && topProduct) {
      const priceCopy = kbPriceTier
        ? ` mulai Rp ${(kbPriceTier.priceIDR / 1000).toLocaleString("id-ID")} rb${kbPriceTier.billing === "bulanan" ? "/bulan" : kbPriceTier.billing === "tahunan" ? "/tahun" : ""}`
        : "";
      list.push({
        id: "offer",
        label: `Tawarkan ${topProduct.name}${priceCopy}`,
        description:
          analysis?.companySize && topProduct.targetSegment
            ? `Fit untuk ${topProduct.targetSegment} (${analysis.companySize} karyawan).`
            : topProduct.description,
        icon: Send,
        confidence: "panas",
        cta: "Kirim WA",
        onClick: () => {
          toast.success(
            `Pesan penawaran ${topProduct.name} disiapkan via ${channelLabel}.`,
          );
        },
      });
    }

    // 3) Closed stage → enroll in retention flow.
    if (stage === "tutup" && retentionFlow) {
      list.push({
        id: "retention",
        label: `Daftarkan ke alur retensi "${retentionFlow.name}"`,
        description: retentionFlow.action,
        icon: Heart,
        confidence: "hangat",
        cta: "Daftarkan",
        onClick: () => {
          toast.success(
            `${contact.name} didaftarkan ke alur "${retentionFlow.name}".`,
          );
        },
      });
    }

    // 4) Stale stage → follow-up.
    if (analysis && analysis.daysInStage > 7 && stage && stage !== "tutup") {
      list.push({
        id: "followup",
        label: `Follow-up — tetap di tahap ${analysis.daysInStage} hari`,
        description: "Jadwalkan kontak ulang sebelum prospek mendingin.",
        icon: CalendarPlus,
        confidence: analysis.daysInStage > 14 ? "panas" : "hangat",
        cta: "Tambah ke cadence",
        onClick: () => {
          toast.success(
            `${contact.name} ditambahkan ke cadence "Demo to Close".`,
          );
        },
      });
    }

    // 5) Fallback when nothing fired — provide one safe default.
    if (list.length === 0) {
      list.push({
        id: "engage",
        label: `Mulai percakapan via ${channelLabel}`,
        description:
          topProduct?.description ?? "Buka peluang dengan pertanyaan kualifikasi singkat.",
        icon: MessageCircle,
        confidence: "hangat",
        cta: "Kirim sapaan",
        onClick: () => {
          toast.success(
            `Pesan pembuka untuk ${contact.name} disiapkan via ${channelLabel}.`,
          );
        },
      });
    }

    // Always note the recommended channel as a secondary action.
    if (!list.some((a) => a.id === "note")) {
      list.push({
        id: "note",
        label: `Catat insight ke CRM`,
        description: "Simpan ringkasan AI sebagai aktivitas pada kontak.",
        icon: StickyNote,
        confidence: "dingin",
        cta: "Catat",
        onClick: () => {
          toast.success("Catatan AI tersimpan di linimasa kontak.");
        },
      });
    }

    return list.slice(0, 3);
  }, [
    analysis,
    channelLabel,
    contact.name,
    conversationId,
    deal?.stage,
    handedOff,
    kbPriceTier,
    retentionFlow,
    sentiment,
    takeOver,
    topProduct,
  ]);

  const headline = useMemo(() => {
    if (!sentiment) return "AI siap merekomendasikan langkah berikutnya";
    if (sentiment.score < 0) {
      return "Prioritas: turunkan ketegangan dulu sebelum jualan";
    }
    if (sentiment.score > 30 && topProduct) {
      return `Momentum positif — saatnya tawarkan ${topProduct.name}`;
    }
    if (deal?.stage === "tutup") {
      return "Deal tutup — aktifkan retensi & upsell";
    }
    if (analysis?.daysInStage && analysis.daysInStage > 7) {
      return `Sudah ${analysis.daysInStage} hari di tahap ini — saatnya bergerak`;
    }
    return "Saran berikutnya untuk maju ke tahap berikut";
  }, [analysis?.daysInStage, deal?.stage, sentiment, topProduct]);

  return (
    <Card className="relative overflow-hidden border-tertiary/40 bg-gradient-to-br from-primary/8 via-tertiary/6 to-card shadow-sm">
      {/* Decorative coral glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-tertiary text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
              Saran berikutnya
            </p>
            <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">
              {headline}
            </h3>
          </div>
        </div>

        {/* Actions list */}
        <ul className="space-y-2">
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} />
          ))}
        </ul>

        {/* Context strip — channel, price, retention */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/70 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3 text-tertiary" />
            Channel rekomendasi:{" "}
            <strong className="font-semibold text-foreground">
              {channelLabel}
            </strong>
          </span>
          {topProduct && kbPriceTier && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1">
                Harga:{" "}
                <IDRAmount
                  value={kbPriceTier.priceIDR}
                  className="font-semibold text-foreground"
                />
              </span>
            </>
          )}
          {retentionFlow && deal?.stage === "tutup" && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1">
                Alur:{" "}
                <strong className="font-semibold text-foreground">
                  {retentionFlow.name}
                </strong>
              </span>
            </>
          )}
        </div>

        {/* Footer attribution */}
        <p className="flex items-center gap-1.5 text-[10px] leading-snug text-muted-foreground">
          <BookOpen className="h-3 w-3 shrink-0" />
          Disusun AI berbasis percakapan, enrichment, dan Basis Pengetahuan.
        </p>
      </div>
    </Card>
  );
}

function ActionRow({ action }: { action: Action }) {
  const Icon = action.icon;
  return (
    <li className="group flex items-start gap-2.5 rounded-lg border bg-card/80 p-2.5 shadow-sm transition-colors hover:border-primary/40">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{action.label}</p>
          <span
            className="ml-1 mt-1 flex shrink-0 items-center gap-1"
            title={`Keyakinan AI: ${CONFIDENCE_LABEL[action.confidence]}`}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                CONFIDENCE_DOT[action.confidence],
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {CONFIDENCE_LABEL[action.confidence]}
            </span>
          </span>
        </div>
        {action.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 text-xs"
          onClick={action.onClick}
        >
          {action.cta}
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

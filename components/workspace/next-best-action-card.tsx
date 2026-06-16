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
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IDRAmount } from "@/components/shared/idr-amount";
import { useHandoffStore } from "@/lib/stores/handoff-store";
import { useKbStore } from "@/lib/stores/kb-store";
import { useRetentionStore } from "@/lib/stores/retention-store";
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

// Pill tint + icon-swatch tint per confidence level — matches temp-badge so
// the action cards feel related to the AI score chips elsewhere.
const CONFIDENCE_PILL: Record<Confidence, string> = {
  panas: "border-primary/30 bg-primary/10 text-primary",
  hangat: "border-amber-300/60 bg-amber-100 text-amber-800",
  dingin: "border-sky-300/60 bg-sky-100 text-sky-700",
};

const CONFIDENCE_ICON_BG: Record<Confidence, string> = {
  panas: "bg-primary/15 text-primary",
  hangat: "bg-amber-500/15 text-amber-700",
  dingin: "bg-sky-500/15 text-sky-700",
};

const CONFIDENCE_BORDER: Record<Confidence, string> = {
  panas: "border-primary/25 hover:border-primary/55",
  hangat: "border-amber-300/40 hover:border-amber-400/70",
  dingin: "border-sky-300/40 hover:border-sky-400/70",
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
  const enrollCandidate = useRetentionStore((s) => s.enrollCandidate);
  const router = useRouter();

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
    // Reach out on the recommended channel: WhatsApp → wa.me, email → mailto,
    // else open the inbox thread. Real deep-links, not a fake toast (doc 45).
    const reachOut = (message: string) => {
      const ch = contact.channelPreference;
      if (ch === "whatsapp" && contact.phone) {
        window.open(`https://wa.me/${contact.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        toast.success(`Membuka WhatsApp untuk ${contact.name}.`);
        return;
      }
      if (ch === "email" && contact.email) {
        window.open(`mailto:${contact.email}?body=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        toast.success(`Membuka draf email untuk ${contact.name}.`);
        return;
      }
      router.push(conversationId ? `/inbox/${conversationId}` : "/inbox");
      toast.info(`Lanjutkan di inbox — pesan ${channelLabel} disiapkan.`);
    };
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
          reachOut(`Halo ${contact.name}, saya ingin menawarkan ${topProduct.name}${priceCopy}.`);
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
          enrollCandidate(contact.id);
          toast.success(`${contact.name} didaftarkan ke alur "${retentionFlow.name}".`);
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
          router.push("/cadences");
          toast.info(`Pilih cadence untuk mendaftarkan ${contact.name}.`);
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
          reachOut(`Halo ${contact.name}, boleh saya tanya beberapa hal singkat soal kebutuhan Anda?`);
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
          toast.info("Mode demo — pencatatan ke linimasa CRM belum tersambung backend.");
        },
      });
    }

    return list.slice(0, 3);
  }, [
    analysis,
    channelLabel,
    contact.id,
    contact.name,
    contact.phone,
    contact.email,
    contact.channelPreference,
    conversationId,
    deal?.stage,
    enrollCandidate,
    handedOff,
    kbPriceTier,
    retentionFlow,
    router,
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
    <Card className="relative overflow-hidden border-primary/35 bg-gradient-to-br from-primary/12 via-tertiary/8 to-card shadow-[0_4px_18px_-8px_rgba(251,94,59,0.35)]">
      {/* Decorative coral glow + secondary teal accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-tertiary/20 blur-3xl"
      />
      <div className="relative space-y-3 p-4">
        <div className="flex items-start gap-3">
          {/* Glowing coral sparkles badge */}
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-tertiary text-white shadow-[0_6px_18px_-6px_rgba(251,94,59,0.65)]">
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl bg-primary/50 blur-md"
            />
            <Sparkles className="relative h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgba(251,94,59,0.18)]" />
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
        <p className="flex items-center gap-1.5 text-[10px] italic leading-snug text-muted-foreground">
          <Sparkles className="h-3 w-3 shrink-0 text-tertiary" />
          <span>
            Disusun AI berbasis percakapan, enrichment, dan{" "}
            <span className="not-italic">
              <BookOpen className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" />
              Basis Pengetahuan
            </span>
            .
          </span>
        </p>
      </div>
    </Card>
  );
}

function ActionRow({ action }: { action: Action }) {
  const Icon = action.icon;
  return (
    <li
      className={cn(
        "group flex items-start gap-2.5 rounded-lg border bg-card/85 p-2.5 shadow-sm backdrop-blur-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md",
        CONFIDENCE_BORDER[action.confidence],
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
          CONFIDENCE_ICON_BG[action.confidence],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{action.label}</p>
          {/* Confidence chip — coral / amber / blue per panas/hangat/dingin */}
          <span
            className={cn(
              "ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              CONFIDENCE_PILL[action.confidence],
            )}
            title={`Keyakinan AI: ${CONFIDENCE_LABEL[action.confidence]}`}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                CONFIDENCE_DOT[action.confidence],
              )}
            />
            {CONFIDENCE_LABEL[action.confidence]}
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
          className={cn(
            "mt-2 h-7 text-xs transition-colors",
            action.confidence === "panas" &&
              "border-primary/40 text-primary hover:bg-primary/10 hover:text-primary",
            action.confidence === "hangat" &&
              "border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800",
            action.confidence === "dingin" &&
              "border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800",
          )}
          onClick={action.onClick}
        >
          {action.cta}
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

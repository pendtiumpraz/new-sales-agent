"use client";

import { useMemo, useState } from "react";
import {
  BrainCircuit,
  Database,
  FileText,
  Globe,
  MessageCircleQuestion,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useKbStore } from "@/lib/stores/kb-store";
import type { KbSegmentTier, KbSourceKind, KnowledgeBase } from "@/lib/types/kb";
import { composeKbReply } from "@/lib/utils/compose-kb-reply";

// Match the icons used in the Sources editor (coral / teal / amber tints).
const SOURCE_KIND_ICON: Record<
  KbSourceKind,
  { Icon: typeof FileText; color: string }
> = {
  pdf: { Icon: FileText, color: "text-primary" },
  doc: { Icon: FileText, color: "text-primary" },
  url: { Icon: Globe, color: "text-tertiary" },
  faq: { Icon: MessageCircleQuestion, color: "text-amber-700" },
};

const SOURCE_KIND_LABEL: Record<KbSourceKind, string> = {
  pdf: "PDF",
  doc: "Dokumen",
  url: "URL",
  faq: "FAQ",
};

const SCENARIOS: {
  id: string;
  label: string;
  segment: KbSegmentTier;
  prompt: string;
}[] = [
  {
    id: "umkm-pricing",
    label: "UMKM tanya harga",
    segment: "UMKM",
    prompt:
      "Halo, saya pemilik warung kopi punya 3 karyawan. Berapa harga paket termurahnya ya? Apa sudah termasuk WhatsApp?",
  },
  {
    id: "menengah-roi",
    label: "Menengah tanya ROI",
    segment: "Menengah",
    prompt:
      "Tim sales kami 15 orang, sekarang lead banyak terlewat di WhatsApp. Bisa bantu saya hitung dampaknya kalau pakai produk kalian?",
  },
  {
    id: "korporat-pdpa",
    label: "Korporat tanya kepatuhan",
    segment: "Korporat",
    prompt:
      "Kami perusahaan finance dengan 250 karyawan. Bagaimana produk Anda menjaga kepatuhan UU PDP No. 27/2022?",
  },
];

type ResponseSource = "real" | "mock";

interface LiveResponse {
  answer: string;
  sources: string[];
  source: ResponseSource;
}

export function AiTestPanel() {
  const kb = useKbStore((s) => s.kb);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [prompt, setPrompt] = useState(SCENARIOS[0].prompt);
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveResponse, setLiveResponse] = useState<LiveResponse | null>(null);

  const scenario =
    SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  const response = useMemo(() => {
    const segment = kb.segments.find((s) => s.label === scenario.segment);
    if (!segment) {
      return {
        intro:
          "AI tidak menemukan segmen yang cocok di basis pengetahuan. Tambahkan segmen di tab Segmen.",
        product: null as null | {
          name: string;
          accent?: string;
          tier?: { name: string; priceIDR: number; billing: string };
        },
        rationale: "",
        nextStep: "",
        strategy: null as null | { title: string; body: string },
        sources: [] as {
          id: string;
          kind: KbSourceKind;
          title: string;
          ref?: string;
        }[],
      };
    }

    const priorityMap = kb.priorityProducts.find(
      (m) => m.segmentId === segment.id,
    );
    const productId = priorityMap?.productIds[0];
    const product = productId
      ? kb.products.find((p) => p.id === productId)
      : null;

    const tier = product
      ? kb.pricing.find((t) => t.productId === product.id)
      : null;

    const strategy =
      kb.marketingStrategy.find((n) => n.segmentId === segment.id) ??
      kb.marketingStrategy.find((n) => n.segmentId == null) ??
      null;

    let intro = "";
    let nextStep = "";
    switch (scenario.segment) {
      case "UMKM":
        intro = `Halo! Untuk skala usaha Anda, ${
          product?.name ?? "paket awal kami"
        } biasanya yang paling pas.`;
        nextStep =
          "Saya kirim link aktivasi via WhatsApp — siap dipakai dalam 10 menit. Bisa saya bantu setup-nya sore ini?";
        break;
      case "Menengah":
        intro = `Untuk tim 15 orang, ${
          product?.name ?? "Paket Growth"
        } biasanya menaikkan reply rate 3× dan menghemat 12 jam/minggu per sales.`;
        nextStep =
          "Saya ambilkan studi kasus PT sejenis + demo 15 menit. Lebih nyaman besok pagi atau sore?";
        break;
      case "Korporat":
        intro = `Untuk regulasi finance, ${
          product?.name ?? "Paket Enterprise"
        } kami dilengkapi audit UU PDP No. 27/2022, residensi data AWS Jakarta, dan DPO terkelola.`;
        nextStep =
          "Saya jadwalkan sesi 30 menit bersama tim Compliance Anda + DPO kami. Slot minggu depan?";
        break;
    }

    // ── RAG retrieval (mocked) ──────────────────────────────────────────
    // Prefer sources scoped to the matched segment; fall back to "semua".
    // Only retrieve from indexed + active sources. Deterministic order.
    const ragCandidates = kb.sources
      .filter((s) => s.active && s.status === "indexed")
      .filter((s) => {
        const scope = s.segmentScope ?? [];
        return scope.length === 0 || scope.includes(segment.id);
      });
    const scoped = ragCandidates.filter((s) =>
      (s.segmentScope ?? []).includes(segment.id),
    );
    const unscoped = ragCandidates.filter(
      (s) => (s.segmentScope ?? []).length === 0,
    );
    const picked = [...scoped, ...unscoped].slice(0, 3);

    return {
      intro,
      product: product
        ? {
            name: product.name,
            accent: product.accent,
            tier: tier
              ? {
                  name: tier.tierName,
                  priceIDR: tier.priceIDR,
                  billing: tier.billing,
                }
              : undefined,
          }
        : null,
      rationale: segment.talkingPoints.slice(0, 2).join(" · "),
      nextStep,
      strategy: strategy ? { title: strategy.title, body: strategy.body } : null,
      sources: picked.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        ref: s.ref,
      })),
    };
  }, [kb, scenario.segment]);

  // Map a free-text source title back to a KB source row (for icons / refs).
  const sourcesByTitle = useMemo(() => {
    const map = new Map<
      string,
      { id: string; kind: KbSourceKind; title: string; ref?: string }
    >();
    kb.sources.forEach((s) => {
      map.set(s.title, {
        id: s.id,
        kind: s.kind,
        title: s.title,
        ref: s.ref,
      });
    });
    return map;
  }, [kb.sources]);

  function pickScenario(id: string) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setScenarioId(id);
    setPrompt(s.prompt);
    setSubmitted(false);
    setLiveResponse(null);
  }

  async function runLive() {
    setRunning(true);
    setSubmitted(false);
    setLiveResponse(null);

    // Snapshot the KB at call time — server uses this as ground truth.
    const kbSnapshot: KnowledgeBase = kb;

    try {
      const res = await fetch("/api/kb-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, kbSnapshot }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as LiveResponse;
      setLiveResponse(data);
      setSubmitted(true);
    } catch (err) {
      console.error("[ai-test-panel] live call failed", err);
      toast.error("Gagal memanggil AI. Beralih ke mode demo.");
      // Auto-fallback: compose locally for this one run.
      const fallback = composeKbReply(prompt, kb);
      setLiveResponse({
        answer: fallback.body,
        sources: fallback.sources,
        source: "mock",
      });
      setSubmitted(true);
    } finally {
      setRunning(false);
    }
  }

  function runMock() {
    setRunning(true);
    setSubmitted(false);
    setLiveResponse(null);
    // Tiny delay so the button shows the loading affordance.
    setTimeout(() => {
      setRunning(false);
      setSubmitted(true);
    }, 700);
  }

  function run() {
    if (liveMode) {
      void runLive();
    } else {
      runMock();
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────
  // When in live mode and we have a response, the answer rendering switches
  // from the structured mock layout to a plain `answer` string. Sources still
  // render via the same chip row.

  const liveSources = useMemo(() => {
    if (!liveResponse) return [];
    return liveResponse.sources.map((title, idx) => {
      const hit = sourcesByTitle.get(title);
      if (hit) return hit;
      // Sources from the heuristic include things like product names that
      // aren't in `kb.sources` (e.g. "Segmen UMKM"). Synthesize a doc-ish row.
      return {
        id: `synthetic-${idx}-${title}`,
        kind: "doc" as KbSourceKind,
        title,
        ref: undefined as string | undefined,
      };
    });
  }, [liveResponse, sourcesByTitle]);

  const showLiveLayout = liveMode && liveResponse !== null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base">AI Test — Tanya basis pengetahuan</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Simulasi respons AI berdasarkan KB Anda saat ini.
            </p>
          </div>
        </div>
        <Badge variant="muted">Advanced RAG</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <Zap
              className={`h-3.5 w-3.5 ${
                liveMode ? "text-primary" : "text-muted-foreground"
              }`}
            />
            <Label
              htmlFor="kb-test-live-toggle"
              className="cursor-pointer text-xs font-medium"
            >
              Live (Deepseek)
            </Label>
            <span className="text-[11px] text-muted-foreground">
              {liveMode
                ? "Memakai Deepseek-flash via Gateway"
                : "Memakai heuristik KB offline"}
            </span>
          </div>
          <Switch
            id="kb-test-live-toggle"
            checked={liveMode}
            onCheckedChange={(checked) => {
              setLiveMode(checked);
              setSubmitted(false);
              setLiveResponse(null);
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Skenario
            </p>
            <Select value={scenarioId} onValueChange={pickScenario}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Pertanyaan prospek
            </p>
            <Textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSubmitted(false);
                setLiveResponse(null);
              }}
              className="min-h-[64px] resize-none"
            />
          </div>
        </div>

        <Button onClick={run} disabled={running} className="w-full sm:w-auto">
          {running ? (
            <>
              <Sparkles className="h-4 w-4 animate-pulse" />
              {liveMode ? "Menyusun jawaban AI..." : "AI menyusun jawaban..."}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Tanyakan ke AI
            </>
          )}
        </Button>

        {/* Loading skeleton for live mode */}
        {running && liveMode && (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Menyusun jawaban AI...
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
              <div className="h-3 w-9/12 animate-pulse rounded bg-muted" />
              <div className="h-3 w-10/12 animate-pulse rounded bg-muted" />
            </div>
          </div>
        )}

        {submitted && !running && showLiveLayout && liveResponse && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Respons AI · segmen{" "}
                  <span className="text-foreground">{scenario.segment}</span>
                </p>
              </div>
              {liveResponse.source === "real" ? (
                <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Live · Deepseek-flash
                </Badge>
              ) : (
                <Badge variant="muted">Demo · KB heuristic</Badge>
              )}
            </div>

            {liveSources.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-tertiary" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sumber yang dipakai · Advanced RAG
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {liveSources.map((s) => {
                    const meta = SOURCE_KIND_ICON[s.kind];
                    const Icon = meta.Icon;
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                        <span className="truncate font-medium">{s.title}</span>
                        <Badge variant="muted" className="shrink-0">
                          {SOURCE_KIND_LABEL[s.kind]}
                        </Badge>
                        {s.ref && (
                          <span className="hidden truncate font-mono text-[10px] text-muted-foreground sm:inline">
                            {s.ref}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {liveResponse.answer}
            </p>

            {liveSources.length > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Database className="h-3 w-3" />
                {liveResponse.source === "real"
                  ? "Dirangkai oleh Deepseek dari "
                  : "RAG: jawaban dirangkai dari "}
                <span className="font-medium text-foreground">
                  {liveSources.length}
                </span>{" "}
                sumber relevan.
              </p>
            )}
          </div>
        )}

        {submitted && !running && !showLiveLayout && (
          <div className="rounded-xl border bg-muted/30 p-4">
            {response.sources.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-tertiary" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sumber yang dipakai · Advanced RAG
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {response.sources.map((s) => {
                    const meta = SOURCE_KIND_ICON[s.kind];
                    const Icon = meta.Icon;
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                        <span className="truncate font-medium">{s.title}</span>
                        <Badge variant="muted" className="shrink-0">
                          {SOURCE_KIND_LABEL[s.kind]}
                        </Badge>
                        {s.ref && (
                          <span className="hidden truncate font-mono text-[10px] text-muted-foreground sm:inline">
                            {s.ref}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Respons AI · segmen{" "}
                  <span className="text-foreground">{scenario.segment}</span>
                </p>
              </div>
              <Badge variant="muted">Demo · KB heuristic</Badge>
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {response.intro}
            </p>

            {response.product && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: response.product.accent ?? "#FB5E3B",
                  }}
                />
                <span className="text-sm font-semibold">
                  {response.product.name}
                </span>
                {response.product.tier && (
                  <>
                    <Badge variant="muted">{response.product.tier.name}</Badge>
                    <span className="flex items-baseline gap-1 text-sm">
                      <IDRAmount
                        value={response.product.tier.priceIDR}
                        className="font-semibold"
                      />
                      <span className="text-xs text-muted-foreground">
                        {response.product.tier.billing === "tahunan"
                          ? "/thn"
                          : response.product.tier.billing === "bulanan"
                            ? "/bln"
                            : "satu kali"}
                      </span>
                    </span>
                  </>
                )}
              </div>
            )}

            {response.rationale && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Alasan: </span>
                {response.rationale}
              </p>
            )}

            <p className="mt-3 border-t pt-3 text-sm leading-relaxed text-foreground">
              {response.nextStep}
            </p>

            {response.strategy && (
              <div className="mt-3 rounded-lg border border-dashed bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Mengikuti strategi
                </p>
                <p className="mt-1 text-xs font-medium">
                  {response.strategy.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {response.strategy.body}
                </p>
              </div>
            )}

            {response.sources.length > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Database className="h-3 w-3" />
                RAG: jawaban dirangkai dari{" "}
                <span className="font-medium text-foreground">
                  {response.sources.length}
                </span>{" "}
                sumber relevan.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { positioningInsightTable } from "@/lib/db/schema";
import { meteredGenerateText } from "@/lib/ai/meter";
import { stableId } from "@/lib/profiling/dedup";
import type { Company, Product } from "@/lib/types/profiling";

// "How does MY product fit THIS prospect" (doc 22). Company × product → angle.
export interface Positioning {
  fitScore: number; // 0..100
  angle: string;
  rationale: string[];
  objections: string[];
  recommendedChannel: string; // email | whatsapp | linkedin
  draftOpener: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Offline, grounded fallback — also the demo path when no AI key is configured. */
export function heuristicPositioning(company: Company, product: Product): Positioning {
  const icp = (product.icp ?? {}) as Record<string, unknown>;
  const icpIndustries = Array.isArray(icp.industries) ? (icp.industries as unknown[]).map(String) : [];

  let score = 55;
  if (product.targetMarket === "both") score += 10;
  const industry = company.industry ?? "";
  if (
    industry &&
    icpIndustries.some(
      (i) => industry.toLowerCase().includes(i.toLowerCase()) || i.toLowerCase().includes(industry.toLowerCase()),
    )
  )
    score += 20;
  if (company.summary) score += 8;
  if ((company.techStack?.length ?? 0) > 0) score += 7;

  const vp = product.valueProps?.[0] ?? "efisiensi tim sales";
  const angle = `${product.name} cocok buat ${company.name}${industry ? ` (sektor ${industry})` : ""} — ${vp}.`;
  const rationale = [
    industry ? `Sektor ${industry} sejalan dengan ICP ${product.name}.` : "Profil perusahaan layak ditindaklanjuti.",
    company.size ? `Skala ${company.size} masuk target market ${product.targetMarket ?? "B2B"}.` : "Ukuran perusahaan mendukung adopsi.",
    (company.techStack?.length ?? 0) > 0
      ? `Tech stack (${company.techStack!.slice(0, 2).join(", ")}) menandakan kematangan digital.`
      : "Ada ruang perbaikan proses sales.",
  ];
  const draftOpener = [
    `Halo tim {perusahaan},`,
    ``,
    `Kami lihat ${industry ? `perusahaan di sektor ${industry}` : "tim Anda"} bisa diuntungkan dari ${product.name}. ${vp}.`,
    `Boleh kami jadwalkan obrolan singkat 15 menit minggu ini?`,
  ].join("\n");

  return {
    fitScore: clamp(score),
    angle,
    rationale,
    objections: [
      "Mungkin sudah pakai tools sejenis — tekankan diferensiasi & integrasi.",
      "Kekhawatiran biaya — tawarkan pilot/ROI yang jelas.",
    ],
    recommendedChannel: "email",
    draftOpener,
  };
}

/** Generate via the tenant's active model (metered); fall back to heuristic on
 *  AI-off, parse failure, or error — so the demo never breaks (doc 22 grounding). */
export async function generatePositioning(
  ctx: TenantContext,
  company: Company,
  product: Product,
): Promise<{ insight: Positioning; source: "ai" | "heuristic"; generatedBy: string }> {
  try {
    const system =
      "You are a B2B sales strategist. Output ONLY valid minified JSON — no markdown, no prose. Ground every claim in the prospect facts given.";
    const prompt = [
      `Product: ${product.name}. Value props: ${(product.valueProps ?? []).join("; ") || "-"}. Target market: ${product.targetMarket ?? "B2B"}.`,
      `Prospect: ${company.name}. Industry: ${company.industry ?? "-"}. Size: ${company.size ?? "-"}. Summary: ${company.summary ?? "-"}. Tech: ${(company.techStack ?? []).join(", ") || "-"}.`,
      `Return JSON: {"fitScore": <0-100 int>, "angle": <string>, "rationale": <string[2-3]>, "objections": <string[1-2]>, "recommendedChannel": "email"|"whatsapp"|"linkedin", "draftOpener": <string>}.`,
      `angle/rationale/objections/draftOpener in Bahasa Indonesia. draftOpener max 6 lines, use {nama} and {perusahaan} placeholders.`,
    ].join("\n");

    const { text, model } = await meteredGenerateText(ctx, {
      feature: "positioning",
      system,
      prompt,
      maxOutputTokens: 700,
    });
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const j = JSON.parse(cleaned) as Partial<Positioning>;
    if (typeof j.fitScore === "number" && j.angle) {
      return {
        insight: {
          fitScore: clamp(j.fitScore),
          angle: String(j.angle),
          rationale: Array.isArray(j.rationale) ? j.rationale.map(String) : [],
          objections: Array.isArray(j.objections) ? j.objections.map(String) : [],
          recommendedChannel: ["email", "whatsapp", "linkedin"].includes(String(j.recommendedChannel))
            ? String(j.recommendedChannel)
            : "email",
          draftOpener: String(j.draftOpener ?? ""),
        },
        source: "ai",
        generatedBy: model,
      };
    }
  } catch (err) {
    console.error("[positioning] AI failed; heuristic fallback:", err);
  }
  return { insight: heuristicPositioning(company, product), source: "heuristic", generatedBy: "heuristic" };
}

/** Upsert the insight (one per tenant × company × product). */
export async function storePositioning(
  ctx: TenantContext,
  companyId: string,
  productId: string,
  gen: { insight: Positioning; source: string; generatedBy: string },
): Promise<string> {
  const id = stableId("pos", `${ctx.tenantId}:${companyId}:${productId}`);
  const cols = {
    fitScore: gen.insight.fitScore,
    angle: gen.insight.angle,
    rationale: gen.insight.rationale,
    objections: gen.insight.objections,
    recommendedChannel: gen.insight.recommendedChannel,
    draftOpener: gen.insight.draftOpener,
    source: gen.source,
    generatedBy: gen.generatedBy,
  };
  await withTenant(ctx, (tx) =>
    tx
      .insert(positioningInsightTable)
      .values({ id, tenantId: ctx.tenantId, companyId, productId, ...cols })
      .onConflictDoUpdate({
        target: [
          positioningInsightTable.tenantId,
          positioningInsightTable.companyId,
          positioningInsightTable.productId,
        ],
        set: { ...cols, updatedAt: new Date() },
      }),
  );
  return id;
}

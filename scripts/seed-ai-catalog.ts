/**
 * Seed the AI provider + model catalog (doc 24). Idempotent — upserts on the
 * natural keys, so re-running refreshes names/specs without duplicating.
 *
 * The catalog was originally seeded by a one-off script; this committed version
 * makes it reproducible and is the source of truth for which models tenants can
 * pick. Pricing is left null where unverified (superadmin fills it in-app —
 * never fabricated). Run: `npx tsx scripts/seed-ai-catalog.ts`.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

import { db } from "../lib/db/client";
import { aiProviderTable, aiModelTable } from "../lib/db/schema";

interface ProviderSeed {
  id: string;
  key: string;
  displayName: string;
  baseUrl?: string;
}
interface ModelSeed {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  contextWindow?: number | null;
  priceInPer1m?: number | null;
  priceOutPer1m?: number | null;
  capabilities?: string[];
}

const PROVIDERS: ProviderSeed[] = [
  { id: "ai_prov_deepseek", key: "deepseek", displayName: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "ai_prov_anthropic", key: "anthropic", displayName: "Anthropic" },
  { id: "ai_prov_openai", key: "openai", displayName: "OpenAI" },
  { id: "ai_prov_google", key: "google", displayName: "Google" },
];

// DeepSeek context = 128k (its standard). Pricing null = superadmin fills, not
// fabricated. Anthropic specs/pricing from the official model reference.
const MODELS: ModelSeed[] = [
  // ── DeepSeek (June 2026 lineup) ──
  { id: "mdl_deepseek_v4_flash", providerId: "ai_prov_deepseek", modelId: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", contextWindow: 128000, capabilities: ["chat", "fast"] },
  { id: "mdl_deepseek_v4_pro", providerId: "ai_prov_deepseek", modelId: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", contextWindow: 128000, capabilities: ["chat", "reasoning", "strong"] },
  { id: "mdl_deepseek_chat", providerId: "ai_prov_deepseek", modelId: "deepseek-chat", displayName: "DeepSeek V3 (chat)", contextWindow: 128000, capabilities: ["chat"] },
  { id: "mdl_deepseek_reasoner", providerId: "ai_prov_deepseek", modelId: "deepseek-reasoner", displayName: "DeepSeek R1 (reasoner)", contextWindow: 128000, capabilities: ["reasoning"] },
  // ── Anthropic ──
  { id: "mdl_anthropic_fable5", providerId: "ai_prov_anthropic", modelId: "claude-fable-5", displayName: "Claude Fable 5", contextWindow: 1000000, priceInPer1m: 10, priceOutPer1m: 50, capabilities: ["chat", "reasoning", "strong"] },
  { id: "mdl_anthropic_opus48", providerId: "ai_prov_anthropic", modelId: "claude-opus-4-8", displayName: "Claude Opus 4.8", contextWindow: 1000000, priceInPer1m: 5, priceOutPer1m: 25, capabilities: ["chat", "reasoning"] },
  { id: "mdl_anthropic_opus47", providerId: "ai_prov_anthropic", modelId: "claude-opus-4-7", displayName: "Claude Opus 4.7", contextWindow: 1000000, priceInPer1m: 5, priceOutPer1m: 25, capabilities: ["chat", "reasoning"] },
  { id: "mdl_anthropic_opus46", providerId: "ai_prov_anthropic", modelId: "claude-opus-4-6", displayName: "Claude Opus 4.6", contextWindow: 1000000, priceInPer1m: 5, priceOutPer1m: 25, capabilities: ["chat", "reasoning"] },
  { id: "mdl_anthropic_sonnet46", providerId: "ai_prov_anthropic", modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", contextWindow: 1000000, priceInPer1m: 3, priceOutPer1m: 15, capabilities: ["chat"] },
  { id: "mdl_anthropic_haiku45", providerId: "ai_prov_anthropic", modelId: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", contextWindow: 200000, priceInPer1m: 1, priceOutPer1m: 5, capabilities: ["chat", "fast"] },
];

async function main() {
  for (const p of PROVIDERS) {
    await db
      .insert(aiProviderTable)
      .values({ id: p.id, key: p.key, displayName: p.displayName, baseUrl: p.baseUrl ?? null })
      .onConflictDoUpdate({ target: aiProviderTable.key, set: { displayName: p.displayName, baseUrl: p.baseUrl ?? null } });
  }
  for (const m of MODELS) {
    await db
      .insert(aiModelTable)
      .values({
        id: m.id,
        providerId: m.providerId,
        modelId: m.modelId,
        displayName: m.displayName,
        contextWindow: m.contextWindow ?? null,
        priceInPer1m: m.priceInPer1m ?? null,
        priceOutPer1m: m.priceOutPer1m ?? null,
        capabilities: m.capabilities ?? [],
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [aiModelTable.providerId, aiModelTable.modelId],
        set: {
          displayName: m.displayName,
          contextWindow: m.contextWindow ?? null,
          capabilities: m.capabilities ?? [],
          updatedAt: new Date(),
        },
      });
  }
  console.log(`seeded ${PROVIDERS.length} providers + ${MODELS.length} models`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

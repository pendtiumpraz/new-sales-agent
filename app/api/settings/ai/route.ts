import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService } from "@/modules/settings/service";

export const runtime = "nodejs";

// GET /api/settings/ai → AI config: model catalog (global) + this tenant's active
// model, BYOK key status per provider, and the current-month usage rollup.
// REUSE: reads the same tables lib/ai/registry resolves; no AI call. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb())
    return ok({
      models: [],
      providers: [],
      activeModelId: null,
      usage: { tokensIn: 0, tokensOut: 0, cost: 0, calls: 0 },
      aiMode: "platform",
    });
  return handle(
    async () => ok(await settingsService.getAiConfig(g.ctx)),
    "api/settings/ai GET",
  );
}

// PATCH /api/settings/ai → set the tenant's one active model (body { modelId }) OR
// its source-of-AI mode (body { aiMode: "platform" | "byoa" }, Fase 2/BYOA).
// tenant.settings.manage.
export async function PATCH(req: Request) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle<Record<string, string>>(async () => {
    const body = (await req.json()) as { modelId?: string; aiMode?: string };
    if (body?.aiMode !== undefined) {
      return ok(await settingsService.setAiMode(g.ctx, body.aiMode));
    }
    if (!body?.modelId) return fail("modelId atau aiMode wajib diisi", 400, "validation");
    return ok(await settingsService.setActiveModel(g.ctx, body.modelId));
  }, "api/settings/ai PATCH");
}

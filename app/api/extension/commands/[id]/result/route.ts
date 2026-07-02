import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import type { TenantContext } from "@/lib/db/tenant-context";
import { resolveRepByToken } from "@/lib/team/rep-account";
import { ServiceError } from "@/modules/_shared/api";
import { extCommandService, type SubmitCommandResultInput } from "@/modules/ext-command/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/extension/commands/[id]/result — the extension reports a command's
// outcome: { result? } → done, or { error? } → failed. Auth = the PER-REP INGEST
// TOKEN (`x-ingest-token` → resolveRepByToken; NOT the agent API key). Response
// mirrors the extension's other endpoints ({ ok, id, status }).
export async function POST(req: Request, { params }: Ctx) {
  const token = req.headers.get("x-ingest-token") ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "Token tidak valid" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Database tidak tersedia" }, { status: 503 });

  const rep = await resolveRepByToken(token);
  if (!rep) return NextResponse.json({ ok: false, error: "Token tidak valid" }, { status: 401 });

  const ctx: TenantContext = { tenantId: rep.tenantId, userId: rep.userId, role: "member" };
  const body = (await req.json().catch(() => ({}))) as SubmitCommandResultInput;
  try {
    const cmd = await extCommandService.submitResult(ctx, params.id, body);
    return NextResponse.json({ ok: true, id: cmd.id, status: cmd.status });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[api/extension/commands/[id]/result POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

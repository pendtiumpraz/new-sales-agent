import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { requirePermission } from "@/lib/rbac/guard";
import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { personTable, companyTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// Whitelist of editable columns per entity kind. Anything outside these sets is
// dropped before it reaches the UPDATE so a caller can't patch tenantId, ids,
// provenance, scores, etc. Keys map 1:1 to drizzle column names on each table.
const ALLOWED = {
  person: ["fullName", "title", "department", "location", "about"],
  company: ["name", "domain", "industry", "summary", "size"],
} as const;

type Kind = keyof typeof ALLOWED;

function pickAllowed(
  kind: Kind,
  patch: Record<string, string | null>,
): Record<string, string | null> {
  const allowed = ALLOWED[kind] as readonly string[];
  const out: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in patch) out[key] = patch[key];
  }
  return out;
}

export async function POST(req: Request) {
  // RBAC: editing captured data requires the write permission (doc 19).
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  // Demo/offline mode — no Postgres wired up, so the edit is a no-op the client
  // can fall back to optimistically.
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" });
  }

  try {
    const body = (await req.json()) as {
      kind?: unknown;
      id?: unknown;
      patch?: unknown;
    };

    const kind = body.kind;
    const id = body.id;
    const rawPatch = body.patch;

    if (
      (kind !== "person" && kind !== "company") ||
      typeof id !== "string" ||
      id.length === 0 ||
      rawPatch === null ||
      typeof rawPatch !== "object"
    ) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const patch = pickAllowed(kind as Kind, rawPatch as Record<string, string | null>);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "No editable fields" }, { status: 400 });
    }

    const set = { ...patch, updatedAt: new Date() };

    const data = await withTenant(ctx, async (tx) => {
      if (kind === "person") {
        const rows = await tx
          .update(personTable)
          .set(set)
          .where(and(eq(personTable.id, id), eq(personTable.tenantId, ctx.tenantId)))
          .returning();
        return rows[0] ?? null;
      }
      const rows = await tx
        .update(companyTable)
        .set(set)
        .where(and(eq(companyTable.id, id), eq(companyTable.tenantId, ctx.tenantId)))
        .returning();
      return rows[0] ?? null;
    });

    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 },
    );
  }
}

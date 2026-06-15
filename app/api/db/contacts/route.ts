import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { contactsTable } from "@/lib/db/schema";
import { contacts as seedContacts } from "@/lib/api-mock/data";
import type { Contact } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/contacts → tenant-scoped contacts (RLS), falling back to seed when
// DB is unconfigured, no session, empty, or errors. (doc 19 — slice 2b)
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: seedContacts, source: "mock" });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ data: seedContacts, source: "mock" });
  }
  try {
    const rows = await withTenant(ctx, (tx) => tx.select().from(contactsTable));
    if (!rows.length) {
      return NextResponse.json({ data: seedContacts, source: "seed" });
    }
    return NextResponse.json({ data: rows as unknown as Contact[], source: "db" });
  } catch (err) {
    console.error("[api/db/contacts GET]", err);
    return NextResponse.json({ data: seedContacts, source: "mock-fallback" });
  }
}

// PUT /api/db/contacts → upsert each contact by id, stamped with the tenant.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as { data: Contact[] };
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    await withTenant(ctx, async (tx) => {
      for (const c of body.data) {
        await tx
          .insert(contactsTable)
          .values({ ...c, tenantId: ctx.tenantId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: contactsTable.id,
            set: { ...c, tenantId: ctx.tenantId, updatedAt: new Date() },
          });
      }
    });
    return NextResponse.json({ ok: true, source: "db", count: body.data.length });
  } catch (err) {
    console.error("[api/db/contacts PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

import { inArray, isNull, isNotNull } from "drizzle-orm";
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
// ?archived=1 returns ONLY soft-deleted rows (the Arsip view, doc 49).
export async function GET(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ data: seedContacts, source: "mock" });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ data: seedContacts, source: "mock" });
  }
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  try {
    const rows = await withTenant(ctx, (tx) =>
      tx.select().from(contactsTable).where(archived ? isNotNull(contactsTable.deletedAt) : isNull(contactsTable.deletedAt)),
    );
    if (!rows.length) {
      // Seed only backfills the normal view; the Arsip view is honestly empty.
      return archived ? NextResponse.json({ data: [], source: "db" }) : NextResponse.json({ data: seedContacts, source: "seed" });
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

// DELETE /api/db/contacts → permanently delete the given contact ids (UU PDP).
export async function DELETE(req: Request) {
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = (body.ids ?? []).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "ids wajib" }, { status: 400 });
    await withTenant(ctx, (tx) => tx.delete(contactsTable).where(inArray(contactsTable.id, ids)));
    return NextResponse.json({ ok: true, deleted: ids.length, source: "db" });
  } catch (err) {
    console.error("[api/db/contacts DELETE]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

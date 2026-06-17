import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac/guard";
import { sendJobTable } from "@/lib/db/schema";
import { enqueueSend, processSendJobs } from "@/lib/mail/send";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/tenant/sends → recent send jobs for the tenant.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], source: "mock" });
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const rows = await withTenant(ctx, (tx) =>
      // RLS is off — scope to this tenant explicitly.
      tx.select().from(sendJobTable).where(eq(sendJobTable.tenantId, ctx.tenantId)).orderBy(desc(sendJobTable.createdAt)).limit(50),
    );
    return NextResponse.json({ data: rows, source: "db" });
  } catch (err) {
    console.error("[api/tenant/sends GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

// POST /api/tenant/sends → enqueue a send, then process the queue (demo: inline).
// Body { sendingAccountId, toEmail, subject, body }. Requires campaign.manage.
export async function POST(req: Request) {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const b = (await req.json()) as { sendingAccountId?: string; toEmail?: string; subject?: string; body?: string };
    if (!b?.sendingAccountId || !b?.toEmail || !b?.subject || !b?.body) {
      return NextResponse.json({ error: "Missing sendingAccountId/toEmail/subject/body" }, { status: 400 });
    }
    const id = await enqueueSend(ctx, {
      sendingAccountId: b.sendingAccountId,
      toEmail: b.toEmail,
      subject: b.subject,
      body: b.body,
    });
    const result = await processSendJobs(ctx, 5);
    return NextResponse.json({ ok: true, id, result });
  } catch (err) {
    console.error("[api/tenant/sends POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

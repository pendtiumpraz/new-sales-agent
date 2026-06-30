import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { invitesTable, usersTable, membershipsTable, tenantsTable } from "@/lib/db/schema";

export const runtime = "nodejs";

const COLORS = ["#FB5E3B", "#14B8A6", "#F59E0B", "#3B82F6", "#8B5CF6"];

// GET /api/invites/:token — public: view an invite so the accept page can show
// "Anda diundang ke <Tenant> sebagai <role>".
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  // Generic 503 — don't reveal DB availability to an anonymous caller (audit #45).
  if (!hasDb()) return NextResponse.json({ error: "Layanan tidak tersedia. Coba lagi nanti." }, { status: 503 });
  const [inv] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.token)).limit(1);
  if (!inv) return NextResponse.json({ error: "Undangan tidak ditemukan" }, { status: 404 });

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, inv.tenantId))
    .limit(1);
  const expired = inv.expiresAt ? inv.expiresAt < new Date() : false;

  return NextResponse.json({
    email: inv.email,
    role: inv.role,
    tenantName: tenant?.name ?? inv.tenantId,
    status: inv.status,
    expired,
  });
}

// POST /api/invites/:token — public: accept. Body { name, password }. Creates the
// user (if new) + an active membership, and marks the invite accepted so the
// invited sales rep can finally log in.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  // Generic 503 — don't reveal DB availability to an anonymous caller (audit #45).
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Layanan tidak tersedia. Coba lagi nanti." }, { status: 503 });

  const [inv] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.token)).limit(1);
  if (!inv) return NextResponse.json({ error: "Undangan tidak ditemukan" }, { status: 404 });
  if (inv.status !== "pending") {
    return NextResponse.json({ error: "Undangan sudah dipakai atau dibatalkan." }, { status: 409 });
  }
  if (inv.expiresAt && inv.expiresAt < new Date()) {
    await db.update(invitesTable).set({ status: "expired" }).where(eq(invitesTable.id, inv.id));
    return NextResponse.json({ error: "Undangan sudah kedaluwarsa." }, { status: 410 });
  }

  const body = (await req.json().catch(() => null)) as { name?: string; password?: string } | null;
  if (!body?.name?.trim() || !body?.password || body.password.length < 6) {
    return NextResponse.json({ error: "Nama + sandi (min 6 karakter) wajib." }, { status: 400 });
  }

  const email = inv.email.trim().toLowerCase();
  try {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    let userId = existing?.id;
    if (!userId) {
      userId = "u_" + crypto.randomUUID().slice(0, 12);
      await db.insert(usersTable).values({
        id: userId,
        name: body.name.trim(),
        email,
        password: body.password, // demo: plain (matches schema); prod = hash
        role: inv.role,
        avatarColor: COLORS[email.length % COLORS.length],
      });
    }

    // Active membership; ignore if they're somehow already in the tenant.
    await db
      .insert(membershipsTable)
      .values({ id: "m_" + crypto.randomUUID().slice(0, 12), tenantId: inv.tenantId, userId, role: inv.role, status: "active" })
      .onConflictDoNothing();

    await db.update(invitesTable).set({ status: "accepted" }).where(eq(invitesTable.id, inv.id));

    return NextResponse.json({ ok: true, message: "Undangan diterima. Silakan login." });
  } catch (err) {
    console.error("[api/invites/[token] POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

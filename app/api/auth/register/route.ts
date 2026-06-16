import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, hasDb } from "@/lib/db/client";
import { membershipsTable, tenantsTable, usersTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// POST /api/auth/register (doc 38) — self-serve signup. Creates a tenant in
// status 'pending' + the owner user + membership. The account CANNOT use the app
// until a superadmin activates it (sets status='active' + active_until). Public.
const Body = z.object({
  company: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const COLORS = ["#FB5E3B", "#14B8A6", "#F59E0B", "#3B82F6", "#8B5CF6"];

export async function POST(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "Database belum aktif." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Lengkapi: nama perusahaan, nama, email valid, sandi min 6 karakter." },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const email = b.email.trim().toLowerCase();

  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length) {
      return NextResponse.json({ ok: false, error: "Email sudah terdaftar." }, { status: 409 });
    }

    const tenantId = "t_" + crypto.randomUUID().slice(0, 12);
    const userId = "u_" + crypto.randomUUID().slice(0, 12);
    const avatarColor = COLORS[email.length % COLORS.length];

    // New tenant starts PENDING — needs superadmin activation.
    await db.insert(tenantsTable).values({ id: tenantId, name: b.company, plan: "starter", status: "pending" });
    await db.insert(usersTable).values({
      id: userId,
      name: b.name,
      email,
      password: b.password, // demo: plain (matches existing users table); real prod = hash
      role: "tenant_owner",
      avatarColor,
    });
    await db.insert(membershipsTable).values({
      id: "m_" + crypto.randomUUID().slice(0, 12),
      tenantId,
      userId,
      role: "tenant_owner",
      status: "active",
    });

    return NextResponse.json({
      ok: true,
      message: "Akun dibuat. Menunggu aktivasi oleh superadmin.",
    });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

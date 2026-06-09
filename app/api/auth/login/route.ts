import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { usersTable } from "@/lib/db/schema";
import { findAccount } from "@/lib/auth/demo-accounts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email: string; password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email dan kata sandi wajib diisi." },
      { status: 400 },
    );
  }

  // Try DB first; fall back to in-memory DEMO_ACCOUNTS if DB unavailable.
  if (hasDb()) {
    try {
      const rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      const row = rows[0];
      if (row && row.password === password) {
        return NextResponse.json({
          ok: true,
          source: "db",
          user: {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            avatarColor: row.avatarColor,
            scope: row.scope ?? "",
            password: row.password, // safe in this demo prototype; UI doesn't store
          },
        });
      }
      // No match in DB — fall through to in-memory check as a safety net during
      // the migration window (in case seed hasn't run yet).
    } catch (err) {
      console.error("[api/auth/login]", err);
    }
  }

  const account = findAccount(email, password);
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Email atau kata sandi salah." },
      { status: 401 },
    );
  }
  return NextResponse.json({
    ok: true,
    source: hasDb() ? "db-miss-mock" : "mock",
    user: account,
  });
}

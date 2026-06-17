import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission } from "@/lib/rbac/guard";
import { hasDb } from "@/lib/db/client";
import { listQuotes, createQuote } from "@/lib/quotes/store";

export const runtime = "nodejs";

// GET /api/quotes?workspace=<id> — list quotes for the tenant (workspace-scoped).
export async function GET(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [] });
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace");
  const archived = url.searchParams.get("archived") === "1";
  const data = await listQuotes(guard.ctx, { workspaceId, archived });
  return NextResponse.json({ data });
}

const ItemSchema = z.object({ desc: z.string(), qty: z.number(), unitPrice: z.number() });
const CreateSchema = z.object({
  title: z.string().min(1),
  items: z.array(ItemSchema).optional(),
  taxRate: z.number().optional(),
  currency: z.string().optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  coverSubject: z.string().nullable().optional(),
  coverBody: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  customerEmail: z.string().nullable().optional(),
  customerCompany: z.string().nullable().optional(),
});

// POST /api/quotes — create a quote (draft).
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ error: "DB tidak aktif" }, { status: 400 });
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  const q = await createQuote(guard.ctx, parsed.data);
  return NextResponse.json({ data: q });
}

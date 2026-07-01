import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission } from "@/lib/rbac/guard";
import { getQuote, updateQuote } from "@/lib/quotes/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const q = await getQuote(guard.ctx, params.id);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data: q });
}

const ItemSchema = z.object({ desc: z.string(), qty: z.number(), unitPrice: z.number() });
const PatchSchema = z.object({
  title: z.string().optional(),
  items: z.array(ItemSchema).optional(),
  taxRate: z.number().optional(),
  currency: z.string().optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  coverSubject: z.string().nullable().optional(),
  coverBody: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  customerEmail: z.string().nullable().optional(),
  customerCompany: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  const q = await updateQuote(guard.ctx, params.id, parsed.data);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ("locked" in q) {
    return NextResponse.json(
      {
        error: `Penawaran sudah ${q.status} — terkunci. Duplikat sebagai draf baru untuk mengubah.`,
        locked: true,
        status: q.status,
        fields: q.fields,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ data: q });
}

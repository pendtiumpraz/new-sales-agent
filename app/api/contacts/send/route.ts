import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { contactsTable, sendingAccountTable } from "@/lib/db/schema";
import { enqueueSend, processSendJobs } from "@/lib/mail/send";
import { sendWhatsApp, wahaConfigured } from "@/lib/wa/waha";

export const runtime = "nodejs";

// Personalize {nama}/{perusahaan} (single or double brace) per contact.
function fill(t: string, name: string | null, company: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0] || "Kak";
  return (t ?? "")
    .replace(/\{\{?\s*nama\s*\}?\}/gi, first)
    .replace(/\{\{?\s*perusahaan\s*\}?\}/gi, company || "perusahaan Anda");
}

// POST /api/contacts/send — blast email/WA to selected contacts via the PLATFORM
// (mailbox for email, WAHA gateway for WhatsApp). Body = { contactIds, channel,
// subject?, body }. The browser-side "manual / extension" path (mailto / wa.me)
// is handled client-side and doesn't hit this route.
export async function POST(req: Request) {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const b = (await req.json().catch(() => ({}))) as { contactIds?: string[]; channel?: string; subject?: string; body?: string };
  const ids = (b.contactIds ?? []).filter(Boolean);
  if (!ids.length) return NextResponse.json({ ok: false, error: "Pilih kontak dulu" }, { status: 400 });
  if (!b.body?.trim()) return NextResponse.json({ ok: false, error: "Isi pesan dulu" }, { status: 400 });

  const rows = await withTenant(ctx, (tx) =>
    tx.select().from(contactsTable).where(and(eq(contactsTable.tenantId, ctx.tenantId), inArray(contactsTable.id, ids))),
  );

  try {
    if (b.channel === "whatsapp") {
      if (!(await wahaConfigured())) {
        return NextResponse.json({ ok: false, error: "Gateway WhatsApp belum dikonfigurasi. Pakai mode manual (wa.me) atau set WA_GATEWAY_TOKEN.", needsManual: true });
      }
      let sent = 0;
      let skipped = 0;
      let failed = 0;
      for (const c of rows) {
        if (!c.phone) { skipped++; continue; }
        try {
          await sendWhatsApp({ to: c.phone, text: fill(b.body, c.name, c.company) });
          sent++;
        } catch {
          failed++;
        }
      }
      return NextResponse.json({ ok: true, channel: "whatsapp", sent, skipped, failed, source: "db" });
    }

    // email (default)
    const [acc] = await withTenant(ctx, (tx) =>
      tx.select({ id: sendingAccountTable.id }).from(sendingAccountTable).where(eq(sendingAccountTable.tenantId, ctx.tenantId)).limit(1),
    );
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Belum ada mailbox. Connect Gmail/Outlook/SMTP di Pengaturan → Mailbox, atau pakai mode manual.", needsManual: true });
    }
    const subject = (b.subject ?? "").trim() || "Pesan dari tim kami";
    let queued = 0;
    let skipped = 0;
    for (const c of rows) {
      const to = (c.email ?? "").trim();
      if (!to) { skipped++; continue; }
      await enqueueSend(ctx, { sendingAccountId: acc.id, toEmail: to, subject: fill(subject, c.name, c.company), body: fill(b.body, c.name, c.company), feature: "blast" });
      queued++;
    }
    const summary = await processSendJobs(ctx);
    return NextResponse.json({ ok: true, channel: "email", queued, skipped, processed: summary, source: "db" });
  } catch (err) {
    console.error("[api/contacts/send]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

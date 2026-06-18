import { and, eq, gte, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { sendJobTable, sendingAccountTable } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/ai/crypto";
import { isTenantActive } from "@/lib/admin/kill-switch";
import { sendViaSmtp, type SmtpConfig } from "./smtp";
import { espConfigured, sendViaEsp } from "./esp";
import { isSuppressed } from "./suppression";

// DB-backed send queue (doc 23). Dispatch is intentionally abstracted here so it
// can move to Inngest later (doc 28) without touching callers — for now a
// process-on-demand worker. SMTP only in slice 1; OAuth/ESP adapters come later.

/**
 * Start of "today" in Asia/Jakarta (UTC+7, no DST) as a UTC Date. This is the
 * daily-cap boundary: Jakarta midnight = the UTC instant 7h before. Logic-audit
 * fix — the daily send cap must roll over at local midnight, not accumulate for
 * the lifetime of the mailbox.
 */
export function jakartaDayStart(now: Date = new Date()): Date {
  const jakarta = new Date(now.getTime() + 7 * 3_600_000);
  const y = jakarta.getUTCFullYear();
  const m = jakarta.getUTCMonth();
  const d = jakarta.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - 7 * 3_600_000);
}

/**
 * How many emails this sending account has actually sent *today* (Asia/Jakarta),
 * derived from the send log rather than a stored counter that never resets.
 * Single source of truth for both the daily cap (processSendJobs) and the UI.
 */
export async function sentTodayForAccount(
  ctx: TenantContext,
  accountId: string,
  since: Date = jakartaDayStart(),
): Promise<number> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sendJobTable)
      .where(
        and(
          eq(sendJobTable.tenantId, ctx.tenantId),
          eq(sendJobTable.sendingAccountId, accountId),
          eq(sendJobTable.status, "sent"),
          gte(sendJobTable.sentAt, since),
        ),
      ),
  );
  return row?.n ?? 0;
}

export async function enqueueSend(
  ctx: TenantContext,
  opts: { sendingAccountId: string; toEmail: string; subject: string; body: string; feature?: string },
): Promise<string> {
  const id = "send_" + crypto.randomUUID();
  await withTenant(ctx, (tx) =>
    tx.insert(sendJobTable).values({
      id,
      tenantId: ctx.tenantId,
      sendingAccountId: opts.sendingAccountId,
      toEmail: opts.toEmail.trim().toLowerCase(),
      subject: opts.subject,
      body: opts.body,
      feature: opts.feature ?? "manual",
    }),
  );
  return id;
}

function unsubscribeFooter(tenantId: string, email: string): string {
  const base = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const url = `${base}/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(tenantId)}`;
  return `\n\n—\nBerhenti berlangganan email ini: ${url}`;
}

async function setStatus(ctx: TenantContext, id: string, status: string, error?: string) {
  await withTenant(ctx, (tx) =>
    tx.update(sendJobTable).set({ status, error: error ?? null }).where(eq(sendJobTable.id, id)),
  );
}

/**
 * Process pending send jobs: skip suppressed recipients, respect each mailbox's
 * daily cap, inject the unsubscribe footer, send via SMTP, record status.
 * SMTP I/O happens outside the DB transaction (it's slow). Returns a summary.
 */
export async function processSendJobs(ctx: TenantContext, limit = 20) {
  if (!(await isTenantActive(ctx))) {
    return { sent: 0, skipped: 0, failed: 0, picked: 0, suspended: true };
  }
  let sent = 0,
    skipped = 0,
    failed = 0;

  // Per-account count of emails sent TODAY (Asia/Jakarta), derived from the
  // send log once per account then kept in sync in-memory as we send. The cap
  // rolls over at local midnight instead of jamming the mailbox forever.
  const dayStart = jakartaDayStart();
  const usedToday = new Map<string, number>();

  const jobs = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(sendJobTable)
      .where(and(eq(sendJobTable.tenantId, ctx.tenantId), eq(sendJobTable.status, "pending")))
      .limit(limit),
  );

  for (const job of jobs) {
    if (!job.toEmail) {
      await setStatus(ctx, job.id, "failed", "missing recipient");
      failed++;
      continue;
    }
    // const string local so the non-null narrowing survives awaits/closures below.
    const toEmail: string = job.toEmail;
    const info = await withTenant(ctx, async (tx) => {
      const supp = await isSuppressed(tx, ctx.tenantId, toEmail);
      const acc = job.sendingAccountId
        ? (await tx.select().from(sendingAccountTable).where(eq(sendingAccountTable.id, job.sendingAccountId)).limit(1))[0]
        : null;
      return { supp, acc };
    });

    if (info.supp) {
      await setStatus(ctx, job.id, "skipped", "suppressed");
      skipped++;
      continue;
    }
    const acc = info.acc;
    if (!acc) {
      await setStatus(ctx, job.id, "failed", "no sending account");
      failed++;
      continue;
    }
    const isEsp = acc.type === "platform_esp";
    // SMTP/OAuth mailboxes need an encrypted config; platform ESP uses the
    // platform key instead (no per-account config).
    if (!isEsp && !acc.configEnc) {
      await setStatus(ctx, job.id, "failed", "no sending account / config");
      failed++;
      continue;
    }
    if (isEsp && !espConfigured()) {
      await setStatus(ctx, job.id, "failed", "platform ESP belum dikonfigurasi (RESEND_API_KEY)");
      failed++;
      continue;
    }
    let used = usedToday.get(acc.id);
    if (used === undefined) {
      used = await sentTodayForAccount(ctx, acc.id, dayStart);
      usedToday.set(acc.id, used);
    }
    if (used >= acc.dailyLimit) {
      // Daily cap reached for today — leave pending; rolls over at midnight.
      continue;
    }

    const from = acc.fromName ? `${acc.fromName} <${acc.fromEmail}>` : acc.fromEmail;
    const text = job.body + unsubscribeFooter(ctx.tenantId, toEmail);

    try {
      if (isEsp) {
        await sendViaEsp({ from, to: toEmail, subject: job.subject, text, tenantId: ctx.tenantId });
      } else {
        // Non-ESP → configEnc guaranteed non-null by the guard above.
        const cfg = JSON.parse(decryptSecret(acc.configEnc as string)) as SmtpConfig;
        await sendViaSmtp(cfg, { from, to: toEmail, subject: job.subject, text });
      }
      // The send log (status='sent' + sentAt) is now the source of truth for
      // the daily count, so we no longer bump the stale sending_account counter.
      await withTenant(ctx, (tx) =>
        tx.update(sendJobTable).set({ status: "sent", sentAt: new Date() }).where(eq(sendJobTable.id, job.id)),
      );
      usedToday.set(acc.id, used + 1);
      sent++;
    } catch (err) {
      await setStatus(ctx, job.id, "failed", String(err).slice(0, 500));
      failed++;
    }
  }

  return { sent, skipped, failed, picked: jobs.length };
}

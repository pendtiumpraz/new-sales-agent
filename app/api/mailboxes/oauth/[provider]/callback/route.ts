import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { sendingAccountTable } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/ai/crypto";
import { recordAudit } from "@/lib/compliance/audit";
import {
  appBaseUrl,
  exchangeCode,
  isMailProvider,
  providerAccountType,
  verifyState,
} from "@/lib/mail/oauth";

export const runtime = "nodejs";

// GET /api/mailboxes/oauth/{provider}/callback (doc 32) — provider redirects here
// with ?code&state. We verify state (CSRF), exchange the code, and persist the
// refresh token (encrypted) as a sending_account, then bounce back to the UI.
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const base = appBaseUrl();
  const settings = `${base}/settings/mailboxes`;
  const provider = params.provider;

  if (!isMailProvider(provider)) {
    return NextResponse.redirect(`${settings}?connect=error`);
  }

  // Same session that started the flow → tells us tenant + user.
  const guard = await requirePermission("mailbox.connect");
  if ("error" in guard) return NextResponse.redirect(`${base}/login`);
  const { ctx } = guard;

  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const oauthError = u.searchParams.get("error");

  if (oauthError || !code || !state || !verifyState(state, provider)) {
    return NextResponse.redirect(`${settings}?connect=error`);
  }

  try {
    const redirectUri = `${base}/api/mailboxes/oauth/${provider}/callback`;
    const { refreshToken, email } = await exchangeCode(provider, code, redirectUri);

    // Without a refresh token we can't send later. Happens when the user already
    // granted consent before — re-consent (prompt=consent) issues a fresh one.
    if (!refreshToken) {
      return NextResponse.redirect(`${settings}?connect=norefresh`);
    }
    if (!hasDb()) return NextResponse.redirect(`${settings}?connect=error`);

    const user = email ?? "";
    const configEnc = encryptSecret(
      JSON.stringify({ kind: "oauth", provider, user, refreshToken }),
    );

    await withTenant(ctx, (tx) =>
      tx.insert(sendingAccountTable).values({
        id: "mbx_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: providerAccountType(provider),
        fromEmail: (email ?? "unknown").toLowerCase(),
        configEnc,
        dailyLimit: 200,
      }),
    );
    await recordAudit(ctx, "mailbox.connect", provider, { email });

    return NextResponse.redirect(`${settings}?connect=success`);
  } catch (err) {
    console.error("[mailbox oauth callback]", err);
    return NextResponse.redirect(`${settings}?connect=error`);
  }
}

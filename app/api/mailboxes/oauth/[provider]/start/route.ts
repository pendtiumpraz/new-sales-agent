import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";
import {
  appBaseUrl,
  authorizeUrl,
  isMailProvider,
  mailProviderConfigured,
  signState,
} from "@/lib/mail/oauth";

export const runtime = "nodejs";

// GET /api/mailboxes/oauth/{google|microsoft}/start (doc 32) → redirect to the
// provider consent screen. mailbox.connect-guarded; the user's session rides
// along so the callback knows which tenant/user to attach the mailbox to.
export async function GET(_req: Request, { params }: { params: { provider: string } }) {
  const guard = await requirePermission("mailbox.connect");
  if ("error" in guard) return guard.error;

  const provider = params.provider;
  if (!isMailProvider(provider)) {
    return NextResponse.json({ error: "provider tidak dikenal" }, { status: 400 });
  }
  if (!mailProviderConfigured(provider)) {
    const envHint = provider === "google" ? "GOOGLE_OAUTH_CLIENT_ID/SECRET" : "MICROSOFT_OAUTH_CLIENT_ID/SECRET";
    return NextResponse.json(
      { error: `OAuth ${provider} belum dikonfigurasi (isi ${envHint}).` },
      { status: 503 },
    );
  }

  const redirectUri = `${appBaseUrl()}/api/mailboxes/oauth/${provider}/callback`;
  return NextResponse.redirect(authorizeUrl(provider, redirectUri, signState(provider)));
}

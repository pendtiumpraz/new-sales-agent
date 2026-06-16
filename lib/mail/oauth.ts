// Mailbox OAuth scaffold (doc 32) — connect a user's own Gmail / Microsoft 365
// mailbox so the send worker can send AS them via SMTP XOAUTH2. We store only the
// refresh token (encrypted in sending_account.config_enc) and mint short-lived
// access tokens at send time.
//
// NULL-SAFE: with no client id/secret in env, mailProviderConfigured() is false
// and the connect buttons hide / the start route 503s — the app keeps working on
// the existing SMTP app-password path. Fill the env keys to turn this on.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type MailProvider = "google" | "microsoft";

interface ProviderDef {
  authUrl: () => string;
  tokenUrl: () => string;
  scopes: string[];
  smtp: { host: string; port: number; secure: boolean };
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  extraAuthParams?: Record<string, string>;
  accountType: string; // sending_account.type value
}

function msTenant(): string {
  return process.env.MICROSOFT_OAUTH_TENANT || "common";
}

const PROVIDERS: Record<MailProvider, ProviderDef> = {
  google: {
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    // https://mail.google.com/ is required for SMTP XOAUTH2; openid+email so we
    // can learn the connected address from the id_token.
    scopes: ["https://mail.google.com/", "openid", "email"],
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    clientId: () => process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    // access_type=offline + prompt=consent forces a refresh_token every time.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    accountType: "gmail_oauth",
  },
  microsoft: {
    authUrl: () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/token`,
    scopes: ["https://outlook.office.com/SMTP.Send", "offline_access", "openid", "email"],
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    clientId: () => process.env.MICROSOFT_OAUTH_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
    extraAuthParams: { prompt: "consent" },
    accountType: "ms_oauth",
  },
};

export function isMailProvider(p: string): p is MailProvider {
  return p === "google" || p === "microsoft";
}

export function mailProviderConfigured(p: MailProvider): boolean {
  const def = PROVIDERS[p];
  return Boolean(def.clientId() && def.clientSecret());
}

export function providerSmtp(p: MailProvider) {
  return PROVIDERS[p].smtp;
}

export function providerAccountType(p: MailProvider): string {
  return PROVIDERS[p].accountType;
}

/** Absolute base url for OAuth redirect uris. */
export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/** Build the provider consent url. */
export function authorizeUrl(p: MailProvider, redirectUri: string, state: string): string {
  const def = PROVIDERS[p];
  const params = new URLSearchParams({
    client_id: def.clientId() ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: def.scopes.join(" "),
    state,
    ...(def.extraAuthParams ?? {}),
  });
  return `${def.authUrl()}?${params.toString()}`;
}

interface TokenResult {
  refreshToken: string | null;
  accessToken: string;
  email: string | null;
}

async function tokenRequest(p: MailProvider, body: Record<string, string>): Promise<Record<string, string>> {
  const def = PROVIDERS[p];
  const res = await fetch(def.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: def.clientId() ?? "",
      client_secret: def.clientSecret() ?? "",
      ...body,
    }).toString(),
  });
  const json = (await res.json()) as Record<string, string>;
  if (!res.ok) {
    throw new Error(`token ${p} ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

/** Authorization-code → tokens + connected email. */
export async function exchangeCode(
  p: MailProvider,
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const j = await tokenRequest(p, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return {
    refreshToken: j.refresh_token ?? null,
    accessToken: j.access_token,
    email: emailFromIdToken(j.id_token),
  };
}

/** Refresh token → fresh access token (called at send time). */
export async function accessTokenFromRefresh(p: MailProvider, refreshToken: string): Promise<string> {
  const def = PROVIDERS[p];
  const j = await tokenRequest(p, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    // Microsoft requires the scope on refresh; Google ignores it.
    scope: def.scopes.join(" "),
  });
  return j.access_token;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
      upn?: string;
    };
    return payload.email ?? payload.preferred_username ?? payload.upn ?? null;
  } catch {
    return null;
  }
}

// ── CSRF state (HMAC-signed, short-lived) ───────────────────────────────────

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  return process.env.AUTH_SECRET || "dev-only-secret";
}

export function signState(provider: MailProvider): string {
  const payload = `${provider}.${Date.now()}.${randomBytes(8).toString("hex")}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyState(state: string, provider: MailProvider): boolean {
  try {
    const [payloadB, sig] = state.split(".");
    if (!payloadB || !sig) return false;
    const payload = Buffer.from(payloadB, "base64url").toString("utf8");
    const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const [prov, ts] = payload.split(".");
    return prov === provider && Date.now() - Number(ts) < STATE_TTL_MS;
  } catch {
    return false;
  }
}

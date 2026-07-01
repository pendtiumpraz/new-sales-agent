// Central secret/config resolver — DB-first (superadmin-managed) with env fallback.
//
// Secrets live encrypted (AES-256-GCM) in the platform_setting_v2 table under their
// env key name; the superadmin console edits them (see /api/superadmin/secrets). A
// single master key `SECRETS_KEY` (env) encrypts/decrypts — the ONLY secret that must
// stay in env, alongside the DB connection + AUTH_SECRET (chicken-and-egg).
//
// Resolution order for getSecret(key):  memory cache → DB (decrypt) → process.env[key].
// So you can set a value in the console OR leave it in env; the console value wins.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

import { platformRepo } from "@/modules/superadmin/repo";

// ── catalog: which keys are manageable + how the UI shows them ────────────────
export interface SecretDef {
  key: string;
  label: string;
  category: "AI" | "Payment" | "Email" | "Enrichment" | "Ingest & WA" | "Jobs" | "Flag & Config";
  secret: boolean; // true → value masked in the UI + never returned in full to the client
}

export const SECRET_CATALOG: SecretDef[] = [
  // AI
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", category: "AI", secret: true },
  { key: "DEEPSEEK_BASE_URL", label: "DeepSeek Base URL", category: "AI", secret: false },
  { key: "AI_GATEWAY_API_KEY", label: "AI Gateway Key", category: "AI", secret: true },
  { key: "AI_MODEL", label: "Default AI Model", category: "AI", secret: false },
  // Payment
  { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key", category: "Payment", secret: true },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret", category: "Payment", secret: true },
  { key: "STRIPE_PRICE_STARTER", label: "Stripe Price · Starter", category: "Payment", secret: false },
  { key: "STRIPE_PRICE_GROWTH", label: "Stripe Price · Growth", category: "Payment", secret: false },
  { key: "STRIPE_PRICE_ENTERPRISE", label: "Stripe Price · Enterprise", category: "Payment", secret: false },
  { key: "MIDTRANS_SERVER_KEY", label: "Midtrans Server Key", category: "Payment", secret: true },
  { key: "MIDTRANS_IS_PRODUCTION", label: "Midtrans Production? (true/false)", category: "Payment", secret: false },
  // Email
  { key: "GMAIL_USER", label: "Gmail User", category: "Email", secret: false },
  { key: "GMAIL_APP_PASSWORD", label: "Gmail App Password", category: "Email", secret: true },
  { key: "RESEND_API_KEY", label: "Resend API Key", category: "Email", secret: true },
  { key: "RESEND_WEBHOOK_SECRET", label: "Resend Webhook Secret", category: "Email", secret: true },
  { key: "GOOGLE_OAUTH_CLIENT_ID", label: "Google OAuth Client ID", category: "Email", secret: false },
  { key: "GOOGLE_OAUTH_CLIENT_SECRET", label: "Google OAuth Client Secret", category: "Email", secret: true },
  { key: "MICROSOFT_OAUTH_CLIENT_ID", label: "Microsoft OAuth Client ID", category: "Email", secret: false },
  { key: "MICROSOFT_OAUTH_CLIENT_SECRET", label: "Microsoft OAuth Client Secret", category: "Email", secret: true },
  { key: "MICROSOFT_OAUTH_TENANT", label: "Microsoft OAuth Tenant", category: "Email", secret: false },
  { key: "EMAIL_FROM_NAME", label: "Email From Name", category: "Email", secret: false },
  { key: "EMAIL_HOURLY_CAP", label: "Email Hourly Cap", category: "Email", secret: false },
  // Enrichment
  { key: "HUNTER_API_KEY", label: "Hunter.io API Key", category: "Enrichment", secret: true },
  // Ingest & WA
  { key: "LINKEDIN_INGEST_TOKEN", label: "Ingest Token (platform)", category: "Ingest & WA", secret: true },
  { key: "LINKEDIN_INGEST_TENANT", label: "Ingest Default Tenant", category: "Ingest & WA", secret: false },
  { key: "WA_GATEWAY_TOKEN", label: "WA Gateway Token", category: "Ingest & WA", secret: true },
  { key: "WAHA_API_KEY", label: "WAHA API Key", category: "Ingest & WA", secret: true },
  { key: "WAHA_BASE_URL", label: "WAHA Base URL", category: "Ingest & WA", secret: false },
  { key: "WAHA_SESSION", label: "WAHA Session", category: "Ingest & WA", secret: false },
  // Jobs
  { key: "INNGEST_EVENT_KEY", label: "Inngest Event Key", category: "Jobs", secret: true },
  { key: "INNGEST_SIGNING_KEY", label: "Inngest Signing Key", category: "Jobs", secret: true },
  // Flags & config
  { key: "AUTO_REPLY_AUTOSEND", label: "Auto-reply Autosend (1/0)", category: "Flag & Config", secret: false },
  { key: "AUTO_REPLY_CONFIDENCE", label: "Auto-reply Confidence", category: "Flag & Config", secret: false },
  { key: "AUTOPILOT_ENABLED", label: "Autopilot Enabled (1/0)", category: "Flag & Config", secret: false },
  { key: "WA_AUTO_REPLY", label: "WA Auto-reply (1/0)", category: "Flag & Config", secret: false },
  { key: "CREDIT_ENFORCED", label: "AI Credit Enforced (1/0)", category: "Flag & Config", secret: false },
  { key: "QUOTA_ALERT_THRESHOLD", label: "Quota Alert Threshold", category: "Flag & Config", secret: false },
  { key: "QUOTA_DEFAULT_TOKENS_PER_USER", label: "Quota Default Tokens/User", category: "Flag & Config", secret: false },
  { key: "APP_URL", label: "App URL", category: "Flag & Config", secret: false },
];

const MANAGED = new Set(SECRET_CATALOG.map((s) => s.key));
const STORE_PREFIX = "sec."; // platform_setting_v2 key namespace, so secrets don't collide with plain settings

// ── AES-256-GCM (master key = SECRETS_KEY) ───────────────────────────────────
function masterKey(): Buffer | null {
  const raw = process.env.SECRETS_KEY;
  if (!raw) return null;
  return createHash("sha256").update(raw).digest(); // 32 bytes
}
function encryptValue(plain: string): string | null {
  const k = masterKey();
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
function decryptValue(blob: string): string | null {
  const k = masterKey();
  if (!k) return null;
  try {
    const [v, ivB, tagB, encB] = blob.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB, "base64"));
    d.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([d.update(Buffer.from(encB, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── cache (avoid a DB read per call; secrets change rarely) ───────────────────
interface CacheEntry {
  value: string | undefined;
  at: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

/** Resolve a managed key: DB (decrypted) first, else process.env. Cached 60s. */
export async function getSecret(key: string): Promise<string | undefined> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  let value: string | undefined;
  if (MANAGED.has(key)) {
    try {
      const row = await platformRepo.getSetting(STORE_PREFIX + key);
      if (row?.value) {
        const dec = decryptValue(row.value);
        if (dec != null && dec !== "") value = dec;
      }
    } catch {
      // DB unavailable → fall through to env
    }
  }
  if (value === undefined) value = process.env[key] || undefined;
  cache.set(key, { value, at: now });
  return value;
}

export async function getSecretBool(key: string): Promise<boolean> {
  const v = (await getSecret(key))?.toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
export async function getSecretNumber(key: string, fallback = 0): Promise<number> {
  const n = Number(await getSecret(key));
  return Number.isFinite(n) ? n : fallback;
}

/** Superadmin set/clear. Empty value clears the DB override (→ env fallback). Requires SECRETS_KEY. */
export async function setSecret(key: string, value: string): Promise<void> {
  if (!MANAGED.has(key)) throw new Error("Unknown secret key");
  if (!masterKey()) throw new Error("SECRETS_KEY belum di-set di env — tak bisa mengenkripsi secret.");
  const trimmed = value.trim();
  if (!trimmed) {
    await platformRepo.setSetting(STORE_PREFIX + key, ""); // cleared → env fallback
  } else {
    const enc = encryptValue(trimmed);
    if (!enc) throw new Error("Enkripsi gagal");
    await platformRepo.setSetting(STORE_PREFIX + key, enc);
  }
  cache.delete(key);
}

export interface SecretStatus extends SecretDef {
  setInDb: boolean; // an encrypted value is stored
  hasEnv: boolean; // process.env has a value (fallback)
  preview: string; // masked preview of the effective value ("" if unset)
}

/** For the superadmin UI — never returns full secret values. */
export async function listSecretStatus(): Promise<SecretStatus[]> {
  const out: SecretStatus[] = [];
  for (const def of SECRET_CATALOG) {
    let setInDb = false;
    let effective: string | undefined;
    try {
      const row = await platformRepo.getSetting(STORE_PREFIX + def.key);
      if (row?.value) {
        const dec = decryptValue(row.value);
        if (dec) {
          setInDb = true;
          effective = dec;
        }
      }
    } catch {
      /* ignore */
    }
    const envVal = process.env[def.key] || undefined;
    if (effective === undefined) effective = envVal;
    const preview =
      !effective ? "" : def.secret ? maskSecret(effective) : effective.length > 48 ? effective.slice(0, 45) + "…" : effective;
    out.push({ ...def, setInDb, hasEnv: !!envVal, preview });
  }
  return out;
}

function maskSecret(v: string): string {
  if (v.length <= 6) return "••••";
  return v.slice(0, 3) + "••••" + v.slice(-2);
}

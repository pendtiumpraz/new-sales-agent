# Environment reference

Single source of truth for every env var. The platform is built **scaffold-first
and null-safe**: with a key absent, that feature stays inert and the rest of the
app runs. Fill a group → that feature turns on, no code changes.

`.env.local` is the file Next reads in dev (gitignored). On Vercel, set the same
keys in Project → Settings → Environment Variables.

Legend: **Req** = required for the app to run · **Feature** = unlocks a scaffold.

## Core (Req)

| Key | What | Notes |
|-----|------|-------|
| `POSTGRES_URL` | Neon Postgres (pooled) | from Vercel/Neon |
| `POSTGRES_URL_NON_POOLING` | Direct conn for DDL/migrations | from Neon |
| `AUTH_SECRET` | Auth.js JWT secret + crypto seed | `openssl rand -base64 32` |
| `NEXT_PUBLIC_AI_PROVIDER` | `mock` \| `deepseek` | `mock` = offline heuristics |

## RLS enforcement (Feature — security)

RLS policies exist but aren't enforced while the app connects as a BYPASSRLS
role. Create a dedicated non-bypass role and point the app at it.

| Key | What |
|-----|------|
| `APP_POSTGRES_URL` | Conn string for the `app_user` role (preferred by `lib/db/client.ts`) |
| `APP_POSTGRES_URL_NON_POOLING` | Same, direct |

See `drizzle/rls/` (create-app-role.sql, enable-rls.sql) + [GO-LIVE](./GO-LIVE.md).

## AI registry + metering (doc 24)

| Key | What | Notes |
|-----|------|-------|
| `DEEPSEEK_API_KEY` | DeepSeek platform key | server-side; without it → mock |
| `DEEPSEEK_BASE_URL` | DeepSeek endpoint override | optional |
| `ANTHROPIC_API_KEY` | Anthropic platform key | for Anthropic models in the registry |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (legacy routes) | optional |
| `AI_KEY_SECRET` | AES key for tenant BYOK keys | falls back to `AUTH_SECRET` |

Per-tenant active model + BYOK keys are configured in-app (Settings → AI), stored
encrypted. Platform keys live here.

## Stripe billing + close links (doc 30, 35)

| Key | What | Where |
|-----|------|-------|
| `STRIPE_SECRET_KEY` | Stripe secret | dashboard → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | `stripe listen` / dashboard webhook |
| `STRIPE_PRICE_STARTER` | Price id per plan | dashboard → Products |
| `STRIPE_PRICE_GROWTH` | " | |
| `STRIPE_PRICE_ENTERPRISE` | " | |
| `APP_BASE_URL` | Base url for redirects/links | e.g. `http://localhost:3000` |

## Inngest background jobs (doc 31)

| Key | What | Notes |
|-----|------|-------|
| `INNGEST_EVENT_KEY` | send events | production |
| `INNGEST_SIGNING_KEY` | verify serve | production |
| `INNGEST_DEV` | `1` forces dev mode | default: dev when `NODE_ENV!=production` |

Drives the crons: cadence (/15m), send-queue (/5m), upsell (daily), auto-reply (/10m).

## Mailbox OAuth — Gmail / MS 365 (doc 32)

| Key | What |
|-----|------|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud OAuth client |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | Azure app registration |
| `MICROSOFT_OAUTH_TENANT` | `common` or a tenant id |

Redirect URIs: `<APP_BASE_URL>/api/mailboxes/oauth/{google|microsoft}/callback`.

## Platform ESP — Resend (doc 33)

| Key | What |
|-----|------|
| `RESEND_API_KEY` | Resend API key (verified domain) |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for bounce/complaint webhook |

## WhatsApp — WAHA (doc 34)

| Key | What |
|-----|------|
| `WAHA_BASE_URL` | WAHA server url |
| `WAHA_API_KEY` | WAHA `X-Api-Key` |
| `WAHA_SESSION` | session name (default `default`) |

## SMTP app-password mailbox (legacy/env — doc 23)

Per-user SMTP is connected in-app (Settings → Mailboxes). These env vars are only
the old single-mailbox demo path.

| Key | What |
|-----|------|
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | demo SMTP creds |
| `EMAIL_FROM_NAME` / `EMAIL_HOURLY_CAP` | demo send config |

## Auto-reply + escalation (doc 36)

| Key | What | Default |
|-----|------|---------|
| `AUTO_REPLY_AUTOSEND` | `1` to actually auto-send | off → escalate-only (safe) |
| `AUTO_REPLY_CONFIDENCE` | auto-send threshold 0..1 | `0.7` |

## Acquisition / misc

| Key | What |
|-----|------|
| `LINKEDIN_INGEST_TOKEN` | token for `/api/ingest` (extension/MCP, no session) |
| `LINKEDIN_INGEST_TENANT` | tenant the ingest token maps to |
| `HUNTER_API_KEY` | email enrichment (optional) |
| `CRON_SECRET` | guard for any cron endpoints (optional) |
| `QUOTA_DEFAULT_TOKENS_PER_USER`, `QUOTA_ALERT_THRESHOLD` | metering hints |

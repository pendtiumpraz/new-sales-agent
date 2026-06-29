import { drizzle } from "drizzle-orm/vercel-postgres";
import { createPool, sql as defaultSql } from "@vercel/postgres";

import * as legacySchema from "./schema";
// Rebuild (Sainskerta Loop) module tables live under modules/<domain>/schema.ts
// and are merged into the same drizzle client so both worlds share one connection.
import * as moduleSchema from "@/modules";

const schema = { ...legacySchema, ...moduleSchema };

/**
 * Find a Postgres connection string in process.env, tolerating Vercel
 * Marketplace's "Environment Variables Prefix" feature.
 *
 * When you connect a Neon database to a Vercel project through the Marketplace,
 * you can set a custom prefix (e.g. "MAIRA") which produces env var names like
 * MAIRA_POSTGRES_URL instead of the canonical POSTGRES_URL. We scan for both.
 *
 * Preference order — **pooled first** for runtime serverless calls. Non-pooled
 * URLs trigger @vercel/postgres 'invalid_connection_string' at request time.
 * Migrations (in drizzle.config.ts) keep the inverse preference.
 *
 *  1. Canonical POSTGRES_URL (pooler endpoint — what serverless needs)
 *  2. Any *_POSTGRES_URL prefixed variant
 *  3. Canonical POSTGRES_URL_NON_POOLING (last-resort fallback for local dev)
 *  4. Any *_POSTGRES_URL_NON_POOLING prefixed variant
 */
function findConnectionString(): string | undefined {
  // Prefer a dedicated runtime role that RESPECTS RLS (no BYPASSRLS) so tenant
  // isolation policies (drizzle/rls/enable-rls.sql) actually apply (doc 19,
  // AUDIT #3). neondb_owner has BYPASSRLS, so connecting as it would SKIP RLS
  // entirely and the policies would no-op — every query would silently see all
  // tenants. APP_POSTGRES_URL must point at the NOBYPASSRLS `app_user` role
  // created via drizzle/rls/create-app-role.sql.
  //
  // FALLBACK (owner URL) when APP_POSTGRES_URL is unset: the app still boots, but
  // it connects as the OWNER, which BYPASSES RLS — so DB-level isolation is OFF
  // and app-level `eq(tenantId)` filtering in the repos is the SOLE control. This
  // is the demo/dev default; a real multi-tenant deploy MUST set APP_POSTGRES_URL.
  // `usingRlsRole()` below reports which path is live.
  if (process.env.APP_POSTGRES_URL) return process.env.APP_POSTGRES_URL;
  if (process.env.APP_POSTGRES_URL_NON_POOLING)
    return process.env.APP_POSTGRES_URL_NON_POOLING;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string" || value.length === 0) continue;
    // Match _POSTGRES_URL but NOT _POSTGRES_URL_NON_POOLING (the $ anchor
    // handles it naturally since "...URL" !== "...URL_NON_POOLING").
    if (/_POSTGRES_URL$/.test(key)) return value;
  }
  if (process.env.POSTGRES_URL_NON_POOLING) return process.env.POSTGRES_URL_NON_POOLING;
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (/_POSTGRES_URL_NON_POOLING$/.test(key)) return value;
  }
  return undefined;
}

const connectionString = findConnectionString();

// Build a pool against the resolved connection string. If none is found, fall
// back to `@vercel/postgres`'s default `sql` client — calls degrade to seed
// data via hasDb() == false so the demo still boots without a database.
const client = connectionString
  ? createPool({ connectionString })
  : defaultSql;

// Singleton drizzle client — safe to import from any route handler / server
// component. The underlying @vercel/postgres connection is pooled.
export const db = drizzle(client, { schema });

// True when a Postgres credential is present at runtime (either canonical or
// prefixed via the Marketplace).
export function hasDb(): boolean {
  return Boolean(connectionString);
}

// True when the runtime connection uses the dedicated NOBYPASSRLS `app_user`
// role (APP_POSTGRES_URL[_NON_POOLING]) — i.e. when DB-level RLS is actually in
// force. False means we fell back to the owner URL, which BYPASSES RLS and leaves
// app-level `eq(tenantId)` repo filtering as the only tenant control (AUDIT #3).
// The two-tenant isolation test (scripts/test-tenant-isolation.mts) asserts this
// is true before it can meaningfully verify isolation.
export function usingRlsRole(): boolean {
  return Boolean(
    process.env.APP_POSTGRES_URL || process.env.APP_POSTGRES_URL_NON_POOLING,
  );
}

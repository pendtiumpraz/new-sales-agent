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
  // isolation policies actually apply (doc 19). neondb_owner has BYPASSRLS, so
  // using it would skip RLS. Falls back to the owner credential if unset.
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

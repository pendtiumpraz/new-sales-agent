// Additive migration: create the quota_grant table (top-up packs) + RLS + grants.
//   run: npx tsx scripts/migrate-quota-grant.mts
// Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). Owner connection required.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@vercel/postgres";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const eq = l.indexOf("=");
    if (eq === -1) continue;
    const k = l.slice(0, eq).trim();
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) { console.log("RESULT=NO_DB_URL"); process.exit(1); }

// Derive the app role from APP_POSTGRES_URL so we can GRANT the new table to it
// (new tables are owner-only until granted). Sanitize — role names can't be params.
let appRole = "";
try {
  const au = process.env.APP_POSTGRES_URL || process.env.APP_POSTGRES_URL_NON_POOLING;
  if (au) appRole = new URL(au).username.replace(/[^a-zA-Z0-9_]/g, "");
} catch {}

const client = createClient({ connectionString: url });
await client.connect();
try {
  await client.query(`
    create table if not exists quota_grant (
      id text primary key,
      tenant_id text not null,
      metric text not null,
      amount integer not null,
      source text not null default 'superadmin',
      provider text,
      external_ref text,
      status text not null default 'active',
      note text,
      created_at timestamptz not null default now(),
      expires_at timestamptz,
      deleted_at timestamptz
    )`);
  await client.query(`create index if not exists quota_grant_tenant_idx on quota_grant (tenant_id)`);
  await client.query(`create index if not exists quota_grant_tenant_metric_idx on quota_grant (tenant_id, metric)`);

  // RLS — same tenant-isolation shape as usage_counter (drizzle/rls/enable-rls.sql).
  await client.query(`alter table quota_grant enable row level security`);
  await client.query(`alter table quota_grant force row level security`);
  await client.query(`drop policy if exists tenant_isolation on quota_grant`);
  await client.query(`
    create policy tenant_isolation on quota_grant
      using (tenant_id = current_setting('app.tenant_id', true) or current_setting('app.role', true) = 'superadmin')
      with check (tenant_id = current_setting('app.tenant_id', true) or current_setting('app.role', true) = 'superadmin')`);

  if (appRole) {
    await client.query(`grant select, insert, update, delete on quota_grant to ${appRole}`);
    console.log(`GRANTED quota_grant to role "${appRole}"`);
  } else {
    console.log("WARN: no APP_POSTGRES_URL role derived — grant skipped (owner-only until granted).");
  }
  console.log("OK: quota_grant table + indexes + RLS ready.");
} finally {
  await client.end();
}

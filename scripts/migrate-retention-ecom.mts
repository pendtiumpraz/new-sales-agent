// Additive migration runner for 0044_retention_ecommerce_crm.sql — creates the
// `retention_enrollment` table (+ indexes + RLS + tenant_isolation policy) and
// GRANTs it to the NOBYPASSRLS app role. Ecommerce order→CRM conversion needs no
// schema change (reuses existing tables), so this is the only DDL.
//   run: npx tsx scripts/migrate-retention-ecom.mts
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

// Read the canonical DDL from the .sql file and split into statements. The file
// only contains simple statements (no DO blocks / functions), so a strip-comments
// + split-on-';' is safe — no statement carries an inner semicolon.
const sqlPath = resolve(process.cwd(), "drizzle/migrations/0044_retention_ecommerce_crm.sql");
const raw = readFileSync(sqlPath, "utf8");
const statements = raw
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const client = createClient({ connectionString: url });
await client.connect();
try {
  for (const stmt of statements) {
    await client.query(stmt);
  }
  console.log(`OK: applied ${statements.length} statement(s) from 0044_retention_ecommerce_crm.sql`);

  if (appRole) {
    await client.query(`grant select, insert, update, delete on retention_enrollment to ${appRole}`);
    console.log(`GRANTED retention_enrollment to role "${appRole}"`);
  } else {
    console.log("WARN: no APP_POSTGRES_URL role derived — grant skipped (owner-only until granted).");
  }
  console.log("OK: retention_enrollment table + indexes + RLS ready.");
} finally {
  await client.end();
}

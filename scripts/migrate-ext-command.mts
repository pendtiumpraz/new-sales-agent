// Additive migration runner for 0050_extension_command.sql — creates the
// `extension_command` table (+ indexes + RLS + tenant_isolation policy) and GRANTs
// it to the NOBYPASSRLS app role (new tables are owner-only until granted).
//   run: npx tsx scripts/migrate-ext-command.mts
// Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). Owner connection required.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@vercel/postgres";

// The Drizzle CLI auto-loads .env.local but plain tsx does not — load it by hand.
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

// Derive the app role from APP_POSTGRES_URL so we can GRANT the new table to it.
// Sanitize — role names can't be bound as parameters.
let appRole = "";
try {
  const au = process.env.APP_POSTGRES_URL || process.env.APP_POSTGRES_URL_NON_POOLING;
  if (au) appRole = new URL(au).username.replace(/[^a-zA-Z0-9_]/g, "");
} catch {}

// The .sql file has only simple statements (no DO blocks / functions), so a
// strip-comments + split-on-';' is safe — no statement carries an inner semicolon.
const sqlPath = resolve(process.cwd(), "drizzle/migrations/0050_extension_command.sql");
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
  console.log(`OK: applied ${statements.length} statement(s) from 0050_extension_command.sql`);

  if (appRole) {
    await client.query(`grant select, insert, update, delete on extension_command to ${appRole}`);
    console.log(`GRANTED extension_command to role "${appRole}"`);
  } else {
    console.log("WARN: no APP_POSTGRES_URL role derived — grant skipped (owner-only until granted).");
  }

  // Verify the table landed with its columns.
  const { rows } = await client.query(
    `select column_name from information_schema.columns where table_name = 'extension_command' order by ordinal_position`,
  );
  console.log("VERIFY extension_command columns:", rows.map((r: { column_name: string }) => r.column_name).join(", "));
} finally {
  await client.end();
}

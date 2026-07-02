// Additive migration runner for 0051_discovery_job_stats.sql — adds
// `companies_created` + `contacts_created` (integer, default 0) to the EXISTING
// `discovery_job` table so each extension-crawl flush records how many companies +
// contacts it produced (Enrichment "Riwayat"). No new table → no GRANT needed
// (discovery_job is already RLS-enabled + granted to the app role).
//   run: npx tsx scripts/migrate-discovery-stats.mts
// Idempotent (ADD COLUMN IF NOT EXISTS). Owner connection required.
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

// The .sql file has only simple ALTER statements (no DO blocks / functions), so a
// strip-comments + split-on-';' is safe — no statement carries an inner semicolon.
const sqlPath = resolve(process.cwd(), "drizzle/migrations/0051_discovery_job_stats.sql");
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
  console.log(`OK: applied ${statements.length} statement(s) from 0051_discovery_job_stats.sql`);

  // Verify the new columns landed.
  const { rows } = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'discovery_job'
       and column_name in ('companies_created', 'contacts_created')
     order by column_name`,
  );
  console.log("VERIFY discovery_job new columns:", rows.map((r: { column_name: string }) => r.column_name).join(", ") || "(none)");
} finally {
  await client.end();
}

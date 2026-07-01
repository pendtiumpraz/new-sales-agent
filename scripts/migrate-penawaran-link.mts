// Additive migration: link a quote to the CRM graph (contact_id + deal_id on the
// `quote` table). Mirrors scripts/migrate-quota-grant.mts.
//   run: npx tsx scripts/migrate-penawaran-link.mts
// Idempotent (ADD COLUMN IF NOT EXISTS). Owner connection required.
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

const client = createClient({ connectionString: url });
await client.connect();
try {
  await client.query(`ALTER TABLE "quote" ADD COLUMN IF NOT EXISTS "contact_id" text`);
  await client.query(`ALTER TABLE "quote" ADD COLUMN IF NOT EXISTS "deal_id" text`);

  // Verify the two link columns now exist.
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'quote' AND column_name IN ('contact_id','deal_id')
       ORDER BY column_name`,
  );
  const present = rows.map((r: { column_name: string }) => r.column_name);
  console.log(`OK: quote.contact_id + quote.deal_id ready. present=[${present.join(",")}]`);
  console.log(`RESULT=OK`);
} finally {
  await client.end();
}

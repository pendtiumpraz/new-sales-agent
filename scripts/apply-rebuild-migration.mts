// Apply a rebuild migration file to Neon SAFELY (additive-only, transactional).
// This DB has no drizzle migration tracking (built via db:push) and extra
// live-only tables, so db:migrate/db:push are unsafe — we apply the generated
// SQL directly. Guard: ABORT on any destructive DDL (drop/alter/truncate) so a
// non-additive migration always stops for human review (user policy 2026-06-28).
//
//   npx tsx scripts/apply-rebuild-migration.mts drizzle/migrations/0029_xxx.sql
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

const file = process.argv[2];
if (!file) { console.log("USAGE: apply-rebuild-migration.mts <migration.sql>"); process.exit(1); }
const sql = readFileSync(resolve(process.cwd(), file), "utf8");
const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

// Additive guard — only CREATE is allowed. Destructive DDL aborts (won't match
// the "deleted_at" column name; we require the table/column keyword).
const DESTRUCTIVE = /\b(drop\s+table|drop\s+column|alter\s+table|alter\s+column|truncate)\b/i;

// Strip SQL line-comments (everything from `--` to end-of-line, incl. inline
// trailing comments) and normalize whitespace before matching (mirror
// scripts/apply-additive-alter.mts). Without this, a `-- drop table …` comment
// would FALSE-trigger the abort, and DDL split across odd whitespace/newlines
// could read differently to the regex than to Postgres. We match the real,
// executable SQL only.
const stripComments = (s: string) =>
  s
    .split(/\r?\n/)
    .map((ln) => ln.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const bad = statements.find((s) => DESTRUCTIVE.test(stripComments(s)));
if (bad) {
  console.log("ABORT=destructive statement detected (needs human review):\n" + bad.slice(0, 220));
  process.exit(2);
}

const created = [...sql.matchAll(/CREATE TABLE "([a-z_0-9]+)"/g)].map((m) => m[1]);
const client = createClient({ connectionString: url });
try {
  await client.connect();
  await client.query("BEGIN");
  let n = 0;
  for (const st of statements) { await client.query(st); n++; }
  await client.query("COMMIT");
  console.log("APPLIED=" + file + " statements=" + n);
  if (created.length) {
    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema='public' and table_name = any($1::text[]) order by table_name",
      [created],
    );
    console.log("TABLES_NOW_PRESENT=" + rows.length + "/" + created.length + " -> " + rows.map((r: any) => r.table_name).join(","));
  }
  const { rows: cnt } = await client.query("select count(*)::int as c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  console.log("LIVE_TABLE_COUNT=" + cnt[0].c);
} catch (e: any) {
  try { await client.query("ROLLBACK"); } catch {}
  console.log("RESULT=ERROR (rolled back, no change): " + (e?.message || String(e)));
  process.exit(1);
} finally {
  try { await client.end(); } catch {}
}

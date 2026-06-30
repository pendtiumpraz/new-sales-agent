// Apply an ADDITIVE migration that contains idempotent ALTER ... ADD COLUMN IF
// NOT EXISTS (and CREATE [UNIQUE] INDEX IF NOT EXISTS / CREATE TABLE IF NOT
// EXISTS) to Neon. The general applier (apply-rebuild-migration.mts) deliberately
// ABORTS on any `alter table` — correct as a blanket guard, but it also blocks a
// genuinely safe additive `ADD COLUMN IF NOT EXISTS`. This script is the narrow,
// explicit path for those: every statement MUST be one of the allow-listed
// additive+idempotent shapes, else it aborts. Adding a NULLable column is
// non-rewriting/instant in Postgres; IF NOT EXISTS makes a re-run a no-op.
//
//   npx tsx scripts/apply-additive-alter.mts drizzle/migrations/0039_xxx.sql --dry-run
//   npx tsx scripts/apply-additive-alter.mts drizzle/migrations/0039_xxx.sql
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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.log("USAGE: apply-additive-alter.mts <migration.sql> [--dry-run]"); process.exit(1); }

const sql = readFileSync(resolve(process.cwd(), file), "utf8");
const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

// Hard forbids anywhere — destructive / rewriting / non-idempotent shapes.
const FORBIDDEN = /\b(drop\s+(table|column|index|constraint)|truncate|alter\s+column|rename|set\s+not\s+null|using\s+.*::)\b/i;
// Allow-list: each statement must START with one of these idempotent additive shapes.
const ALLOWED = [
  /^alter\s+table\s+"?\w+"?\s+add\s+column\s+if\s+not\s+exists\b/i,
  /^create\s+(unique\s+)?index\s+if\s+not\s+exists\b/i,
  /^create\s+table\s+if\s+not\s+exists\b/i,
];

// Strip SQL line-comments (-- …) before matching: a statement chunk may carry a
// leading comment block (Postgres ignores it, but our allow-list checks the
// statement's leading keyword).
const stripComments = (s: string) =>
  s.split(/\r?\n/).filter((ln) => !ln.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();

const offending: string[] = [];
for (const st of statements) {
  const norm = stripComments(st);
  if (!norm) continue; // comment-only chunk
  const allowed = ALLOWED.some((re) => re.test(norm));
  if (!allowed || FORBIDDEN.test(norm)) offending.push(norm.slice(0, 160));
}
if (offending.length) {
  console.log("ABORT=non-additive / non-idempotent statement(s) (needs human review):");
  for (const o of offending) console.log("  ✗ " + o);
  process.exit(2);
}

console.log(`GUARD_OK=${statements.length} statement(s) all additive+idempotent`);
for (const st of statements) console.log("  ✓ " + st.replace(/\s+/g, " ").trim().slice(0, 140));

if (dryRun) { console.log("DRY_RUN=ok (nothing applied)"); process.exit(0); }

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) { console.log("RESULT=NO_DB_URL"); process.exit(1); }

const client = createClient({ connectionString: url });
try {
  await client.connect();
  await client.query("BEGIN");
  let n = 0;
  for (const st of statements) { await client.query(st); n++; }
  await client.query("COMMIT");
  console.log("APPLIED=" + file + " statements=" + n);
} catch (e: any) {
  try { await client.query("ROLLBACK"); } catch {}
  console.log("RESULT=ERROR (rolled back, no change): " + (e?.message || String(e)));
  process.exit(1);
} finally {
  try { await client.end(); } catch {}
}

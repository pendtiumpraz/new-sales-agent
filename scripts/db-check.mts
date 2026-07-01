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
console.log("DB host:", (() => { try { return new URL(url!).host; } catch { return "?"; } })());
const c = createClient({ connectionString: url });
await c.connect();
async function n(t: string) {
  try { const r = await c.query(`select count(*)::int n from "${t}"`); return String(r.rows[0].n); }
  catch (e) { return "MISSING (" + String((e as Error).message).slice(0, 50) + ")"; }
}
for (const t of ["app_user", "tenant", "membership", "plan", "usage_counter", "quota_grant", "contact", "workspace_v2", "vertical"]) {
  console.log(("  " + t).padEnd(18), await n(t));
}
await c.end();
process.exit(0);

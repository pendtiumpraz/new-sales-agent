// Does the APP role (app_user) actually SEE the seeded data under RLS? This is what
// the deployed app uses. permission-denied → missing GRANTs (new DB not bootstrapped).
// 0 rows → RLS context issue. N rows → app_user is fine (empty UI = wrong tenant).
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
const appUrl = process.env.APP_POSTGRES_URL_NON_POOLING || process.env.APP_POSTGRES_URL;
if (!appUrl) { console.log("NO APP_POSTGRES_URL — the app would fall back to owner/mock."); process.exit(0); }
console.log("app role:", (() => { try { return new URL(appUrl).username; } catch { return "?"; } })());

const c = createClient({ connectionString: appUrl });
await c.connect();
async function test(label: string, sql: string) {
  try { const r = await c.query(sql); console.log("  " + label.padEnd(28), JSON.stringify(r.rows[0])); }
  catch (e) { console.log("  " + label.padEnd(28), "ERROR:", String((e as Error).message).slice(0, 80)); }
}
// No tenant context set → RLS should hide tenant rows (expect 0 or permission-denied).
await test("contact (no ctx)", `select count(*)::int n from contact`);
// With a seed_t_demo context (what the app sets per request via withTenant).
await c.query(`select set_config('app.tenant_id','seed_t_demo',false), set_config('app.user_id','seed_u_demo',false), set_config('app.role','member',false)`);
await test("contact (seed_t_demo ctx)", `select count(*)::int n from contact`);
await test("membership (seed_t_demo ctx)", `select count(*)::int n from membership`);
await test("workspace_v2 (demo ctx)", `select count(*)::int n from workspace_v2`);
await c.end();
process.exit(0);

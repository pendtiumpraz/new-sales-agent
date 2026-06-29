// Demo seed for the rebuild's Module 1 tables. DELETABLE by design:
//   seed:   npx tsx scripts/rebuild-demo-seed.mts
//   remove: npx tsx scripts/rebuild-demo-seed.mts --unseed   (hard-delete all seed_* rows)
// Every seeded row uses an id prefixed "seed_" so it can be removed cleanly.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
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

function hashPassword(pw: string): Promise<string> {
  return new Promise((res, rej) => {
    const salt = randomBytes(16);
    scryptCb(pw, salt, 64, { N: 16384 }, (e, d) =>
      e ? rej(e) : res(`scrypt$16384$${salt.toString("hex")}$${(d as Buffer).toString("hex")}`),
    );
  });
}

const unseed = process.argv.includes("--unseed");
const client = createClient({ connectionString: url });
await client.connect();
try {
  if (unseed) {
    const byId = ["app_user", "vertical", "module_catalog", "membership", "tenant", "tenant_entitlement_v2", "usage_counter", "onboarding_state", "audit_log_v2"];
    let total = 0;
    for (const t of byId) {
      try { const r = await client.query(`delete from "${t}" where id like 'seed_%'`); total += r.rowCount ?? 0; } catch {}
    }
    // user_theme + onboarding_state are keyed by user_id / tenant_id
    try { const r = await client.query(`delete from user_theme where user_id like 'seed_%'`); total += r.rowCount ?? 0; } catch {}
    try { const r = await client.query(`delete from onboarding_state where tenant_id like 'seed_%'`); total += r.rowCount ?? 0; } catch {}
    console.log(`UNSEEDED: hard-deleted ${total} seed_* rows.`);
  } else {
    const pw = await hashPassword("demo1234");
    await client.query(
      `insert into app_user (id,name,email,password_hash,is_superadmin) values ('seed_superadmin','Super Admin','superadmin@demo.local',$1,true) on conflict (email) do nothing`,
      [pw],
    );
    const verticals: [string, string, string, string[]][] = [
      ["seed_v_hr", "hr", "HR / Rekrutmen", ["crm", "inbox"]],
      ["seed_v_sales", "sales", "Sales", ["crm", "inbox", "workspace", "enrichment", "pipeline"]],
      ["seed_v_other", "other", "Lainnya", []],
    ];
    for (const [id, key, name, mods] of verticals) {
      await client.query(
        `insert into vertical (id,key,name,default_modules) values ($1,$2,$3,$4::jsonb) on conflict (key) do nothing`,
        [id, key, name, JSON.stringify(mods)],
      );
    }
    const modules: [string, string, string, string][] = [
      ["seed_m_dashboard", "dashboard", "Dashboard", "#3B82F6"],
      ["seed_m_workspace", "workspace", "Workspace", "#0D9488"],
      ["seed_m_crm", "crm", "Contacts / CRM", "#10B981"],
      ["seed_m_enrichment", "enrichment", "Enrichment", "#F59E0B"],
      ["seed_m_inbox", "inbox", "Inbox", "#25D366"],
      ["seed_m_pipeline", "pipeline", "Pipeline", "#6366F1"],
    ];
    for (const [id, key, label, color] of modules) {
      await client.query(
        `insert into module_catalog (id,module_key,label,sidebar_color) values ($1,$2,$3,$4) on conflict (module_key) do nothing`,
        [id, key, label, color],
      );
    }
    console.log("SEEDED (all ids prefixed seed_ → '--unseed' to remove):");
    console.log("  superadmin login: superadmin@demo.local / demo1234");
    console.log("  3 verticals (HR/Sales/Lainnya) + 6 modules in catalog");
  }
} finally {
  await client.end();
}

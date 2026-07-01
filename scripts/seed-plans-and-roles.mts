// Seed the subscription PLAN catalog + a working login for EVERY role (incl. a
// superadmin that can actually log in) + an UNLIMITED account.
//   run: npx tsx scripts/seed-plans-and-roles.mts
//
// Idempotent + additive. All rows use ids prefixed "seed_" (removable). Requires
// the OWNER Postgres URL (POSTGRES_URL_NON_POOLING || POSTGRES_URL) so writes to
// app_user / membership / tenant / usage_counter bypass RLS. Password: maira1234.
//
// Mirrors lib/billing/plans.ts (kept inline so the script has no app-code imports,
// same convention as rebuild-demo-seed.mts).
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

const PW = "maira1234";
const DEMO_TENANT = "seed_t_demo";
const UNL_TENANT = "seed_t_unlimited";
const ahead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

type Quotas = Record<string, number | null>;
const PLANS: [string, string, number, Quotas][] = [
  ["free", "Free", 0, { seats_max: 1, contacts_max: 100, companies_max: 50, messages_max: 200, ai_tokens_max: 50_000 }],
  ["starter", "Starter", 149_000, { seats_max: 3, contacts_max: 1_000, companies_max: 500, messages_max: 2_000, ai_tokens_max: 500_000 }],
  ["growth", "Growth", 499_000, { seats_max: 10, contacts_max: 10_000, companies_max: 5_000, messages_max: 20_000, ai_tokens_max: 5_000_000 }],
  ["enterprise", "Enterprise", 1_999_000, { seats_max: 50, contacts_max: 100_000, companies_max: 50_000, messages_max: 200_000, ai_tokens_max: 50_000_000 }],
  ["unlimited", "Unlimited", 0, { seats_max: null, contacts_max: null, companies_max: null, messages_max: null, ai_tokens_max: null }],
];
const METRICS = ["seats_max", "contacts_max", "companies_max", "messages_max", "ai_tokens_max"];
const MONTHLY = new Set(["messages_max", "ai_tokens_max"]);

const client = createClient({ connectionString: url });
await client.connect();
try {
  // 1) PLAN catalog (the `plan` table was previously empty).
  for (const [key, name, price, quotas] of PLANS) {
    await client.query(
      `insert into plan (id,key,name,price_month_idr,quotas) values ($1,$2,$3,$4,$5::jsonb)
       on conflict (key) do update set name=excluded.name, price_month_idr=excluded.price_month_idr, quotas=excluded.quotas`,
      [`seed_plan_${key}`, key, name, price, JSON.stringify(quotas)],
    );
  }

  // Mirror a plan's ceilings into a tenant's usage_counter.quota_limit (null = ∞).
  async function applyLimits(tenantId: string, planKey: string) {
    const plan = PLANS.find((p) => p[0] === planKey);
    const quotas: Quotas = plan ? plan[3] : {};
    for (const metric of METRICS) {
      const per = MONTHLY.has(metric) ? period : "lifetime";
      await client.query(
        `insert into usage_counter (id,tenant_id,metric,period,used,quota_limit)
         values ($1,$2,$3,$4,0,$5)
         on conflict (tenant_id,metric,period) do update set quota_limit=excluded.quota_limit`,
        [`seed_usg_${tenantId}_${metric}`, tenantId, metric, per, quotas[metric] ?? null],
      );
    }
  }

  // Upsert an app_user (scrypt maira1234) + an active membership on a tenant.
  async function ensureUser(id: string, name: string, email: string, role: string, tenantId: string, isSuper = false) {
    const hash = await hashPassword(PW);
    await client.query(
      `insert into app_user (id,name,email,password_hash,is_superadmin,email_verified_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (email) do update set password_hash=excluded.password_hash, is_superadmin=excluded.is_superadmin, name=excluded.name`,
      [id, name, email, hash, isSuper],
    );
    const { rows } = await client.query(`select id from app_user where email=$1`, [email]);
    const uid = rows[0].id as string;
    await client.query(
      `insert into membership (id,tenant_id,user_id,role,status)
       values ($1,$2,$3,$4,'active')
       on conflict (id) do update set role=excluded.role, status='active'`,
      [`seed_mbr_${id}`, tenantId, uid, role],
    );
    return uid;
  }

  // 2) Ensure an ACTIVE demo tenant on GROWTH (so its quota reflects a real plan +
  //    enforcement is demonstrable). Keeps existing row/data if rebuild-demo-seed ran.
  await client.query(
    `insert into tenant (id,name,slug,status,vertical_key,plan_key,active_until,activated_by,activated_at,onboarding_completed_at)
     values ($1,'Maira Demo','seed-maira-demo','active','sales','growth',$2,'seed_superadmin',now(),now())
     on conflict (id) do update set status='active', plan_key='growth', active_until=excluded.active_until`,
    [DEMO_TENANT, ahead(3650)],
  );
  await applyLimits(DEMO_TENANT, "growth");

  // 3) Fix the existing superadmin (seed_superadmin) — it had NO membership, so it
  //    could never log in (verifyCredentials requires one). Give it one now.
  await client.query(
    `insert into membership (id,tenant_id,user_id,role,status)
     values ('seed_mbr_super',$1,'seed_superadmin','tenant_owner','active')
     on conflict (id) do update set status='active'`,
    [DEMO_TENANT],
  );

  // 4) A login for every role (maira1234) on the demo tenant.
  await ensureUser("seed_u_super", "Super Admin (Maira)", "superadmin@maira.local", "tenant_owner", DEMO_TENANT, true);
  await ensureUser("seed_u_owner", "Owner Demo", "owner@maira.local", "tenant_owner", DEMO_TENANT);
  await ensureUser("seed_u_admin", "Admin Demo", "admin@maira.local", "tenant_admin", DEMO_TENANT);
  await ensureUser("seed_u_manager", "Manager Demo", "manager@maira.local", "sales_manager", DEMO_TENANT);
  await ensureUser("seed_u_rep", "Rep Demo", "rep@maira.local", "sales_rep", DEMO_TENANT);

  // 5) UNLIMITED account — its own tenant on the unlimited plan (all quotas ∞).
  await client.query(
    `insert into tenant (id,name,slug,status,vertical_key,plan_key,active_until,activated_by,activated_at,onboarding_completed_at)
     values ($1,'Maira Unlimited','seed-maira-unlimited','active','sales','unlimited',$2,'seed_superadmin',now(),now())
     on conflict (id) do update set status='active', plan_key='unlimited', active_until=excluded.active_until`,
    [UNL_TENANT, ahead(3650)],
  );
  await applyLimits(UNL_TENANT, "unlimited");
  await ensureUser("seed_u_unlimited", "Unlimited Owner", "unlimited@maira.local", "tenant_owner", UNL_TENANT);

  console.log("SEEDED plans + role logins.");
  console.log("PLAN catalog: free / starter / growth / enterprise / unlimited");
  console.log("");
  console.log("LOGINS (password: maira1234) :");
  console.log("  superadmin@maira.local   — SUPERADMIN (platform)");
  console.log("  owner@maira.local        — tenant_owner  @ Maira Demo (growth)");
  console.log("  admin@maira.local        — tenant_admin  @ Maira Demo (growth)");
  console.log("  manager@maira.local      — sales_manager @ Maira Demo (growth)");
  console.log("  rep@maira.local          — sales_rep     @ Maira Demo (growth)");
  console.log("  unlimited@maira.local    — tenant_owner  @ Maira Unlimited (ALL quotas unlimited)");
  console.log("");
  console.log("Also fixed: superadmin@demo.local / demo1234 now has a membership -> can log in.");
} finally {
  await client.end();
}

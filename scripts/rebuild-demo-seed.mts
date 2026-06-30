// Demo seed for the rebuild's tables. DELETABLE by design:
//   seed:   npx tsx scripts/rebuild-demo-seed.mts
//   remove: npx tsx scripts/rebuild-demo-seed.mts --unseed   (hard-delete all seed_* rows)
// Every seeded row uses an id prefixed "seed_" so it can be removed cleanly.
//
// Beyond the Module 1 catalog (verticals/modules/superadmin), this also stands up
// a FULLY WORKING demo account so the deployed app shows a real, navigable product:
//   • an ACTIVE tenant "seed_t_demo" (status active, far-future active_until, generous quota)
//   • a tenant-owner login demo@maira.local / demo1234 (scrypt-hashed) + active membership
//   • a product + a workspace "seed_ws_demo" (market_fit=mix + a sales_play)
//   • ~10 contacts (mixed B2C/B2B, varied enrichment_status/fit_score), a few companies
//   • a few deals across pipeline stages, and 1-2 conversations with messages
// All scoped to seed_t_demo + seed_ws_demo, all ids prefixed "seed_".
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

// Stable, ordered timestamps so newest-first lists look natural in the demo.
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const DEMO_EMAIL = "demo@maira.local";
const DEMO_PASSWORD = "demo1234";
const TENANT_ID = "seed_t_demo";
const OWNER_ID = "seed_u_demo";
const WS_ID = "seed_ws_demo";
const PRODUCT_ID = "seed_prd_demo";
const PIPELINE_ID = "seed_ppl_demo";

const unseed = process.argv.includes("--unseed");
const client = createClient({ connectionString: url });
await client.connect();
try {
  if (unseed) {
    // Order is irrelevant (no FKs) — every row is matched by a seed_ id prefix.
    // `app_user`, `membership`, `tenant` etc. are the rebuild tables; the legacy
    // mirror rows (tenants/users/memberships) are also cleaned in case an older
    // seed wrote them.
    const byId = [
      // module-1 catalog + platform
      "app_user", "vertical", "module_catalog", "membership", "tenant",
      "tenant_entitlement_v2", "usage_counter", "onboarding_state", "audit_log_v2",
      // workspace + product (module 2)
      "workspace_v2", "product_v2", "market_fit", "sales_play",
      // crm (module 3)
      "company_v2", "contact", "pipeline", "pipeline_stage", "deal", "activity",
      // inbox (module 4)
      "conversation_v2", "message_v2",
      // legacy mirrors (harmless if a prior seed wrote them)
      "tenants", "users", "memberships",
    ];
    let total = 0;
    for (const t of byId) {
      try { const r = await client.query(`delete from "${t}" where id like 'seed_%'`); total += r.rowCount ?? 0; } catch {}
    }
    // user_theme + onboarding_state are keyed by user_id / tenant_id (no id column).
    try { const r = await client.query(`delete from user_theme where user_id like 'seed_%'`); total += r.rowCount ?? 0; } catch {}
    try { const r = await client.query(`delete from onboarding_state where tenant_id like 'seed_%'`); total += r.rowCount ?? 0; } catch {}
    console.log(`UNSEEDED: hard-deleted ${total} seed_* rows.`);
    await client.end();
    process.exit(0);
  }

  // ── 1) platform catalog (unchanged) ────────────────────────────────────────
  const superPw = await hashPassword(DEMO_PASSWORD);
  await client.query(
    `insert into app_user (id,name,email,password_hash,is_superadmin) values ('seed_superadmin','Super Admin','superadmin@demo.local',$1,true) on conflict (email) do nothing`,
    [superPw],
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

  // ── 2) ACTIVE tenant + owner user + membership ──────────────────────────────
  // status='active', far-future active_until → passes the activation gate; the
  // app shell lets the owner straight into the product (no /pending redirect).
  await client.query(
    `insert into tenant (id,name,slug,status,vertical_key,plan_key,active_until,activated_by,activated_at,onboarding_completed_at)
     values ($1,'Maira Demo','seed-maira-demo','active','sales','growth',$2,'seed_superadmin',now(),now())
     on conflict (id) do update set status='active', active_until=excluded.active_until, plan_key=excluded.plan_key`,
    [TENANT_ID, ahead(3650)],
  );

  const ownerPw = await hashPassword(DEMO_PASSWORD);
  await client.query(
    `insert into app_user (id,name,email,password_hash,avatar_color,is_superadmin,email_verified_at)
     values ($1,'Demo Owner',$2,$3,'#FD7A5C',false,now())
     on conflict (email) do update set password_hash=excluded.password_hash, name=excluded.name`,
    [OWNER_ID, DEMO_EMAIL, ownerPw],
  );

  await client.query(
    `insert into membership (id,tenant_id,user_id,role,status)
     values ('seed_mbr_demo',$1,$2,'tenant_owner','active')
     on conflict (id) do update set role='tenant_owner', status='active'`,
    [TENANT_ID, OWNER_ID],
  );

  // Generous quota — lifetime ceilings + this-month period buckets. quota_limit
  // is the resolved ceiling the app reads; `used` stays low so nothing is blocked.
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const quotas: [string, string, string, number, number][] = [
    ["seed_usg_seats", "seats_max", "lifetime", 2, 50],
    ["seed_usg_contacts", "contacts_max", "lifetime", 10, 100_000],
    ["seed_usg_companies", "companies_max", "lifetime", 4, 50_000],
    ["seed_usg_messages", "messages_max", period, 6, 1_000_000],
    ["seed_usg_ai", "ai_tokens_max", period, 12_500, 50_000_000],
  ];
  for (const [id, metric, per, used, limit] of quotas) {
    await client.query(
      `insert into usage_counter (id,tenant_id,metric,period,used,quota_limit)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (tenant_id,metric,period) do update set quota_limit=excluded.quota_limit, used=excluded.used`,
      [id, TENANT_ID, metric, per, used, limit],
    );
  }

  // ── 3) product + workspace (1 workspace = 1 product) ────────────────────────
  await client.query(
    `insert into product_v2 (id,tenant_id,name,category,value_props,pricing_notes,target_market,icp,status)
     values ($1,$2,'Maira Autopilot','SaaS / Sales Automation',$3::jsonb,'Mulai Rp 1.5jt/bln, 14 hari coba gratis','both',$4::jsonb,'active')
     on conflict (id) do nothing`,
    [
      PRODUCT_ID, TENANT_ID,
      JSON.stringify([
        "Balas WhatsApp & email otomatis 24/7",
        "Skoring lead pakai AI + enrichment",
        "Pipeline + penawaran dalam satu alur",
      ]),
      JSON.stringify({
        segments: ["UKM digital", "Agensi", "Tim sales B2B kecil-menengah"],
        geo: "Indonesia",
        painPoints: ["lead lambat dibalas", "follow-up bocor", "data prospek berserakan"],
      }),
    ],
  );

  await client.query(
    `insert into workspace_v2 (id,tenant_id,owner_user_id,name,type,product_id,target_segment,status)
     values ($1,$2,$3,'Akuisisi Maira Autopilot','lead_gen',$4,'UKM & agensi digital Jakarta','active')
     on conflict (id) do nothing`,
    [WS_ID, TENANT_ID, OWNER_ID, PRODUCT_ID],
  );

  // market_fit = mix (1:1 satellite of the workspace)
  await client.query(
    `insert into market_fit (id,tenant_id,workspace_id,market_type,confidence,icp,segments,rationale,source)
     values ('seed_mft_demo',$1,$2,'mix',0.78,$3::jsonb,$4::jsonb,$5,'ai')
     on conflict (tenant_id,workspace_id) do update set market_type='mix'`,
    [
      TENANT_ID, WS_ID,
      JSON.stringify({ b2c: "Solopreneur & freelancer yang jual via WA/IG", b2b: "Tim sales 2-20 orang di UKM/agensi" }),
      JSON.stringify(["UKM digital", "Agensi kreatif", "Freelancer & solopreneur"]),
      "Produk dipakai baik oleh individu (B2C) maupun tim kecil (B2B) — fit-nya campuran, jadi playbook menyasar keduanya.",
    ],
  );

  // sales_play = the consultative value-first play (1:1 satellite)
  await client.query(
    `insert into sales_play (id,tenant_id,workspace_id,name,channel,tone,techniques,steps,config,status)
     values ('seed_ply_demo',$1,$2,'Konsultatif WhatsApp','whatsapp','consultative',$3::jsonb,$4::jsonb,$5::jsonb,'active')
     on conflict (tenant_id,workspace_id) do nothing`,
    [
      TENANT_ID, WS_ID,
      JSON.stringify(["value_first", "social_proof", "assumptive_close", "urgency_soft"]),
      JSON.stringify([
        { order: 1, intent: "open", prompt: "Sapa hangat + sebut konteks lead" },
        { order: 2, intent: "discover", prompt: "Gali pain follow-up & volume chat" },
        { order: 3, intent: "value", prompt: "Tunjukkan hasil: balas <5 menit, lead tak bocor" },
        { order: 4, intent: "close", prompt: "Tawarkan coba gratis 14 hari, asumsikan ya" },
      ]),
      JSON.stringify({ followUpHours: 24, maxTouches: 4 }),
    ],
  );

  // ── 4) companies (B2B accounts) ─────────────────────────────────────────────
  const companies: [string, string, string, string, string][] = [
    ["seed_cmp_logiku", "Logiku Nusantara", "logiku.co.id", "Logistik", "51-200"],
    ["seed_cmp_kriyatama", "Kriyatama Agensi", "kriyatama.id", "Agensi Kreatif", "11-50"],
    ["seed_cmp_tokomaju", "Toko Maju Bersama", "tokomaju.com", "Retail / E-commerce", "11-50"],
  ];
  for (const [id, name, domain, industry, size] of companies) {
    await client.query(
      `insert into company_v2 (id,tenant_id,name,domain,industry,size,hq_country,hq_city,website,owner_user_id,status,source)
       values ($1,$2,$3,$4,$5,$6,'Indonesia','Jakarta',$7,$8,'active','seed')
       on conflict (id) do nothing`,
      [id, TENANT_ID, name, domain, industry, size, `https://${domain}`, OWNER_ID],
    );
  }

  // ── 5) contacts (~10) — mixed B2C/B2B, varied enrichment_status + fit_score ──
  // [id, fullName, segment, companyId|null, title|null, email, phone, enrichmentStatus, fitScore|null, lifecycle, city, color, daysAgo]
  const contacts: [string, string, string, string | null, string | null, string, string, string, number | null, string, string, string, number][] = [
    ["seed_ctc_01", "Rani Putri", "b2c", null, null, "rani.putri@gmail.com", "+628121110001", "enriched", 0.88, "sql", "Jakarta", "#FD7A5C", 1],
    ["seed_ctc_02", "Budi Santoso", "b2b", "seed_cmp_logiku", "Head of Sales", "budi@logiku.co.id", "+628121110002", "enriched", 0.91, "sql", "Jakarta", "#14B8A6", 2],
    ["seed_ctc_03", "Dewi Lestari", "b2c", null, null, "dewi.lestari@yahoo.com", "+628121110003", "pending", 0.52, "mql", "Bandung", "#F59E0B", 3],
    ["seed_ctc_04", "Agus Wijaya", "b2b", "seed_cmp_kriyatama", "Founder", "agus@kriyatama.id", "+628121110004", "enriched", 0.84, "mql", "Jakarta", "#3B82F6", 4],
    ["seed_ctc_05", "Siti Nurhaliza", "b2c", null, null, "siti.n@gmail.com", "+628121110005", "none", null, "lead", "Surabaya", "#8B5CF6", 5],
    ["seed_ctc_06", "Hendra Gunawan", "b2b", "seed_cmp_tokomaju", "Operations Manager", "hendra@tokomaju.com", "+628121110006", "enriched", 0.66, "lead", "Jakarta", "#10B981", 6],
    ["seed_ctc_07", "Maya Anggraini", "b2c", null, null, "maya.a@outlook.com", "+628121110007", "failed", 0.31, "lead", "Yogyakarta", "#EC4899", 7],
    ["seed_ctc_08", "Rizki Pratama", "b2b", "seed_cmp_logiku", "Sales Rep", "rizki@logiku.co.id", "+628121110008", "pending", 0.58, "mql", "Jakarta", "#0EA5E9", 8],
    ["seed_ctc_09", "Putri Maharani", "b2c", null, null, "putri.maharani@gmail.com", "+628121110009", "enriched", 0.74, "customer", "Bekasi", "#F97316", 9],
    ["seed_ctc_10", "Fajar Ramadhan", "b2b", "seed_cmp_kriyatama", "Marketing Lead", "fajar@kriyatama.id", "+628121110010", "none", null, "lead", "Depok", "#6366F1", 10],
  ];
  for (const [id, fullName, segment, companyId, title, email, phone, enr, fit, lifecycle, city, color, days] of contacts) {
    await client.query(
      `insert into contact
         (id,tenant_id,company_id,workspace_id,full_name,title,email,phone,whatsapp,city,segment,enrichment_status,fit_score,fit_reason,lifecycle_stage,owner_user_id,consent_status,source,last_activity_at,avatar_color)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,'legitimate_interest','seed',$16,$17)
       on conflict (id) do nothing`,
      [
        id, TENANT_ID, companyId, WS_ID, fullName, title, email, phone, city,
        segment, enr, fit,
        fit === null ? "Belum dinilai — perlu enrichment." : fit >= 0.8 ? "Cocok kuat dengan ICP." : fit >= 0.6 ? "Cukup cocok, perlu kualifikasi." : "Fit lemah, perlu nurturing.",
        lifecycle, OWNER_ID, ago(days), color,
      ],
    );
  }

  // ── 6) pipeline + stages + deals across stages ──────────────────────────────
  await client.query(
    `insert into pipeline (id,tenant_id,name,workspace_id,is_default)
     values ($1,$2,'Pipeline Penjualan',$3,true) on conflict (id) do nothing`,
    [PIPELINE_ID, TENANT_ID, WS_ID],
  );
  // [id, name, sort, probability, isWon, isLost]
  const stages: [string, string, number, number, boolean, boolean][] = [
    ["seed_stg_prospek", "Prospek", 0, 10, false, false],
    ["seed_stg_kualifikasi", "Kualifikasi", 1, 30, false, false],
    ["seed_stg_penawaran", "Penawaran", 2, 55, false, false],
    ["seed_stg_negosiasi", "Negosiasi", 3, 75, false, false],
    ["seed_stg_menang", "Tutup - Menang", 4, 100, true, false],
    ["seed_stg_kalah", "Tutup - Kalah", 5, 0, false, true],
  ];
  for (const [id, name, sort, prob, won, lost] of stages) {
    await client.query(
      `insert into pipeline_stage (id,tenant_id,pipeline_id,name,sort,probability,is_won,is_lost)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
      [id, TENANT_ID, PIPELINE_ID, name, sort, prob, won, lost],
    );
  }
  // [id, name, stageId, contactId, companyId|null, value, status, expectedCloseDays, color]
  const deals: [string, string, string, string, string | null, number, string, number, string][] = [
    ["seed_deal_01", "Logiku - paket tim 10 seat", "seed_stg_negosiasi", "seed_ctc_02", "seed_cmp_logiku", 18_000_000, "open", 7, "#14B8A6"],
    ["seed_deal_02", "Kriyatama - autopilot agensi", "seed_stg_penawaran", "seed_ctc_04", "seed_cmp_kriyatama", 9_500_000, "open", 14, "#3B82F6"],
    ["seed_deal_03", "Rani - paket solo", "seed_stg_kualifikasi", "seed_ctc_01", null, 1_500_000, "open", 10, "#FD7A5C"],
    ["seed_deal_04", "Toko Maju - retail bundle", "seed_stg_prospek", "seed_ctc_06", "seed_cmp_tokomaju", 6_000_000, "open", 21, "#10B981"],
    ["seed_deal_05", "Putri - upgrade pro", "seed_stg_menang", "seed_ctc_09", null, 2_400_000, "won", -3, "#F97316"],
    ["seed_deal_06", "Maya - paket solo (batal)", "seed_stg_kalah", "seed_ctc_07", null, 1_500_000, "lost", -5, "#EC4899"],
  ];
  for (const [id, name, stageId, contactId, companyId, value, status, closeDays, color] of deals) {
    const won = status === "won";
    const lost = status === "lost";
    await client.query(
      `insert into deal
         (id,tenant_id,name,pipeline_id,stage_id,contact_id,company_id,workspace_id,product_id,value,currency,status,expected_close,closed_at,lost_reason,source_channel,owner_user_id,avatar_color)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'IDR',$11,$12,$13,$14,'whatsapp',$15,$16)
       on conflict (id) do nothing`,
      [
        id, TENANT_ID, name, PIPELINE_ID, stageId, contactId, companyId, WS_ID, PRODUCT_ID,
        value, status, ahead(closeDays),
        won || lost ? ago(Math.abs(closeDays)) : null,
        lost ? "Harga di atas budget" : null,
        OWNER_ID, color,
      ],
    );
  }

  // ── 7) conversations + messages (inbox) ─────────────────────────────────────
  // [convId, contactId, contactName, color, lastMsg, unread, status, [ [dir,body,minsAgo,aiGen], ... ] ]
  const convos: [string, string, string, string, string, number, string, [string, string, number, boolean][]][] = [
    [
      "seed_cnv_01", "seed_ctc_02", "Budi Santoso", "#14B8A6",
      "Oke, kirim proposal-nya ya 🙏", 2, "open",
      [
        ["in", "Halo, ini soal Maira Autopilot kan? Tim saya 10 orang, masih bisa?", 180, false],
        ["out", "Halo Pak Budi! Bisa banget — paket tim 10 seat sudah termasuk auto-reply WA + skoring lead. Boleh saya kirimkan proposalnya?", 175, true],
        ["in", "Oke, kirim proposal-nya ya 🙏", 170, false],
      ],
    ],
    [
      "seed_cnv_02", "seed_ctc_01", "Rani Putri", "#FD7A5C",
      "Berarti aku bisa coba gratis dulu ya?", 1, "open",
      [
        ["in", "Kak, ini buat jualan online sendiri cocok gak?", 90, false],
        ["out", "Cocok kak Rani! Buat solopreneur, Maira balasin chat WA & IG otomatis biar gak ada yang kelewat. Ada coba gratis 14 hari.", 85, true],
        ["in", "Berarti aku bisa coba gratis dulu ya?", 80, false],
      ],
    ],
  ];
  for (const [cnvId, contactId, contactName, color, lastMsg, unread, status, msgs] of convos) {
    const lastAt = ago(msgs[msgs.length - 1][2] / 1440); // minsAgo → days
    await client.query(
      `insert into conversation_v2
         (id,tenant_id,contact_id,workspace_id,channel,assigned_user_id,last_message,last_message_at,unread_count,status,avatar_color)
       values ($1,$2,$3,$4,'wa',$5,$6,$7,$8,$9,$10)
       on conflict (id) do nothing`,
      [cnvId, TENANT_ID, contactId, WS_ID, OWNER_ID, lastMsg, lastAt, unread, status, color],
    );
    let i = 0;
    for (const [dir, body, mins, ai] of msgs) {
      const at = ago(mins / 1440);
      await client.query(
        `insert into message_v2 (id,tenant_id,conversation_id,direction,body,channel,status,is_ai_generated,sent_at,created_at)
         values ($1,$2,$3,$4,$5,'wa',$6,$7,$8,$8)
         on conflict (id) do nothing`,
        [
          `${cnvId}_m${i}`, TENANT_ID, cnvId, dir, body,
          dir === "out" ? "delivered" : "read", ai, at,
        ],
      );
      i++;
    }
    // mention contactName so it's used (lint: no-unused) and self-documenting.
    void contactName;
  }

  console.log("SEEDED (all ids prefixed seed_ → '--unseed' to remove):");
  console.log("  superadmin login: superadmin@demo.local / demo1234");
  console.log("  3 verticals (HR/Sales/Lainnya) + 6 modules in catalog");
  console.log("  ACTIVE tenant 'seed_t_demo' (Maira Demo) — generous quota, 10yr activation");
  console.log("  workspace 'seed_ws_demo' (market_fit=mix + consultative sales_play) on product 'Maira Autopilot'");
  console.log("  10 contacts (B2C/B2B), 3 companies, 6 deals across pipeline stages, 2 WA conversations");
  console.log("");
  console.log(`  >>> DEMO LOGIN:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}  (tenant owner, active)`);
} finally {
  await client.end();
}

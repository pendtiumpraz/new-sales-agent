import { createClient } from "@vercel/postgres";
import { readFileSync } from "fs";
try { const e=readFileSync(".env.local","utf8"); for(const l of e.split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}}catch{}
const c = createClient();
await c.connect();

// Mirrors drizzle/migrations/0027_compliance_register.sql, made idempotent.
// This DB is db:push-managed (empty migrations journal), so we apply the new
// tables directly with IF NOT EXISTS instead of replaying every migration.
await c.query(`CREATE TABLE IF NOT EXISTS "consent_log" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "contact_name" text NOT NULL,
  "source" text NOT NULL,
  "channel" text,
  "ip" text,
  "version" text,
  "status" text NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL
)`);
await c.query(`CREATE TABLE IF NOT EXISTS "dpia" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "process" text NOT NULL,
  "data_category" text NOT NULL,
  "risk_level" text NOT NULL,
  "status" text NOT NULL,
  "owner" text NOT NULL,
  "date" text,
  "mitigations" integer DEFAULT 0 NOT NULL
)`);
await c.query(`CREATE TABLE IF NOT EXISTS "vendor_risk" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "vendor" text NOT NULL,
  "category" text NOT NULL,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "risk_level" text NOT NULL,
  "dpa_signed" boolean DEFAULT false NOT NULL,
  "residency" text,
  "last_review" text
)`);
await c.query(`CREATE INDEX IF NOT EXISTS "consent_log_tenant_idx" ON "consent_log" USING btree ("tenant_id")`);
await c.query(`CREATE INDEX IF NOT EXISTS "dpia_tenant_idx" ON "dpia" USING btree ("tenant_id")`);
await c.query(`CREATE INDEX IF NOT EXISTS "vendor_risk_tenant_idx" ON "vendor_risk" USING btree ("tenant_id")`);

for (const t of ["consent_log", "dpia", "vendor_risk"]) {
  const r = await c.query(`select to_regclass($1) as exists`, [t]);
  console.log(`table ${t}:`, r.rows[0].exists);
}
await c.end();
console.log("compliance tables applied");

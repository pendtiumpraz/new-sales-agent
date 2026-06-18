import { createClient } from "@vercel/postgres";
import { readFileSync } from "fs";
try { const e=readFileSync(".env.local","utf8"); for(const l of e.split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}}catch{}
const c=createClient(); await c.connect();
await c.query(`ALTER TABLE "marketplace_listing" ADD COLUMN IF NOT EXISTS "bundle_items" jsonb`);
await c.query(`ALTER TABLE "marketplace_listing" ADD COLUMN IF NOT EXISTS "pricing_mode" text`);
console.log("bundle columns added");
await c.end();

// One-off migration (doc 49): add a nullable deleted_at column to the user-facing
// business tables so DELETE becomes soft + restorable. Idempotent (IF NOT EXISTS).
import { createClient } from "@vercel/postgres";
import { readFileSync } from "fs";

// drizzle.config-style manual .env.local load (Next loads it, plain node doesn't).
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* env already present */
}

const TABLES = ["kb", "deals", "quote", "contacts", "cadences", "company", "person", "product", "workspace"];

const client = createClient();
await client.connect();
for (const t of TABLES) {
  await client.query(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`);
  console.log("  + deleted_at on", t);
}
await client.end();
console.log("done:", TABLES.length, "tables");

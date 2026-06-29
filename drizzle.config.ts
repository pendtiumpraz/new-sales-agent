import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "drizzle-kit";

// Drizzle Kit CLI doesn't auto-load `.env.local` the way Next.js does. Inline
// a small loader so `npm run db:push` / `db:generate` / `db:migrate` just work
// after `vercel env pull .env.local`. No external `dotenv` dependency needed.
loadEnvLocal();

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // don't overwrite real env
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Tolerate Vercel Marketplace's "Environment Variables Prefix" feature: scans
// for any *_POSTGRES_URL_NON_POOLING / *_POSTGRES_URL after the canonical names.
function findConnectionUrl(): string {
  if (process.env.POSTGRES_URL_NON_POOLING) return process.env.POSTGRES_URL_NON_POOLING;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.length > 0 && /_POSTGRES_URL_NON_POOLING$/.test(key)) return value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.length > 0 && /_POSTGRES_URL$/.test(key)) return value;
  }
  throw new Error(
    "No Postgres connection string found in env. Run `vercel env pull .env.local` and verify the Neon database is connected to this project.",
  );
}

export default defineConfig({
  // Legacy prototype tables + rebuild module tables (modules/<domain>/schema.ts).
  // db:generate emits migration files for both; the rebuild tables use distinct
  // SQL names so there is no collision with the legacy set.
  schema: ["./lib/db/schema.ts", "./modules/**/schema.ts"],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: findConnectionUrl(),
  },
});

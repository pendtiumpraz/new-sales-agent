import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";

import * as schema from "./schema";

// Singleton drizzle client — safe to import from any route handler / server
// component. The underlying @vercel/postgres `sql` connection is pooled.
export const db = drizzle(sql, { schema });

// Helper: true when database creds are present at runtime.
export function hasDb(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);
}

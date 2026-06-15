import { auth } from "./auth";
import type { TenantContext } from "@/lib/db/tenant-context";

/**
 * Resolve the RLS/tenant context from the Auth.js session for a route handler
 * (doc 19). Returns null when there's no session — callers fall back to
 * mock/seed, mirroring the existing `!hasDb()` branch.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.tenantId || !u?.id) return null;
  return { tenantId: u.tenantId, userId: u.id, role: u.role };
}

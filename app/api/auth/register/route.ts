import { hasDb } from "@/lib/db/client";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

import { ok, fail, handle } from "@/modules/_shared/api";
import { authService, type RegisterInput } from "@/modules/auth/service";

export const runtime = "nodejs";

// POST /api/auth/register (doc §4.2) — self-serve signup. Creates a tenant in
// status 'pending' + the owner user (HASHED password) + owner membership. The
// account CANNOT use the app until a superadmin activates the tenant. Public,
// rate-limited by IP (audit #8) to stop mass tenant/user creation + audit flood.
//
// Body: { company, name, email, password }
export async function POST(req: Request) {
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const rl = rateLimit("register", clientIp(req), 5, 60 * 60 * 1000); // 5/hour/IP
  if (!rl.ok) return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, "rate_limited");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Partial<RegisterInput>;
    const result = await authService.register({
      company: body.company ?? "",
      name: body.name ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
    });
    return ok(result, { status: 201 });
  }, "api/auth/register POST");
}

import { hasDb } from "@/lib/db/client";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

import { ok, fail, handle } from "@/modules/_shared/api";
import { authService } from "@/modules/auth/service";

export const runtime = "nodejs";

// POST /api/auth/password-reset/confirm (doc §4.2) — consume a one-shot token
// and set a new HASHED password. Public (the token is the credential).
// Rate-limited by IP (audit #8) to throttle token guessing.
//
// Body: { token, password }
export async function POST(req: Request) {
  // Don't reveal DB state to an anonymous caller (audit #45): a no-DB deployment
  // returns the SAME generic "invalid token" an attacker gets for a wrong token,
  // so it's indistinguishable from a normal failed reset (no `no_db` oracle).
  if (!hasDb()) return fail("Token tidak valid atau sudah dipakai", 400, "invalid_token");
  const rl = rateLimit("reset-confirm", clientIp(req), 20, 60 * 60 * 1000); // 20/hour/IP
  if (!rl.ok) return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, "rate_limited");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
    const result = await authService.confirmReset(body.token ?? "", body.password ?? "");
    return ok(result);
  }, "api/auth/password-reset/confirm POST");
}

import { hasDb } from "@/lib/db/client";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

import { ok, fail, handle } from "@/modules/_shared/api";
import { authService } from "@/modules/auth/service";

export const runtime = "nodejs";

// POST /api/auth/password-reset (doc §4.2) — request a reset token. Always
// returns `{ requested: true }` (no user-enumeration). The token is delivered
// OUT-OF-BAND (email in a real deployment) and is NEVER in the response body —
// returning it would be an account-takeover oracle (audit #2). Public,
// rate-limited by IP + email (audit #8).
//
// Body: { email }
export async function POST(req: Request) {
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  // Throttle by IP (anti-flood) AND by email (so one victim can't be hammered
  // into a token-issuance loop regardless of source IP) — audit #8.
  const rlIp = rateLimit("reset-ip", clientIp(req), 10, 60 * 60 * 1000); // 10/hour/IP
  if (!rlIp.ok) return fail("Terlalu banyak permintaan. Coba lagi nanti.", 429, "rate_limited");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (email) {
      const rlEmail = rateLimit("reset-email", email, 3, 60 * 60 * 1000); // 3/hour/email
      if (!rlEmail.ok) {
        return fail("Terlalu banyak permintaan. Coba lagi nanti.", 429, "rate_limited");
      }
    }
    const result = await authService.requestReset(email);
    return ok(result);
  }, "api/auth/password-reset POST");
}

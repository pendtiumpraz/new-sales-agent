/**
 * Minimal in-memory rate limiter for the UNAUTHENTICATED auth endpoints
 * (audit #8): register, password-reset, password-reset/confirm, and the
 * Credentials `authorize`. A coarse fixed-window counter is enough to blunt the
 * worst abuse (mass tenant creation, the reset-token oracle, password
 * brute-force) without standing up Redis/Upstash.
 *
 * Scope/caveats (acceptable for a single-instance prototype):
 *  - Process-local: state resets on redeploy and is NOT shared across instances.
 *    A real multi-region deploy should swap the store for Upstash/Redis behind
 *    the same `rateLimit()` signature.
 *  - Best-effort IP: derived from `x-forwarded-for` / `x-real-ip`; spoofable
 *    without a trusted proxy, which is why we ALSO key on a stable identifier
 *    (e.g. the email) so a single account can't be hammered regardless of IP.
 */

interface Window {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

// Keyed by `${bucket}:${key}`. A module-level Map is fine: route handlers share
// one Node process per instance.
const WINDOWS = new Map<string, Window>();

// Opportunistic sweep so the Map can't grow without bound under churn. Runs at
// most once per minute, inline (no timers — serverless-safe).
let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, w] of WINDOWS) {
    if (w.resetAt <= now) WINDOWS.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when `ok` is false). */
  retryAfter: number;
}

/**
 * Fixed-window check. Returns `{ ok:false, retryAfter }` once `limit` requests
 * have been seen for `key` within `windowMs`. Each call that is still inside the
 * window increments the counter.
 */
export function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const id = `${bucket}:${key}`;
  const existing = WINDOWS.get(id);
  if (!existing || existing.resetAt <= now) {
    WINDOWS.set(id, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers; falls back to a constant so the
 *  identifier dimension still applies when no IP is resolvable. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

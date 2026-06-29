/**
 * Single source of truth for the "demo / non-production" gate used by the auth
 * layer (audit #1, #2). Anything guarded by this is GUARANTEED off in a real
 * deployment: it requires BOTH the mock AI provider AND a non-production build,
 * so it can never be flipped on by a stray env var in prod.
 *
 *  - `NEXT_PUBLIC_AI_PROVIDER === "mock"` — the prototype/offline mode flag.
 *  - `NODE_ENV !== "production"` — never true in a prod build.
 *
 * Used to gate (a) the offline demo-account fallback in `authorize()` and
 * (b) server-side logging of the password-reset token until a real mailer exists.
 */
export function isDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_AI_PROVIDER === "mock" &&
    process.env.NODE_ENV !== "production"
  );
}

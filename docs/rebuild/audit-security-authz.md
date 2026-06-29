# Rebuild Audit — Security & Authorization

Sainskerta Loop Phase 05 · adversarial audit · dimension: **security-authz**
Scope: `modules/**`, new `app/api/**` routes, `app/(app)/**` + auth pages, `lib/auth/**`,
`middleware.ts`, `scripts/apply-rebuild-migration.mts`.

Date: 2026-06-29

## Verdict (counts by severity)

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH     | 3 |
| MEDIUM   | 4 |
| LOW      | 3 |

The route-level authz story is, overall, **good and consistent**: ~230 rebuild routes
all flow through `requirePermission(...)` / `getTenantContext()` (only the 3 intentionally
public auth routes lack a guard), every rebuild repo explicitly filters `eq(table.tenantId,
ctx.tenantId)` (defense-in-depth, does not rely on the not-yet-enabled RLS), all SQL is
drizzle-parameterized (no string-built SQL), the edge/node next-auth split is correct, and
AI is reached only via `lib/ai/meter`. The serious problems are concentrated in the
**authentication layer** (hardcoded backdoor, reset-token leak) and in **tenant-lifecycle
enforcement** (suspend/pending is UX-only, not enforced server-side).

---

## CRITICAL

### C1 — Hardcoded demo-account backdoor is active in ALL environments (auth bypass)
**`lib/auth/auth.ts:74-89`** (with `lib/auth/demo-accounts.ts:18-58`)

`authorize()` falls through to `findAccount(email, password)` against a hardcoded list
**with no `NODE_ENV`/feature gate**. The list includes a Superadmin
(`superadmin@mairasales.com` / `super1234`, `lib/auth/demo-accounts.ts:18-28`) that resolves
to `role: "superadmin"` + `isSuperadmin: true` + `tenantStatus: "active"`. Because the demo
branch runs after the DB branch on *any* email the DB lookup didn't match, these credentials
grant full platform access in production. This is simultaneously an auth bypass AND a
violation of the rebuild's "NO mock/hardcoded data" invariant on the most sensitive path.

There is also no environment gate at all: `grep NODE_ENV` finds the check only in
`lib/inngest/client.ts`, never in the auth path.

**Fix:** gate the demo fallback behind an explicit, default-off flag that is impossible to
set in prod, e.g. `if (process.env.NEXT_PUBLIC_AI_PROVIDER === "mock" && process.env.NODE_ENV
!== "production")`, or drop the demo branch from `auth.ts` entirely and seed demo users into
the DB (`scripts/db-seed.ts` already inserts `DEMO_ACCOUNTS`) so the real credential path is
the only one. At minimum, never emit `role: superadmin` from a hardcoded record.

### C2 — Password-reset token returned in the HTTP response → account takeover
**`app/api/auth/password-reset/route.ts:13-19`** → **`modules/auth/service.ts:134-155`**

`requestReset()` returns the raw reset token in the JSON body (`return { requested: true,
token }`, service.ts:154), and the route passes it straight to the client. Any anonymous
caller can `POST {email}` for a victim and receive a valid one-hour token, then
`POST /api/auth/password-reset/confirm` to set a new password — full ATO with only the
victim's email. The "prototype, a real deployment mails it" comment does not remove the
vulnerability; it ships a token oracle. Compounded by no rate limiting (see H3).

**Fix:** never return the token. Deliver out-of-band (email) and have the endpoint return
only `{ requested: true }`. Until a mailer exists, log the token server-side only
(behind the non-prod gate from C1).

---

## HIGH

### H1 — Tenant suspend / pending / expired is NOT enforced at the API or service layer
**`app/(app)/layout.tsx:31-46`** (the only gate) · `lib/auth/session-context.ts:9-14`
· `lib/rbac/guard.ts:17-26`

The activation/kill-switch gate is **client-side only**: `AppLayout` does
`fetch("/api/tenant/status")` and `router.replace("/pending")`. `getTenantContext()` and
`requirePermission()` never inspect `tenantStatus`, the middleware never checks it, and no
rebuild service calls `isTenantActive`. A suspended/pending/expired tenant still holds a valid
JWT (the token's `tenantStatus` is also stale until re-login), so it can call **every**
`/api/*` CRUD endpoint directly (contacts, deals, exports, marketplace, etc.). The only place
the kill-switch actually bites is AI calls, because `lib/ai/meter.ts:5` independently calls
`isTenantActive`. This defeats the suspend kill-switch (doc 26) and the pending-activation
model (doc 38) for all non-AI functionality.

**Fix:** enforce status in the shared guard. Add a `tenantStatus`/`active` check to
`requirePermission` / `getTenantContext` (resolve live status server-side rather than trusting
the JWT field) and 403 non-active tenants — exempt only `platform.manage` (superadmin) and the
status/onboarding/billing endpoints needed to recover.

### H2 — Stale role/tenant/superadmin claims in the JWT are never re-validated
**`lib/auth/auth.config.ts:22-46`** · `lib/auth/session-context.ts:9-14`

`role`, `tenantId`, `isSuperadmin`, and `tenantStatus` are copied into the JWT once at login
and read back verbatim on every request; the `jwt` callback only repopulates `if (user)`
(i.e. only at sign-in). There is no DB re-check. Consequences: revoking a user's membership,
demoting them from `superadmin`, suspending the tenant, or revoking a session
(`auth_session`, written by `authService.recordSession`) has **no effect until the token
expires / they re-login**. The persistent `auth_session` revoke list (doc §4.2) is therefore
cosmetic — `revokeSession` deletes a row no request ever consults.

**Fix:** re-resolve authorization-critical fields server-side (membership role, is_superadmin,
tenant status, session-not-revoked) in `getTenantContext()` per request, or shorten JWT
`maxAge` drastically and consult `auth_session` on each request. At minimum, document that
revocation is not real until this lands.

### H3 — Public auth endpoints have no rate limiting / anti-automation
**`app/api/auth/register/route.ts`**, **`app/api/auth/password-reset/route.ts`**,
**`app/api/auth/password-reset/confirm/route.ts`**, and the Credentials `authorize`
(`lib/auth/auth.ts:47`)

None of the unauthenticated endpoints throttle. `register` lets an anonymous caller mass-create
pending tenants + users (resource exhaustion / audit-log flooding via
`platformRepo.insertAudit`). `password-reset` is an unthrottled token oracle (amplifies C2).
`confirm` allows unlimited token guessing — tokens are 256-bit so brute force is impractical,
but combined with no lockout the surface is poor. `authorize` allows unlimited password
guessing against real accounts.

**Fix:** add IP+identifier rate limiting (and ideally CAPTCHA on register) to all four. Even a
coarse in-memory/Upstash limiter closes the worst of it.

---

## MEDIUM

### M1 — Privilege escalation via member role change (no role-ceiling / allow-list)
**`app/api/tenant/members/[id]/route.ts:15-44`** (legacy table, but the live members route the
rebuild settings/team page calls)

`PATCH` accepts any `body.role` typed as `Role` and writes it to `membership.role` with no
validation that (a) it is an allowed membership role and (b) it does not exceed the actor's own
level. A `tenant_admin` (who holds `tenant.members.manage`) can set a member — or themselves —
to `tenant_owner`, gaining `tenant.billing`. The value is also unvalidated against the
membership-role enum, so arbitrary strings land in the column. The rebuild's own
`modules/tenant` has no members-mutation route yet, so the page is wired to this legacy one.

**Fix:** validate `role` against an explicit membership-role allow-list and reject any role
ranked above the actor's. Owner-transfer should be a distinct, owner-only action.

### M2 — `withTenant` superadmin RLS bypass is load-bearing while RLS is OFF
**`lib/db/tenant-context.ts:18-37`** (`role: "superadmin"` bypasses RLS per policy) ·
**`app/api/tenant/[id]/quota/route.ts:16-18`** (`targetCtx(..., role: "superadmin")`)

The cross-tenant superadmin pattern builds a `TenantContext` with `role: "superadmin"` and the
*target* tenant id. The design relies on RLS policy to scope; but `tenant-context.ts:24`
states RLS is **not enabled yet**, so isolation depends entirely on each repo's explicit
`tenant_id` predicate. That holds today (repos are disciplined), but the moment any future
query in a `withTenant` block omits the `tenant_id` filter and trusts RLS, a superadmin-role
context silently reads/writes across tenants. The invariant ("every read/write scoped") is
met by convention, not by the mechanism the code claims to lean on.

**Fix:** ship the RLS migration (drizzle/rls/enable-rls.sql) so the `set_config` context is
actually enforced, or add a lint/test asserting every tenant-scoped query carries a
`tenant_id` predicate. Until then, treat the explicit predicate as the ONLY isolation and keep
auditing for omissions.

### M3 — Unauthenticated DB-availability oracle on public + protected routes
Many routes return distinct envelopes for "no DB" vs other states *before* the auth check in
some public routes and after it in protected ones. The public auth routes
(`register`/`password-reset*`) return `503 {code:"no_db"}` (`...register/route.ts:14`) to
anonymous callers, leaking deployment/DB state. Minor, but it is unauthenticated
infrastructure disclosure.

**Fix:** return a generic 503 without the `no_db` code on unauthenticated endpoints.

### M4 — `handle()` 500 path is the only thing standing between stack traces and clients
**`modules/_shared/api.ts:46-59`**

Good that `handle()` swallows non-`ServiceError` errors into a generic 500. But several routes
do work *outside* `handle()` (e.g. `await req.json()` before the wrapper, or routes that build
responses manually like `app/api/tenant/members/[id]/route.ts:40` returns
`error: String(err)`). The legacy members route literally returns the raw error string to the
client. Any rebuild route that mirrors that pattern leaks internals.

**Fix:** ensure every handler body (including JSON parsing) runs inside `handle()`, and never
return `String(err)` to the client. Audit for `error: String(err)` / `err.message` in
responses.

---

## LOW

### L1 — CSRF posture relies on JSON content-type, not an explicit token
Custom mutating routes authenticate via the next-auth session cookie and accept
`application/json`. Cross-site form posts can't set a JSON content-type without a CORS
preflight, so classic CSRF is mitigated *in practice*. But there is no explicit CSRF token or
`sameSite`/origin assertion on the custom routes (next-auth's own CSRF only covers its
endpoints). If any route is ever relaxed to accept form-encoded bodies, CSRF opens up.

**Fix:** confirm the session cookie is `sameSite=lax|strict` (next-auth default is `lax`) and
consider an origin check helper for mutations.

### L2 — External gateway poller is forced through a user session
**`app/api/wa/outbox/sendable/route.ts:12-18`**

The route is documented as polled by an external gateway (extension/WAHA) yet is gated by
`requirePermission("data.read")` — i.e. it needs a logged-in user's cookie. Either the gateway
is impersonating a user session (credential-sharing smell) or the route is mis-documented.
Contrast the legacy WA gateway routes that use a dedicated `x-wa-gateway-token`.

**Fix:** if a machine poller calls this, give it a scoped service token (like the legacy
`x-wa-gateway-token` routes) instead of a human session.

### L3 — `trustHost: true` unconditionally
**`lib/auth/auth.config.ts:19`**

`trustHost: true` is set for all environments. Fine behind a trusted proxy/Vercel, but it
trusts the inbound Host header for callback URL construction; combined with no explicit
`AUTH_URL`, a misconfigured edge could enable host-header injection in auth flows.

**Fix:** set `trustHost` only when running on the known platform, and pin `AUTH_URL` in prod.

---

## What was checked and is SOUND (no finding)

- **Route auth coverage:** every rebuild `app/api` route except the 3 intentionally public
  auth routes calls `requirePermission`/`getTenantContext`. Mutations consistently require
  write-grade permissions (`data.write` / `tenant.*.manage` / `platform.manage`), reads use
  `data.read` — verified across contacts, deals, enrichment, handoff, marketplace, sales, wa,
  settings, entitlements.
- **Superadmin-only actions** (tenant create/activate/suspend/purge/quota, provision, platform
  users/settings/audit) all gate on `platform.manage`, which only `role: "superadmin"` holds —
  effectively `is_superadmin`-only. `lib/auth/auth.ts:25-37` derives `superadmin` solely from
  `app_user.is_superadmin`, not from a tenant membership role, so it can't be reached by a
  tenant admin.
- **Multi-tenant scoping:** every rebuild repo (crm, sales, settings, wa, outreach, etc.)
  filters `eq(table.tenantId, ctx.tenantId)` on every read/write and stamps `tenantId:
  ctx.tenantId` on insert/update — does not depend on RLS. `tenantId` is read from the signed
  JWT, never from request body/params (no client-supplied tenant id found).
- **Injection:** no string-built SQL anywhere in `modules/**`; all queries are drizzle
  parameterized, including `set_config(... , ${ctx.tenantId})` in `withTenant`. Numeric query
  params (limit, max) are clamped (`Math.min/Math.max`).
- **Edge/Node split:** `middleware.ts` uses `authConfig` (providers `[]`, no scrypt/Postgres);
  the heavy Credentials provider lives only in `lib/auth/auth.ts` (Node). Correct.
- **Secret exposure:** AI BYOK keys surface only as `hasTenantKey`/`hasPlatformKey` booleans
  (`modules/settings/service.ts:296-303`); mailbox config explicitly excludes secrets; no
  `passwordHash` returned to clients; `DEEPSEEK_API_KEY` is server-only. Passwords hashed with
  scrypt (`modules/auth/password.ts`), never stored/returned in plaintext.
- **IDOR on self-scoped resources:** `auth/sessions/[id]` revoke checks `row.userId !==
  requesterUserId` and 404s (`modules/auth/service.ts:215-221`); branding theme is keyed to
  `ctx.userId`. No `[id]` is trusted without an ownership/tenant predicate.
- **AI invariant:** the only module that calls AI is `modules/sales/service.ts`, exclusively
  via `meteredGenerateText` (`lib/ai/meter`), which enforces tenant scope + credit +
  kill-switch. No direct provider calls in `modules/**`.
- **Migration script:** `scripts/apply-rebuild-migration.mts` aborts on destructive DDL, runs
  in a transaction with rollback, loads creds from `.env.local` (not hardcoded), and uses a
  parameterized verification query.

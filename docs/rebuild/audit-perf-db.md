# Rebuild Audit — Performance + DB (perf-db)

> Adversarial audit of the Agentic Sales AI REBUILD (Sainskerta Loop Phase 05).
> Scope: `modules/**`, the new `app/api/**` routes, `app/(app)/**` + auth pages,
> `lib/auth/**`, `middleware.ts`, `scripts/apply-rebuild-migration.mts`.
> Dimension: **perf-db** — N+1, missing indexes on hot columns, unbounded list
> queries, soft-delete filters, heavy work in the request path.

## Summary (counts by severity)

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 4 |
| MEDIUM   | 7 |
| LOW      | 4 |

**Top 3 findings**
1. **HIGH** — `deleted_at` is filtered on *every* read but indexed *nowhere* (all 20 module schemas). Every list/get does a `deleted_at IS NULL` predicate with no supporting (partial) index → as soft-deleted rows accumulate, hot tables (`message_v2`, `contact`, `deal`, `activity`) degrade to wider index/heap scans.
2. **HIGH** — Unbounded list queries everywhere. No `list*` repo method or the routes/pages that call them (`/api/contacts`, `/api/companies`, `/api/conversations`, `/api/messages`, `/api/deals`, `/api/activities`) applies a `LIMIT`/pagination. A single big tenant returns its entire table per page load.
3. **HIGH** — N+1 cascade fan-out in `crm` soft-delete/restore. Deleting one company loops its contacts → each contact loops its deals → each deal lists+deletes activities, and **every** repo call opens its own `withTenant` transaction (BEGIN + 3×`set_config` + COMMIT). One "delete company" can fire hundreds of round-trips.

---

## HIGH

### H1 — `deleted_at` missing from every index, but present in every read predicate
- **Where:** all `modules/*/schema.ts` index blocks. Examples:
  - `modules/crm/schema.ts:70-73,116-122,159-163,191-197,218-222` (company/contact/pipeline/stage/deal/activity — `tenant_idx` + foreign-id idxs, **no** `deleted_at`).
  - `modules/inbox/schema.ts:65-71,94-101` (`message_v2.conversationIdx` is `(tenant_id, conversation_id, created_at)` — no `deleted_at`).
- **Issue:** Reads consistently do `WHERE tenant_id = ? AND deleted_at IS NULL [AND fk = ?] ORDER BY created_at`. With no index that includes `deleted_at`, Postgres filters dead (soft-deleted) tuples after the index scan / via heap, and the `tenant_id`-only index becomes progressively less selective as trash grows. Hottest tables are `message_v2`, `activity`, `contact`, `deal`.
- **Fix:** Add **partial indexes** matching the live-read shape, e.g.
  `CREATE INDEX contact_live_idx ON contact (tenant_id, created_at DESC) WHERE deleted_at IS NULL;`
  and `CREATE INDEX message_live_idx ON message_v2 (tenant_id, conversation_id, created_at) WHERE deleted_at IS NULL;`. Partial indexes also stay small (exclude trash). Do the same for the `*Trashed` reads only if trash views are hot (usually not).

### H2 — Unbounded list queries (no LIMIT / pagination) across all modules
- **Where (repos):** every `list*` in `modules/crm/repo.ts` (e.g. `listCompanies:39`, `listContacts:151`, `listDeals:558`, `listActivities:696`), `modules/inbox/repo.ts` `listMessages:182` + `listMessagesByConversation:232`, `modules/outreach/repo.ts` `listRuns:571` / `listEscalations:700`, etc. None take/apply a `limit`.
- **Where (routes/pages):** `app/api/messages/route.ts:20` returns the *entire* thread; `app/(app)/inbox/page.tsx:258,263` and `app/(app)/contacts/page.tsx:223,228` fetch full `/api/conversations`, `/api/contacts`, `/api/companies` with no `?limit`/cursor.
- **Issue:** A tenant with tens of thousands of contacts/messages ships the whole set over the wire and into the client on every page open. `message_v2` (highest cardinality) is the worst: an old WhatsApp thread streams every bubble.
- **Fix:** Add cursor/keyset pagination (`WHERE created_at < ? ... LIMIT n`) to the `list*` repos and thread the `limit`/`cursor` query params through the routes; for `listMessages` default to the most-recent N and lazy-load older on scroll.

### H3 — N+1 cascade fan-out in CRM delete/restore, each call its own transaction
- **Where:** `modules/crm/service.ts:246-254` (`softDeleteCompany` → `listContactsByCompany` → per-contact `cascadeContactDeleted`), `805-817` (`cascadeContactDeleted` loops deals, per-deal `softDeleteDeal` + `cascadeSubjectActivitiesDeleted`), `820-831` / `834-841` (per-activity `softDeleteActivity` / `hardDeleteActivity` in a loop).
- **Issue:** Two compounding costs:
  1. **N+1 query count** — purge/delete of a parent issues O(contacts + deals + activities) individual statements instead of set-based `UPDATE … WHERE … IN (…)` / `WHERE subject_id IN (…)`.
  2. **Transaction-per-call** — `withTenant` (`lib/db/tenant-context.ts:27-37`) wraps *each* repo method in its own `db.transaction` with a `BEGIN`, three `set_config` round-trips, and a `COMMIT`. So every looped `softDeleteActivity` pays ~5 round-trips. Hundreds of children ⇒ thousands of round-trips, and the cascade is **not atomic** (a mid-loop failure leaves a half-deleted tree).
- **Fix:** Push cascades into set-based repo helpers (the pattern already exists for stages — `setStagesDeletedByPipeline` `crm/repo.ts:525`, and messages — `setMessagesDeletedByConversation` `inbox/repo.ts:324`): add `setDealsDeletedByContactIds`, `setActivitiesDeletedBySubjects(subjectType, ids[])`. Ideally run the whole cascade inside **one** `withTenant` transaction (pass the `tx` down) for atomicity + a single BEGIN/COMMIT.

### H4 — Multi-transaction fan-out on the read-hot dashboard + every mutation
- **Where:** `modules/reports/service.ts:228-247` (`overview` runs 8 aggregate repo calls via `Promise.all`, but each is a separate `withTenant` ⇒ 8 independent `BEGIN/set_config×3/COMMIT` cycles); every service mutation also does get-then-write-then-audit as 2–3 separate transactions (e.g. `crm/service.ts:217` `getCompany` then `240` `updateCompany`, plus `audit` `851` on the raw `db`).
- **Issue:** The dashboard overview is the most-loaded screen and pays ~32 extra round-trips just on transaction ceremony (8 × 4). Each write path pays the BEGIN/COMMIT tax 2–3×. On a pooled serverless/Neon connection this latency dominates the actual query time.
- **Fix:** For `overview`, run all aggregates inside a **single** `withTenant(ctx, tx => Promise.all([... using tx ...]))` so the context is set once. For mutations, fold the existence-check + write (+ audit) into one `withTenant` transaction; this also makes the read-modify-write atomic.

---

## MEDIUM

### M1 — In-memory `count()` instead of SQL `COUNT(*)`
- **Where:** `modules/outreach/repo.ts:181-195` (`countSteps` selects all step ids and returns `rows.length`); `modules/tenant/repo.ts:221-229` (`countActiveMembers` selects all member ids, `rows.length`).
- **Issue:** Transfers every row to the app just to count it. `countSteps` is called on every step create/delete/restore via `syncStepCount` (`outreach/service.ts:346-349`). `superadmin/repo.ts` already does this right with `count()` — these two are the outliers.
- **Fix:** Use drizzle `count()` aggregate (`select({ n: count() })`) and read `rows[0].n`.

### M2 — `syncStepCount` doubles the writes on every step mutation
- **Where:** `modules/outreach/service.ts:290,324,333,341,346-349`.
- **Issue:** Each step create/delete/restore/purge triggers `countSteps` (a full scan, see M1) **plus** an `updateCadence` write to persist `step_count` — each in its own transaction. Denormalizing a count that could be computed on read trades read cost for extra write amplification + round-trips on the hot mutation path.
- **Fix:** Either compute `step_count` with a SQL `count()` only when listing cadences, or update it with an atomic `step_count = step_count ± 1` increment in the same transaction as the step mutation (no separate scan).

### M3 — Per-row inserts in discovery ingest (N+1 writes)
- **Where:** `modules/enrichment/service.ts:265-285` (`for (const r of input.results) await insertResult(...)`).
- **Issue:** A discovery run with N results does N sequential single-row inserts, each its own `withTenant` transaction. A 200-result crawl = 200 × (~5 round-trips). This runs in the request path of the discovery POST.
- **Fix:** Batch with a single multi-row `insert(...).values(rows)` inside one `withTenant` transaction (also makes the "all results or none" semantics atomic, matching the job's `running → done/error` intent).

### M4 — `seedTechniques` fires 17 sequential upsert transactions
- **Where:** `modules/sales/service.ts:369-379`.
- **Issue:** 17 separate `upsertTechniqueByKey` calls, each a `withTenant` transaction, on the seed path. Idempotent and infrequent, but still 17× the round-trip ceremony where one batched upsert would do.
- **Fix:** Single batched `insert().values(17 rows).onConflictDoUpdate(...)` in one transaction.

### M5 — `getUserByEmail` login lookup filters `deleted_at` with no composite/partial index
- **Where:** `modules/tenant/repo.ts:139-146`; schema `modules/tenant/schema.ts:31-43` — `app_user.email` is `.unique()` (indexed) but the unique index is on `email` alone; the query adds `AND deleted_at IS NULL`.
- **Issue:** Low-volume (one row per email) so impact is small, but it's the auth hot path and the predicate isn't fully index-covered. Same shape as `tenant.getTenantBySlug` (`tenant/repo.ts:56`).
- **Fix:** Acceptable as-is given uniqueness, but a partial unique index `(email) WHERE deleted_at IS NULL` makes the live-user lookup exact and lets a soft-deleted email be re-registered without a unique-violation.

### M6 — `firstMembershipForUser` orders by `created_at` with no supporting index
- **Where:** `modules/tenant/repo.ts:210-218` — `WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`. Schema has `membership_user_idx (user_id)` (`tenant/schema.ts:85`) but not `(user_id, created_at)`.
- **Issue:** Runs on every login. With the `user_id`-only index Postgres still sorts the matched rows. Tiny per-user row counts make this minor, but it's a hot path.
- **Fix:** Index `(user_id, created_at DESC) WHERE deleted_at IS NULL`, or just accept it (membership-per-user count is ~1–5).

### M7 — `password_reset.token` has a redundant duplicate index
- **Where:** `modules/auth/schema.ts:38` (`.unique()` on `token`) **and** `:44` (`index("password_reset_token_idx").on(t.token)`).
- **Issue:** Two indexes on the same single column — the unique constraint already creates a B-tree. The extra non-unique index is dead weight (slows writes, wastes space) with no read benefit.
- **Fix:** Drop `password_reset_token_idx`; keep the unique index.

---

## LOW

### L1 — Audit write on every mutation, on the raw (untenanted) `db`, in-line
- **Where:** `modules/superadmin/repo.ts:22-39` (`insertAudit` on plain `db`), invoked by every service `audit()` helper (`crm/service.ts:851`, `outreach/service.ts:840`, etc.).
- **Issue:** Each successful mutation pays an extra synchronous insert round-trip in the request path. Append-only audit is fine, but it's serial with the response. Not tenant-wrapped (acceptable — it's a platform table), and `audit_log_v2` has no retention/partitioning so it grows unbounded.
- **Fix:** Acceptable for a prototype; if latency matters, fire-and-forget or batch the audit insert, and plan a retention/partition strategy for `audit_log_v2`.

### L2 — `auth_session` / `password_reset` grow unbounded (no expiry purge)
- **Where:** `modules/auth/repo.ts` — sessions are revoked (`revoked_at`) and resets consumed (`used_at`) but never deleted; `expires_at` is stored but no sweep removes expired rows.
- **Issue:** `listSessionsForUser` (`auth/repo.ts:26`) scans a table that only grows. Over time the `auth_session_user_idx` bloats with dead sessions.
- **Fix:** A periodic purge of `revoked_at IS NOT NULL OR expires_at < now()` (cron/Inngest), or a partial index `(user_id) WHERE revoked_at IS NULL`.

### L3 — Client-side full-table joins on list pages
- **Where:** `app/(app)/inbox/page.tsx:261-272` (fetch all contacts → `contactById` map), `app/(app)/contacts/page.tsx:226-237` (fetch all companies → `companyById` map).
- **Issue:** Not a DB N+1 (single list fetch each, joined in JS), but it pairs with H2: both sides are unbounded, so the join cost scales with total contacts/companies regardless of how many conversations are visible.
- **Fix:** Once H2 adds pagination, resolve names server-side for the page's slice, or fetch only the referenced ids (`/api/contacts?ids=`), instead of the whole table.

### L4 — `dealsByStage` aggregate can't use a covering index for the GROUP BY
- **Where:** `modules/reports/repo.ts:184-199` — `GROUP BY stage_id` over `deal` filtered by `tenant_id AND deleted_at IS NULL`.
- **Issue:** `deal_stage_idx` is `(tenant_id, stage_id)` (`crm/schema.ts:193`) so the grouping is reasonably supported, but `deleted_at` (H1) isn't in it, so live/dead filtering still touches the heap. Same applies to the other `groupBy` rollups in `reports/repo.ts`.
- **Fix:** Covered by the H1 partial-index fix; no separate action needed.

---

## Notes / things that are CORRECT (no finding)

- Tenant + foreign-id-like columns are **well indexed** across schemas (`tenant_idx` everywhere; composite `(tenant_id, fk)` for `company_id`, `workspace_id`, `contact_id`, `pipeline_id`, `stage_id`, `conversation_id`, `flow_id`, `job_id`, etc.). Index coverage on those hot columns is good.
- `getTenantContext()` (`lib/auth/session-context.ts:9-14`) reads the JWT — **no per-request DB hit** to resolve tenant/role. Good.
- Bounded reads that matter are already capped: `listDueEnrollments` `LIMIT 100` (`outreach/repo.ts:364,379`), `listSendable` `LIMIT 20` (`wa/repo.ts:120,134`), `recentAudit` `LIMIT 50` (`superadmin/repo.ts:41-48`).
- The migration runner (`scripts/apply-rebuild-migration.mts`) applies all `CREATE` (incl. `CREATE INDEX`) statements in a single transaction — fine.
- Aggregations in `reports/repo.ts` use real SQL `count()`/`sum()`/`GROUP BY` (not in-memory reduction) — correct; the only in-memory counts are M1.

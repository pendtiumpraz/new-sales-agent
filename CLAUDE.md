# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **demo-first** agentic sales platform (Next.js 14 App Router + TypeScript), Indonesia/WhatsApp-focused. The default experience is a fully-navigable demo on **mock data** — but a real SaaS tier now sits behind it, **gated on DB + keys**: multi-tenant Postgres + RBAC, next-auth, Stripe billing, SMTP/OAuth/ESP email, Inngest jobs, and WhatsApp transport all activate only when `POSTGRES_URL` / provider keys are present. In pure-mock mode those paths **no-op or fall back** (see `progress.md` §5). So: treat screens as demo-grade, but know that the integration code is real and partially wired — check whether a feature is mock-backed (`lib/api-mock/`) or DB-backed (`app/api/**`, `lib/db/`) before reasoning about it. Still no test suite.

`progress.md` (repo root) is the **living source of truth** for the active **Closing-Flow AI** initiative — read it before touching `lib/sales/`, `lib/market-fit/`, `lib/kb/`, or `lib/wa/`, and update it in the same commit as each feature.

> **⚠️ Active initiative — Sainskerta Loop rebuild (started 2026-06-28).** The project is adopting the **Sainskerta Loop Workflow** (`loop-workflow/`) to drive a **full greenfield rebuild** that complies with `loop-workflow/RULES-OF-THE-GAME.md` (no mock data, modular monolith, CRUD-one-page + right-drawer, soft-delete, backend-first, audit-before-deploy). Operate it via the `/loop-workflow` skill. State lives in `.claude/loop.md` + `loop-progress.md` (a **separate** tracker — do not confuse with `progress.md`) + `user_requirement.md`. Currently at **Phase 00 (Prerequisites)**, blocked on user architecture decisions in `user_requirement.md`. Until Phase 02 wireframe is approved, **nothing destructive happens** — the current mock-first app described below is still live.

## Commands

- `npm run dev` — dev server (Turbopack). Routes compile on **first visit**, so the first load of each page lags.
- `npm run preview` — `next build && next start`. **Use this for demos** (client-side nav is instant; `dev` is not).
- `npm run lint` — `next lint`. This and `tsc` are the only real checks: **builds skip type-checking and ESLint** (`next.config.mjs` sets `ignoreBuildErrors` + `ignoreDuringBuilds`), so a green build does not mean type-clean. Verify with `npm run lint` / `npx tsc --noEmit`.
- `npm run seed` — regenerate mock JSON fixtures in `lib/mock-data/` (faker, fixed seed).
- DB (Drizzle + Neon Postgres): `db:generate` (schema → migration), `db:push` (sync schema, no migration), `db:migrate` (apply migrations), `db:seed` (`scripts/db-seed.ts`), `db:seed-ai` (AI provider/model catalog), `db:seed-wa` (WA session), `db:studio`.
- No test runner and no formatter (Prettier/Biome) are configured — don't assume `npm test`/`npm run format` exist. `playwright` is a devDependency but there is **no test suite** (no `.spec` files, no config).
- Skills: `/ship` (commit + push per the git workflow below) and `/db-refresh` (regenerate fixtures and/or sync+seed Postgres in the right order) — both user-triggered only.

## AI provider

There are **two AI paths** — know which one a route uses:

- **Static demo path** (`lib/ai/provider.ts`): Deepseek called **directly** (not via Vercel AI Gateway). `NEXT_PUBLIC_AI_PROVIDER` switches behavior: `mock` (offline heuristics) vs `deepseek` (real API); without `DEEPSEEK_API_KEY` it falls back to mock. Models: `deepseek-v4-pro` (chat), `deepseek-v4-flash` (fast drafts), `deepseek-reasoner` (analysis). `GATEWAY_MODEL_*` are backward-compat aliases for these. Offline fallback logic is in `lib/api-mock/kb.ts` (`composeKbReply`).
- **Live metered path** (`lib/ai/meter.ts` + `registry.ts` + `adapters.ts`): the real SaaS path. Every live call goes through `meteredGenerateText` / `meteredStreamText`, which (1) check kill-switch + tenant credit ($0 → throws → callers degrade gracefully, never show "token habis"), (2) resolve the tenant's **one active model** from DB (`tenant_active_model → ai_model → ai_provider → credential`) using tenant **BYOK** key or platform env-key fallback, (3) log tokens + cost to `ai_usage`. **Multi-provider** (deepseek / anthropic / openai / google) via `adapters.ts` — add a provider by installing `@ai-sdk/<x>` and adding a `case`.
- Reasoning models (`v4-flash`/`v4-pro`/`*-reasoner`) burn output tokens on hidden reasoning, so the meter **floors** `maxOutputTokens` to ≥1200 for them — a small cap on a reasoning model returns empty text. Don't pass tight output caps to those expecting short replies.
- Keys are **server-side only**; `NEXT_PUBLIC_*` is the one client-safe flag. Sampling params (temperature) are intentionally omitted — they 400 on Anthropic Opus and the registry is provider-agnostic.

## Architecture notes

- **Two data layers, by design.** Screens read **mock** data via React Query hooks in `lib/api-mock/` (deliberately not MSW). The real **multi-tenant Postgres** layer (`lib/db/`, `app/api/**`) is live but DB-gated — many screens still read mocks. When a feature seems inert in mock mode, that's expected; the logic lives behind `app/api/**` + a DB.
- **Multi-tenancy + auth + RBAC** (DB-gated): next-auth (`lib/auth/`), tenant scoping via `withTenant` / `TenantContext` (`lib/db/tenant-context.ts`) with belt-and-suspenders RLS, role guards in `lib/rbac/`. Tenant lifecycle (activate/suspend/credit) is admin-driven; **grain is the tenant/account, not per-user**. Billing = Stripe (`lib/billing/`), email = SMTP/OAuth/ESP (`lib/mail/`), background jobs = Inngest (`lib/inngest/`).
- **Closing-Flow AI** (`lib/sales/`, `lib/market-fit/`, `lib/kb/`, `lib/wa/orchestrator.ts`) — the main initiative; **1 workspace = 1 product**. A conversation state-machine (`stage-machine.ts`: rapport→discovery→value→objection→closing) drives a per-workspace `SalesPlay` (price-gate, value-ladder, adab, handoff). A **humanizer** (`lib/ai/humanizer.ts`) splits one LLM reply into short paced bubbles (1 LLM call; client/gateway does the pacing). `priceGate` hides price until need+value land; closing techniques (17 seeded in `lib/kb/closing-techniques.ts`) surface only at the closing stage; complaint/negotiation/credit-$0 → **handoff to human**, never an error. **Read `progress.md` before changing any of this.**
- **WhatsApp transport is gateway-agnostic** (`lib/wa/`, contract in `docs/wa-gateway-*.md`). The brain (orchestrator/humanizer/stage-machine/rate-limit/guardrails) stays server-side; transports just poll an outbox + push inbound. Two implementations under `gateway/`: **WAHA** (server-gateway, `gateway/waha/`) and a **Chrome MV3 extension** (`gateway/extension/`, also does LinkedIn/IG discovery). Both are **reply-only against a backend allowlist**. Honest caveat (in the docs): both are WA Web automation and violate WA ToS — for scale, WA Cloud API is the safe path.
- State: Zustand stores in `lib/stores/` (pipeline store is persisted). Server-mock state via TanStack Query.
- i18n: `next-intl`, **Bahasa Indonesia is default**, English is the toggle. Strings live in `messages/id.json` / `messages/en.json` — add keys to both.
- Path alias: `@/*` → repo root.
- `drizzle.config.ts` manually loads `.env.local` (the Drizzle CLI doesn't auto-load it like Next does) — Postgres vars must be in `.env.local`, not `.env`.
- If `next start` 500s with `MODULE_NOT_FOUND: _document`, delete `.next` and rebuild.
- Per-feature explainers live in `docs/` (`01`–`17` plus `wa-gateway-*`, `extension-*`). One feature per commit → one doc.

## Code style

- TypeScript `strict`. Prefer `interface` over `type` for object shapes (matches existing `lib/types/`). Double quotes, semicolons.
- ESLint is **intentionally lenient** for the prototype: `any` is allowed, unused vars and `prefer-const` are warnings. Don't add ceremony just to satisfy the linter.

## Git workflow

- **Commit to the local `new-main` branch. Push only to `pendtiumpraz HEAD:main`** — `git push pendtiumpraz HEAD:main` (remote `pendtiumpraz` = `github.com/pendtiumpraz/new-sales-agent`, into its `main`). `new-main` already tracks `pendtiumpraz/main`. **Do not push to `origin` / `origin new-main`** (reverted 2026-06-23), and never commit to local `main`.
- Conventional commits: `type(scope): description` — imperative mood, lowercase, no trailing period, issue refs inline (e.g. `#185`). Example: `fix(autopilot): wrap each child in CardErrorBoundary #185`.
- One feature per commit; each feature gets an explainer doc under `docs/`.

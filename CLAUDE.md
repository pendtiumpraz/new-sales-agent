# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **prototype/demo** of an agentic sales platform (Next.js 14 App Router + TypeScript). Not production: no real auth, no real integrations, no tests. Almost every feature runs on mock data. Treat it as a fully-navigable demo, not a hardened app.

## Commands

- `npm run dev` — dev server (Turbopack). Routes compile on **first visit**, so the first load of each page lags.
- `npm run preview` — `next build && next start`. **Use this for demos** (client-side nav is instant; `dev` is not).
- `npm run lint` — `next lint`. This and `tsc` are the only real checks: **builds skip type-checking and ESLint** (`next.config.mjs` sets `ignoreBuildErrors` + `ignoreDuringBuilds`), so a green build does not mean type-clean. Verify with `npm run lint` / `npx tsc --noEmit`.
- `npm run seed` — regenerate mock JSON fixtures in `lib/mock-data/` (faker, fixed seed).
- DB (Drizzle + Neon Postgres): `db:generate` (schema → migration), `db:push` (sync schema, no migration), `db:migrate` (apply migrations), `db:seed` (`scripts/db-seed.ts`), `db:studio`.
- No test runner and no formatter (Prettier/Biome) are configured — don't assume `npm test`/`npm run format` exist.

## AI provider

- `NEXT_PUBLIC_AI_PROVIDER` switches behavior: `mock` (offline heuristics) vs `deepseek` (real API). Without `DEEPSEEK_API_KEY` it falls back to mock automatically.
- Provider lives in `lib/ai/provider.ts` — Deepseek called **directly** (not via Vercel AI Gateway). Models: `deepseek-chat` (general) and `deepseek-reasoner` (analysis). Key is server-side only.
- Offline fallback logic is in `lib/api-mock/kb.ts`.

## Architecture notes

- **Data layer is mocked via React Query hooks in `lib/api-mock/`** (deliberately not MSW). Real Postgres/Drizzle code in `lib/db/` exists but most screens read mocks.
- State: Zustand stores in `lib/stores/` (pipeline store is persisted). Server-mock state via TanStack Query.
- i18n: `next-intl`, **Bahasa Indonesia is default**, English is the toggle. Strings live in `messages/id.json` / `messages/en.json` — add keys to both.
- Path alias: `@/*` → repo root.
- `drizzle.config.ts` manually loads `.env.local` (the Drizzle CLI doesn't auto-load it like Next does).
- If `next start` 500s with `MODULE_NOT_FOUND: _document`, delete `.next` and rebuild.

## Code style

- TypeScript `strict`. Prefer `interface` over `type` for object shapes (matches existing `lib/types/`). Double quotes, semicolons.
- ESLint is **intentionally lenient** for the prototype: `any` is allowed, unused vars and `prefer-const` are warnings. Don't add ceremony just to satisfy the linter.

## Git workflow

- **Commit to a branch named `new-main`, and always push to `new-main`.** Do not commit or push to `main`.
- Conventional commits: `type(scope): description` — imperative mood, lowercase, no trailing period, issue refs inline (e.g. `#185`). Example: `fix(autopilot): wrap each child in CardErrorBoundary #185`.
- One feature per commit; each feature gets an explainer doc under `docs/`.

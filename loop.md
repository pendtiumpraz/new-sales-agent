# Loop — UI/UX audit → 9–10/10

> **Autonomous loop (~10 min interval).** Each tick: (1) read `progress.md` + this
> file + `docs/ui-ux-audit-2026-06.md`; (2) do the NEXT batch from the plan; (3)
> run `npx tsc --noEmit` + lint; (4) tick the audit checklist; (5) append to the
> Interval log below (what was done + what's next); (6) `git commit` + push to
> **`pendtiumpraz` only** (`git push pendtiumpraz HEAD:main`) — NOT origin/new-main.

## Goal
Lift the app UI/UX from **7.2/10** (design-system **6.5/10**) toward **9–10/10**
by executing the improvement plan in `docs/ui-ux-audit-2026-06.md`, one batch per
interval. Keep every step tsc+lint green and pushed.

## Done so far
- **Batch A** (`842e58a`) — CSS foundation: brand-color unified to `--primary`,
  `highlight` token mapped, `prefers-reduced-motion` guard, `bg-danger/10/80` fix.
- **Batch B** (`d9b0814`) — `/prospecting` redirect → `/contacts/discovery`; stripped
  9 `(doc NN)` dev refs from PageHeaders; content demo-clock → `Date.now()`.

## Backlog (ordered — biggest score-lever first)
1. **ErrorState app-wide** — shared `components/shared/error-state.tsx` (+ refetch),
   applied where queries currently fall through to empty on failure: dashboard,
   settings/{team,ai,billing,mailboxes,compliance,dsar}, contacts/profiles,
   ecommerce, marketplace, admin, cadences, contacts/map.
2. **AlertDialog confirmations** — replace `window.confirm/prompt` on destructive/
   money actions (workspace archive, DSAR/retention purge, member/mailbox remove,
   token regen, admin credit grant); type-to-confirm for permanent deletes.
3. **Shared-pending-flag fix** — track in-flight row id (settings/ai, team,
   marketplace, dsar) so one action doesn't disable every row.
4. **a11y sweep** — `aria-pressed` on toggle pills, `aria-label` on bare select/
   checkbox, `overflow-x-auto` on wide tables, mask secrets (ingest token, password),
   mobile tap targets ≥44px, tokenize WhatsApp green.
5. **IA / flow** — dashboard CTAs → active workspace (not `/pipeline`); cadence
   list↔detail mock fallback; dirty-state guards (penawaran/[id], cadence-builder,
   retention/[flowId]); de-stub or badge Reports actions.
6. **Front-door** — rewrite marketing hero around the closing-flow; move public
   surfaces (login/register/invite/pending/marketing/docs/use-case/q/unsubscribe)
   onto next-intl so the EN toggle works; lang switcher.
7. **Polish** — typography scale; token-bypass sweep (`switch.tsx` `bg-slate-200`,
   status badge maps); clear-search (x) on search inputs; empty states (`/m/contacts`,
   FieldMap); validation on `/m/visits/new`; strip JSON.stringify in Discovery dialog.

## Interval log
<!-- newest at the bottom; each tick appends: done + next -->
- **Setup** — loop.md created; cron scheduled (job `a79b4b5f`, every 10 min at :03/:13/…/:53, session-only, 7-day expiry).
- **Tick 1 (setup run)** — Batch C #1 ErrorState STARTED. Discovery: `components/shared/error-state.tsx` ALREADY EXISTS (icon/title/desc/onRetry) — the real gap is pages not USING it on `isError`. Wired it to **marketplace** (queryFn now throws on HTTP error instead of masquerading as "Marketplace nonaktif", + `isError` → `<ErrorState onRetry={refetch}/>`). **Next tick:** roll ErrorState out to settings/{team,ai,billing,mailboxes,compliance,dsar}, admin, contacts/profiles, ecommerce, contacts/map, cadences, dashboard (make each query throw on `!r.ok` + add the isError branch).

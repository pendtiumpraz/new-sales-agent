# UI/UX + flow audit — Jun 2026 (multi-agent, all 54 pages + global CSS)

**Overall app UI/UX: 7.2/10** · **Global CSS / design-system: 6.5/10**

A polished prototype (cohesive shadcn/Tailwind, honest demo labels, real empty/loading
states on primary surfaces). Held back by 3 systemic drags: (a) `isError` omitted
app-wide (API failures look like empty states); (b) IA tension — legacy contacts/
pipeline deep-links + marketing/`/m` describe a different product than the workspace
closing-flow; (c) next-intl EN toggle does nothing on the public/front-door surfaces.

## Lowest-scoring pages (fix first)
| Page | Overall |
|---|---|
| /prospecting | 5 |
| /q/[token], /unsubscribe, /contacts, /cadences/[id] | 6 |
| dashboard, workspaces/[id], inbox, reports, settings/*, marketplace, content, ai-assistant, /m/* … | 7 |

(Most pages 7–8; login/cadences/autopilot/retention/penawaran/team ≈ 8. No 9–10 yet.)

## Top cross-cutting themes
- **`isError` omitted almost everywhere** — #1 repeated defect; failures fall through to empty states.
- **Legacy contacts/pipeline IA survives the workspace pivot** — dashboard/hub/docs deep-link to `/pipeline` + `/contacts`; marketing + `/m` describe a different product.
- **next-intl EN toggle dead on public surfaces** — login/register/invite/pending/marketing/docs/use-case/`/q`/`/unsubscribe` hardcoded ID.
- **Destructive actions w/o confirm / dirty-state guards** — archive, DSAR/retention purge, member/mailbox removal, token regen, unsaved-edit traps.
- **Dead-end stub affordances that look real** — Reports "Verifikasi/Tinjau", login "Lupa sandi?", compliance "Buat DPIA", `/m/visits/new` follow-up.
- **Shared-pending-flag bug** — one mutation `isPending` disables every row (settings/ai, team, marketplace, dsar).
- **Async work w/o progress modal** (violates own UX bar) — profiles bulk-enrich, autopilot mid-run.
- **a11y gaps** — bare `<select>`/checkbox w/o labels, color-only status, <44px mobile targets, unmasked secrets, no `overflow-x` on wide tables.

## Improvement plan → 9–10/10

### (A) Global / CSS + design-system
- [ ] Dark-mode: commit light-only (remove dead `darkMode:["class"]` wiring) OR add full `.dark` + toggle.
- [ ] Unify brand coral to ONE value (`--primary`/`--ring` in globals.css; autopilot keyframes use `hsl(var(--primary)/α)` not `rgba(251,94,59)`; docs token).
- [ ] Map the orphaned `--highlight` token in tailwind.config + route warnings through it; darken warning text to AA.
- [ ] Add `prefers-reduced-motion` guard (kill infinite animations) + gate count-up on `useReducedMotion`.
- [ ] Standardize focus rings (one convention).
- [ ] Sweep token bypass (~100 hex + ~88 raw palette classes) — start: `switch.tsx` `bg-slate-200`→`bg-input`, source/status badge maps.
- [ ] Add a typography scale (stop hand-tuning headings per page).

### (B) High-impact page fixes
- [ ] `/prospecting` broken redirect (5) → point at `/contacts/discovery`.
- [ ] Render `<ContactsTabs/>` on `/contacts` hub (cluster nav vanishes on entry).
- [ ] App-wide `isError` pattern (shared `ErrorState` + refetch) → dashboard, settings/*, profiles, ecommerce, marketplace, admin, cadences, map.
- [ ] Cadence list↔detail data source mismatch → detail falls back to mock hook (cards dead-end in mock).
- [ ] Dashboard CTAs → workspace IA (not `/pipeline`); taskHref by contactId/conversationId; persist completion.
- [ ] Workspace hub dual-Discovery entry + `/pipeline` cross-link.
- [ ] Malformed `bg-danger/10/80` → `bg-danger/10` (message-thread handoff banner — renders no fill).
- [ ] Dirty-state guards (penawaran/[id], cadence-builder, retention/[flowId]).
- [ ] De-stub or badge Reports actions.
- [ ] Rewrite marketing hero around the closing-flow.
- [ ] Move public surfaces onto next-intl (+ EN keys, lang switcher).

### (C) Quick wins
- [ ] `window.prompt/confirm` on destructive/money actions → shadcn `AlertDialog` (type-to-confirm for permanent deletes).
- [ ] Fix shared-pending-flag (track in-flight row id) — settings/ai, team, marketplace, dsar.
- [ ] Mask secrets (ingest token, team password) + reveal toggle.
- [ ] `overflow-x-auto` on wide tables (admin, compliance, `/q`).
- [ ] `aria-pressed` on toggle pills + `aria-label` on bare select/checkbox.
- [ ] Mobile tap targets ≥44px; tokenize WhatsApp green `#25D366`→`bg-whatsapp`.
- [ ] "Clear search" (x) on documentation, use-case, `/m/contacts`, profiles.
- [ ] Strip `(doc NN §X)` dev refs from user-facing PageHeader descriptions.
- [ ] Empty states for `/m/contacts` + `FieldMap`; validation on `/m/visits/new`.
- [ ] Strip placeholder bits — JSON.stringify in Discovery job dialog, content `NOW=2026-05-25`→`Date.now()`.

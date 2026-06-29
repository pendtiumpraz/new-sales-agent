# Rebuild Audit — Accessibility & UX Consistency (Sainskerta Loop Phase 05)

Adversarial audit. Dimension: **a11y-ux**. Scope: the rebuild FE only —
`app/(app)/**` rebuild pages (dashboard, workspace, inbox, pipeline, enrichment,
content, retention, ecommerce, marketplace, field, reports, escalations, cadences,
autopilot, settings/**, contacts/profiles), the auth/shell pages
(`app/{login,register,pending,onboarding}/**`, `app/(app)/layout.tsx`), the shared
UI primitives those pages depend on (`components/layout/side-nav.tsx`,
`components/layout/page-header.tsx`, `components/settings/settings-nav.tsx`,
`components/shared/{empty-state,error-state}.tsx`), and the Coral Sunset tokens in
`app/globals.css`.

Method: read the shell + a representative cross-section of every module's page;
programmatically scanned for `<label>` vs `htmlFor` association, `role="dialog"` /
`aria-modal` / `aria-label` on hand-rolled drawers & modals, icon-only `<button>`
accessible names, `focus-visible` rings, skip links, body scroll-lock and focus
traps; and computed WCAG contrast ratios for every Coral Sunset surface/text token
used as a button background or body text.

## Severity counts

- CRITICAL: 2
- HIGH: 5
- MEDIUM: 5
- LOW: 4

## What's correct (so the findings are calibrated)

- Every list page has a real **loading skeleton + custom empty state + error+retry**
  state (`EmptyState` / `ErrorState` are used consistently — content/reports/
  escalations/enrichment/field/retention/marketplace all branch
  `isLoading → isError → empty → data`). This invariant is genuinely met.
- The **right-drawer + soft-delete/restore/hard-delete(purge)** pattern is actually
  wired in the UI on M5/M7/M9 (Sampah tab, restore button, type-`HAPUS`-to-confirm
  purge). The destructive-action UX (type-to-confirm, distinct destructive tone) is
  good.
- The **shell is consistent**: `PageHeader` + `(app)` layout + `SideNav`/`TopBar` +
  `SettingsNav` give a coherent nav; `SettingsNav` even ships a desktop rail **and**
  a mobile horizontal-scroll bar.
- `login` / `pending` / `register` are well done: real `<Label htmlFor>`,
  `role="alert"` / `role="status"`, `aria-label` on the brand link, `aria-pressed`
  on the vertical chips, and a full `useReducedMotion()` path.

---

## CRITICAL

### C1 — Coral Sunset primary/teal/success/amber buttons fail WCAG contrast with white text (2.1–2.6 : 1)

- **Where:** `app/globals.css:15-16` (`--primary: 12 96% 67%` + `--primary-foreground: 0 0% 100%`),
  `:28-29` (`--tertiary: 173 80% 40%` + white), and the inline `success`/`highlight`
  swatches used as button/badge fills throughout (e.g. `app/(app)/reports/page.tsx`
  `ConfirmModal` tertiary button `bg-tertiary text-tertiary-foreground` :1287;
  `app/(app)/content/page.tsx` restore modal tertiary tone). The primary button is
  the single most-used control in the app: every `<Button>` default, every active
  nav item (`side-nav.tsx:240` `bg-primary text-primary-foreground`,
  `settings-nav.tsx:72`), the topbar Workspace CTA (`side-nav.tsx:399`).
- **Measured contrast (white text on the fill):**
  - primary coral `#FC7A5A` → **2.60 : 1**
  - tertiary teal `#14B8A5` → **2.49 : 1**
  - success green `#21C45D` → **2.30 : 1**
  - amber `#F59F0A` + white → **2.13 : 1**
  - destructive red `#EF4343` + white → **3.78 : 1**
  WCAG AA needs **4.5 : 1** for normal text and **3 : 1** even for large text / UI
  components. Primary/teal/success/amber all fail *both* thresholds; destructive
  fails normal-text AA.
- **Why it matters:** White-on-coral is the brand's default CTA. Low-vision users
  (and anyone on a sunny phone screen — the actual field-sales use case) cannot read
  the primary button label reliably. This is a brand-wide, every-screen defect, not
  a one-page bug.
- **Fix:** Darken the action tokens until white text clears 4.5 : 1 — coral needs to
  drop to roughly `L ≈ 48–50%` (e.g. `--primary: 12 83% 48%`), teal to `~33%`,
  success to `~33%`, and amber should keep its existing **dark** foreground
  (`--highlight-foreground` is already AA-safe at 8.2 : 1 — apply that same pattern to
  any amber *button*). Alternatively keep the light coral as a *decorative* fill but
  never put text on it. Verify each token pair with a contrast checker after the
  change; the brand hue is preserved, only lightness moves.

### C2 — Hand-rolled drawers & modals have no dialog semantics, no focus trap, no autofocus, and inconsistent scroll-lock

- **Where:** every rebuild page builds its own drawer/modal instead of the existing
  Radix `@/components/ui/{dialog,sheet}` (a project-wide `grep` confirms **none** of
  content/reports/escalations/marketplace/field/enrichment/retention/workspace import
  them). Representative: `app/(app)/content/page.tsx` `DrawerShell` (:1789-1845),
  `ConfirmModal` (:1847-1921), `PurgeModal` (:1923-2000); identical hand-rolled
  copies in `app/(app)/reports/page.tsx:680-818` (drawer), `:1219-1376`
  (Confirm/Purge); `app/(app)/escalations/page.tsx` drawer close at `:1541-1544`.
- **Issue (compounding):**
  1. The drawer/modal containers are bare `<div>`/`<aside>` — **no `role="dialog"`,
     no `aria-modal="true"`, no `aria-labelledby`**. A screen reader never announces
     "dialog" and never reads the title; the user has no idea a modal opened.
  2. **No focus trap and no initial focus.** `grep` for `useRef|autoFocus|focus()`
     in `workspace/page.tsx` and the modal helpers returns nothing. Focus stays on
     the trigger behind the scrim; Tab walks the page *under* the open drawer.
  3. **Background not inert.** With no trap and no scroll-lock (see below) the page
     behind a modal is fully reachable by keyboard.
  4. **Scroll-lock is applied inconsistently** — `marketplace/page.tsx:398-402`,
     `retention/page.tsx`, and `settings/team/page.tsx` set
     `document.body.style.overflow = "hidden"`, but content/reports/escalations/
     enrichment/field do **not**. So opening "the same" drawer scrolls the body on
     some pages and not others.
- **Why it matters:** These drawers are the primary create/edit surface and the
  modals gate every destructive action (delete/purge). Keyboard-only and screen-reader
  users can't reliably operate them, and Esc-to-close exists but focus-return does
  not. This affects every CRUD flow in the rebuild.
- **Fix:** Replace the hand-rolled shells with the Radix `Dialog`/`Sheet` primitives
  already in `components/ui/` (they provide `role="dialog"`, `aria-modal`, focus
  trap, focus return, scroll-lock, and Esc for free). If a custom shell must stay,
  add `role="dialog" aria-modal="true" aria-labelledby={titleId}`, move focus to the
  first field/close button on open via a `ref`, trap Tab within the panel, restore
  focus to the trigger on close, and lock body scroll uniformly.

---

## HIGH

### H1 — Form labels are not programmatically associated with their inputs (no `htmlFor`/`id`)

- **Where:** 66 `<label>` elements exist across 21 rebuild pages, but only 17
  `htmlFor` associations across 5 pages (`grep` counts). The shared field helpers are
  the root: `content/page.tsx` `Field` (:1731-1738) renders
  `<label class="…">{label}</label>` with the input as an unrelated child;
  `reports/page.tsx` drawer fields (`:711`, `:725`, `:751`, `:765`) and the inline
  labels in field/ecommerce/enrichment/cadences/retention/marketplace settings forms
  do the same. `SelectInput` (`content/page.tsx:1740`) has no label tie either.
- **Issue:** A `<label>` with no `htmlFor` (and no wrapping of the control) is not an
  accessible name. Screen readers announce the input as unlabeled "edit text";
  clicking the label text does not focus the field; the hit-target benefit is lost.
- **Why it matters:** Almost every create/edit drawer in the rebuild (templates,
  plans, saved reports, cadences, escalation notes, field visits, listings) is
  affected — the core data-entry surface is unlabeled for AT users.
- **Fix:** Give each control a stable `id` and point the label at it
  (`<label htmlFor={id}>`), or wrap the control inside the `<label>`. Easiest: fix
  the three shared helpers (`Field`, `SelectInput`, and the inline `<label>` blocks
  in `reports`) once and most pages inherit it. Use `useId()` for the ids.

### H2 — Icon-only buttons have no accessible name

- **Where:** 18 `<X>` close buttons across 12 pages (`grep`), plus calendar
  prev/next and row-action trash buttons. Confirmed unlabeled examples:
  `content/page.tsx` `DrawerShell` close (:1831-1836, `<X>` only),
  `reports/page.tsx` drawer close (:700-705), `escalations/page.tsx` drawer close
  (:1541-1544), the calendar `ChevronLeft`/`ChevronRight` nav
  (`content/page.tsx:1411-1431`). Some trash buttons set `title=` (e.g.
  `content/page.tsx:1373` `title="Hapus (ke Sampah)"`, `reports/page.tsx:1197`) which
  is a partial mitigation, but the close `X` and calendar arrows have neither
  `aria-label` nor `title`.
- **Issue:** A `<button>` whose only child is an SVG icon exposes no text to AT —
  it is announced as just "button". `title` is inconsistently present and is not a
  reliable accessible name (not surfaced by all SRs, not shown to keyboard users).
- **Fix:** Add `aria-label` (Indonesian, matching the visible copy: "Tutup",
  "Bulan sebelumnya", "Bulan berikutnya", "Hapus") to every icon-only control. Bake
  it into the shared `DrawerShell`/modal close button so it is fixed once.

### H3 — Inbox 2-pane workspace is not responsive below the column widths (mobile breaks)

- **Where:** `app/(app)/inbox/page.tsx:526-529`. Root is
  `flex h-[calc(100vh-3.5rem)] overflow-hidden`; column 1 (the conversation list) is
  `w-[336px] shrink-0` with no responsive collapse; the right context rail correctly
  hides below `xl` (`:855` `hidden … xl:block`), but the **list + thread two-pane has
  no single-pane mobile mode**.
- **Issue:** On a 360–390px phone, a fixed 336px list `shrink-0` sits beside the
  thread column inside an `overflow-hidden` flex row — the thread is squeezed to
  ~24–54px and message composing is unusable. There is no `md:hidden` / back-button
  pattern to switch between list and thread on small screens.
- **Why it matters:** Inbox is in the **"Utama"** nav group (the daily-driver) and the
  product targets field sales on phones (per the field/WA modules). A core daily
  screen is broken on the primary device class.
- **Fix:** Below `md`/`lg`, render a single pane: show the list, and when a thread is
  selected push the thread full-width with a back affordance (or stack the columns).
  Make column 1 `w-full md:w-[336px]` and conditionally hide it once a conversation
  is open on mobile.

### H4 — No skip-to-content link and no main landmark target; focus management on route change is absent

- **Where:** `app/(app)/layout.tsx:67` renders `<main className="min-w-0 flex-1">`
  but there is **no skip link** anywhere (`grep` for `skip`/`sr-only` across all
  rebuild pages = 0 hits) and `<main>` has no `id`/`tabIndex` to target.
- **Issue:** Keyboard users must Tab through the entire `SideNav` (3 groups, ~17
  links, the AI dock) and `TopBar` (toggle, search, AI, lang, notifications, profile)
  on **every** page before reaching content, with no escape hatch. There is also no
  focus reset on client-side navigation.
- **Fix:** Add a visually-hidden-until-focused "Lewati ke konten" link as the first
  focusable element in the layout, targeting `<main id="main" tabIndex={-1}>`. Move
  focus to `#main` on pathname change.

### H5 — `muted-foreground` at reduced opacity drops below text-contrast minimums

- **Where:** `--muted-foreground: 20 6% 45%` is `4.81 : 1` on white (passes normal
  text, but only barely, and **fails on the warm `--background` #FFF8F5** and on
  `--muted`). It is then used at **`/60`** for nav section headers
  (`side-nav.tsx:217,224,357`) and `settings-nav.tsx:59`) and at `/60` for input
  placeholders (`reports/page.tsx:719,759`) — measured **2.32 : 1** — and the active
  funnel/caption greys go lighter still.
- **Issue:** Section labels ("UTAMA", "FITUR LAIN", "ATUR"), placeholders, and many
  `text-[10px]/[11px]` captions are decorative-grey and unreadable for low-vision
  users (well under the 4.5 : 1 normal-text bar; the tiny font sizes make it worse).
- **Fix:** Don't render meaningful text below ~4.5 : 1. Use solid `muted-foreground`
  (not `/60`) for nav section headers and placeholders, and consider darkening the
  base token a step (e.g. `20 6% 40%`) so it clears AA on the warm canvas too.

---

## MEDIUM

### M1 — Inconsistent focus-ring strategy (`focus:ring` vs `focus-visible:ring`); custom buttons use mouse-visible rings

- **Where:** the topbar profile trigger uses `focus-visible:ring-2`
  (`side-nav.tsx:482`) and the login submit uses `focus-visible:ring`
  (`app/login/page.tsx:325`), but the hundreds of hand-rolled page buttons use
  `focus:outline-none focus:ring-2` (e.g. `content/page.tsx` inputs/selects,
  `reports/page.tsx` modal buttons). `grep` for `focus-visible:` across `app/(app)`
  = 0 hits.
- **Issue:** `focus:ring` fires on **mouse** click too (visible ring after clicking),
  which the team's own login/topbar code deliberately avoids with `focus-visible`.
  The inconsistency is cosmetic but means the keyboard-focus signal is identical to
  the mouse-click signal across most of the app.
- **Fix:** Standardize on `focus-visible:ring-2 focus-visible:ring-ring` for
  interactive elements (and ensure the destructive purge input keeps a visible focus
  ring). Note: the coral `--ring` (`12 96% 67%`) itself is light — pair it with an
  offset so the ring is perceivable on the warm background.

### M2 — Modal/drawer Esc handling and backdrop-close are inconsistent across pages

- **Where:** `content/page.tsx:365-375` and `reports/page.tsx:260-267` add a
  `keydown`/Escape listener only while the **drawer** is open, but the
  `ConfirmModal`/`PurgeModal` (which can be open without the drawer) rely solely on
  backdrop click — Escape does not close them. Other pages (escalations/marketplace)
  wire Esc differently or not at all.
- **Issue:** Inconsistent dismissal: some overlays close on Esc, some only on
  backdrop click, some only via the Cancel button. A keyboard user can be left in a
  purge modal with no Esc exit.
- **Fix:** Centralize Esc-to-close in the shared dialog primitive (another reason to
  adopt Radix per C2) so every overlay behaves identically.

### M3 — Native `<select>` arrow overlaps custom chevron; selects are styled but the OS dropdown still renders

- **Where:** `content/page.tsx` `SelectInput` (:1751-1762) and the channel filter
  (:669-682) set `appearance-none` + an absolutely-positioned `<ChevronRight rotate-90>`.
  Same in escalations/field/ecommerce.
- **Issue:** Functionally fine and accessible (native select keeps keyboard support),
  but the decorative chevron uses `ChevronRight` rotated 90° rather than a
  `ChevronDown`, and on some browsers the native arrow can still bleed through if
  `appearance-none` isn't fully applied — minor visual inconsistency vs the rest of
  the design system that uses `ChevronDown` (`side-nav.tsx:219`).
- **Fix:** Use `ChevronDown` for the select affordance for visual consistency; verify
  `appearance-none` across target browsers.

### M4 — Stat/Confirm/Purge/Drawer/TabButton components are copy-pasted per page, guaranteeing drift

- **Where:** `StatCard`, `TabButton`, `CountPill`, `ConfirmModal`, `PurgeModal`,
  `DrawerBackdrop`/`DrawerShell` are defined **independently inside**
  `content/page.tsx`, `reports/page.tsx`, `escalations/page.tsx`, `enrichment`,
  `field`, `retention`, `marketplace` (near-identical bodies). `EmptyState`/`ErrorState`
  were correctly extracted to `components/shared/` — these were not.
- **Issue:** The duplication is *why* a11y fixes (C2/H1/H2/M2) have to be applied N
  times and why scroll-lock/Esc already diverged. It also risks visual drift
  (e.g. one page's PurgeModal accepts `HAPUS`, another might use a different token).
- **Fix:** Extract a shared `Drawer`, `ConfirmDialog`, `PurgeDialog`, `StatCard`,
  `Tabs`, `CountPill` into `components/shared/` (or use Radix). Fix a11y once, inherit
  everywhere.

### M5 — Chart bars and color-coded badges encode meaning by color only

- **Where:** `reports/page.tsx` `BarList` (:1110-1144) and the segment/lifecycle/
  band/visit/channel badges encode status purely via a color dot + colored bar; the
  dashboard funnel (`dashboard/page.tsx:84-90`) is a coral→teal ramp.
- **Issue:** Status that is conveyed only by hue (won=green / lost=red /
  open=coral on the deals-by-stage bars at `:424`) is invisible to color-blind users.
  The bars do show the numeric value + share %, which mitigates the *data* loss, but
  won/lost/open carry no text or shape differentiator.
- **Fix:** Add a text/shape/pattern cue alongside color for win/lost/status (e.g. a
  "Menang/Kalah" label or icon on the deals bars), not hue alone.

---

## LOW

### L1 — Animated login/pending backdrops respect reduced-motion, but the dashboard funnel/skeleton shimmer and bar `transition-[width] duration-700` do not gate on `prefers-reduced-motion`

- **Where:** `reports/page.tsx:1135` (`transition-[width] duration-700` on bars),
  skeleton `animate-pulse` everywhere, `pending/page.tsx:131` `animate-ping`.
- **Fix:** Wrap long/looping animations in a `motion-reduce:` variant or
  `useReducedMotion()` (the login page already models this).

### L2 — `register` "Pilih usage / vertical" `<label>` has no control association

- **Where:** `app/register/page.tsx:291`. The label sits above a `role="group"`
  button grid. The group already has `aria-label="Usage / vertical"` (:292), so the
  bare label is redundant rather than broken — but it reads as an orphan label to a
  strict checker.
- **Fix:** Either drop the visual label's semantic weight (`aria-hidden` on it, keep
  the group's `aria-label`) or wire `aria-labelledby` from the group to the label id.

### L3 — Notifications and KPIs are illustrative constants in the shell, not wired

- **Where:** `side-nav.tsx:133-137` `NOTIFS` is a hardcoded 3-item array rendered in
  the topbar bell dropdown with a permanent red unread dot (`:461`).
- **Issue:** Primarily a "no mock data" concern (out of this dimension's core), but
  it's also a UX-honesty issue: the bell always shows an unread badge that never
  clears. Flagged here as the a11y/UX-visible symptom.
- **Fix:** Wire to a real source or remove the always-on unread indicator.

### L4 — `PageHeader` H1 is fixed at 28px and can wrap awkwardly on small screens; long titles + actions share one row only from `sm:`

- **Where:** `components/layout/page-header.tsx:23,31` — `text-[28px]` is not
  responsive (no `sm:`/`md:` step-down) and the header switches to a row at `sm`.
- **Issue:** On a 320–360px screen a long title ("Laporan & Analitik" + a primary
  button) can crowd; the 28px display size doesn't reduce.
- **Fix:** Make the H1 responsive (`text-2xl sm:text-[28px]`) and allow the action to
  wrap below the title on the smallest breakpoint.

---

## Top 3 (by blast radius)

1. **C1 — Coral Sunset primary/teal/success/amber buttons fail WCAG contrast**
   (2.1–2.6 : 1 with white text). Brand default CTA + active nav, every screen.
2. **C2 — Hand-rolled drawers/modals have no dialog role, no focus trap, no
   autofocus, inconsistent scroll-lock.** Breaks keyboard/SR use of every CRUD flow
   and every destructive confirm.
3. **H1 — Form labels not associated with inputs** (66 `<label>` / 17 `htmlFor`).
   The core data-entry surface of every create/edit drawer is unlabeled for AT.

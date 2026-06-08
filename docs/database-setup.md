# Database setup (Postgres + Drizzle)

Zenith persists demo data in a real Postgres database (Neon, provisioned via the
Vercel Marketplace). Schema is managed with [Drizzle ORM](https://orm.drizzle.team)
and lives in `lib/db/schema.ts`. The runtime client lives in `lib/db/client.ts`.

## One-time setup

1. **Provision Neon Postgres on Vercel.**
   - Open your project on [vercel.com](https://vercel.com).
   - **Storage → Browse Marketplace → Neon Postgres → Add Integration**.
   - Connect it to the `zenith` project. Vercel will provision the database and
     inject the `POSTGRES_*` environment variables automatically.

2. **Pull credentials locally.**
   ```bash
   vercel link            # if you haven't linked the project yet
   vercel env pull .env.local
   ```
   This populates `.env.local` with `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`,
   `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`.
   The full list is mirrored in `.env.local.example`.

3. **Sync the schema.**

   Pick **one** of:

   - **Fast (recommended for the demo):**
     ```bash
     npm run db:push
     ```
     `drizzle-kit push` diffs `lib/db/schema.ts` against the live database and
     applies changes directly — no migration files written. Best for the demo
     where the schema iterates fast.

   - **Proper migrations:**
     ```bash
     npm run db:generate    # writes SQL into drizzle/migrations/
     npm run db:migrate     # applies pending migrations
     ```
     Commit anything generated in `drizzle/migrations/` so other agents can run
     `db:migrate` and get the same schema.

4. **Seed the database.**
   ```bash
   npm run db:seed
   ```
   Loads the existing mock JSON from `lib/mock-data/*.json` and the default
   knowledge base from `lib/api-mock/kb.ts` into Postgres. The script is
   **idempotent** — every insert uses `ON CONFLICT (id) DO UPDATE`, so re-running
   it refreshes the rows in place rather than erroring.

5. **You're done.** Start the dev server (`npm run dev`); API routes that
   import `db` from `@/lib/db/client` will read & write live Postgres.

## Useful commands

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `npm run db:push`    | Sync `schema.ts` → live database (no migration files).           |
| `npm run db:generate`| Generate a SQL migration from schema changes.                    |
| `npm run db:migrate` | Apply pending migrations against the live database.              |
| `npm run db:seed`    | Re-seed demo data (idempotent — safe to re-run).                 |
| `npm run db:studio`  | Launch Drizzle Studio — an interactive table viewer in browser.  |

## Tables

Defined in `lib/db/schema.ts`:

- `kb` — single row per client, holds the full `KnowledgeBase` JSON blob.
- `deals` — pipeline cards.
- `contacts` — CRM contacts (with `tags` as a JSON array).
- `conversations` — conversation threads (one per contact + channel).
- `messages` — individual messages, foreign-keyed to `conversations.id`.
- `autopilot_runs` — historical Autopilot runs (config snapshot + event timeline + metrics).

IDs are stored as `text` so they remain compatible with the existing
`ct_0001` / `dl_0003` / etc. string IDs from the mock JSON.

## Where the code lives

| File                                | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| `drizzle.config.ts`                 | Drizzle Kit config (schema path, dialect).    |
| `lib/db/schema.ts`                  | Table definitions — the canonical contract.   |
| `lib/db/client.ts`                  | `db` singleton + `hasDb()` helper.            |
| `scripts/db-seed.ts`                | Idempotent seed script.                       |
| `drizzle/migrations/`               | Generated SQL migrations.                     |

## Runtime behavior without a database

`lib/db/client.ts` exports `hasDb()` which other agents can use to gracefully
fall back to in-memory mock data when `POSTGRES_URL` isn't set (e.g. during a
local dry run before linking Vercel). This means `npm run dev` still works
without Postgres — feature stores just won't persist.

import { Inngest } from "inngest";

// Inngest client (doc 31). Works without keys in local dev (the Inngest dev
// server discovers the app at /api/inngest); production needs INNGEST_EVENT_KEY
// + INNGEST_SIGNING_KEY. The constructor never throws when keys are absent — the
// functions simply won't be triggered until an Inngest app is connected. The
// same work stays runnable on-demand via /api/cadences/process & /api/tenant/sends.

// Dev mode locally (the serve endpoint works keyless), cloud mode in production
// where INNGEST_SIGNING_KEY is set — so /api/inngest doesn't 500 in dev. An
// explicit INNGEST_DEV env var wins either way.
const isDev =
  process.env.INNGEST_DEV !== undefined
    ? process.env.INNGEST_DEV === "1" || process.env.INNGEST_DEV === "true"
    : process.env.NODE_ENV !== "production";

export const inngest = new Inngest({ id: "maira-sales", isDev });

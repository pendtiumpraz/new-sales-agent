import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";

// Inngest serve endpoint (doc 31). GET = introspection (used by the Inngest dev
// server / dashboard to discover functions); PUT = register; POST = invoke. This
// route is public-reachable (under /api, so middleware doesn't gate it) and
// Inngest authenticates via the signing key in production.
export const { GET, POST, PUT } = serve({ client: inngest, functions });

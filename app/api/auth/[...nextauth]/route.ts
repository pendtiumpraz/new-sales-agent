import { handlers } from "@/lib/auth/auth";

// Auth.js v5 catch-all (doc 28). Serves /api/auth/session, /api/auth/callback/*,
// /api/auth/csrf, etc. The static /api/auth/login route still takes precedence
// (used by the legacy login flow until the UI swap in slice 2b).
export const { GET, POST } = handlers;

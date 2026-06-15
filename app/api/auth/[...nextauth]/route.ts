import { handlers } from "@/lib/auth/auth";

// Auth.js v5 catch-all (doc 28). Serves /api/auth/session, /api/auth/callback/*,
// /api/auth/csrf, signin/signout, etc.
export const { GET, POST } = handlers;

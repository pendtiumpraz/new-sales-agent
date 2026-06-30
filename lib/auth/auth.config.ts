import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/lib/rbac/permissions";

/**
 * Edge-safe base Auth.js config, shared by the edge middleware AND the full
 * server auth (`lib/auth/auth.ts`). It MUST NOT import anything that pulls a
 * Node-only API (scrypt/`crypto`, Postgres, the auth/tenant services) — the
 * middleware runs on the **edge runtime**, where those don't exist. The heavy
 * Credentials provider (whose `authorize` uses scrypt + Postgres) is added ONLY
 * in `auth.ts`, which is imported exclusively from the Node runtime.
 *
 * The jwt/session callbacks only copy token fields (no Node APIs), so they are
 * safe to run in middleware and keep the JWT shape identical in both contexts.
 */
/**
 * Trust the inbound Host/X-Forwarded-Host header for callback-URL resolution only
 * where it's actually safe (audit #44). Blanket `trustHost:true` lets a spoofed
 * Host header drive the OAuth/callback origin behind a proxy. We trust the host
 * when EITHER:
 *   - an explicit canonical URL is pinned (`AUTH_URL`/`NEXTAUTH_URL`) — Auth.js
 *     uses that origin, so the header can't override it; or
 *   - we're on Vercel (`VERCEL`/`VERCEL_URL` set) — the platform terminates TLS
 *     and sets a trustworthy `x-forwarded-host`; or
 *   - we're not in production (local dev: `localhost`, preview tooling).
 * In a bare production deploy with no pinned URL and not on Vercel, we do NOT
 * blindly trust the host.
 */
const TRUST_HOST =
  Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL) ||
  Boolean(process.env.VERCEL || process.env.VERCEL_URL) ||
  process.env.NODE_ENV !== "production";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: TRUST_HOST,
  providers: [], // real providers are injected in lib/auth/auth.ts (Node runtime)
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.isSuperadmin = user.isSuperadmin;
        token.tenantStatus = user.tenantStatus;
        token.avatarColor = user.avatarColor;
        token.demoRole = user.demoRole;
        token.scope = user.scope;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.tenantId = token.tenantId as string;
        session.user.isSuperadmin = token.isSuperadmin as boolean | undefined;
        session.user.tenantStatus = token.tenantStatus as string | undefined;
        session.user.avatarColor = token.avatarColor as string | undefined;
        session.user.demoRole = token.demoRole as string | undefined;
        session.user.scope = token.scope as string | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;

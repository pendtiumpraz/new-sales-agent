import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { findAccount } from "./demo-accounts";
import { mapDemoRole, type Role } from "@/lib/rbac/permissions";
import { db, hasDb } from "@/lib/db/client";
import { membershipsTable, usersTable } from "@/lib/db/schema";

// Auth.js v5 (doc 28). Credentials-first (slice 2a): authorize against the
// existing demo accounts so login works offline with no external OAuth creds.
// JWT strategy is required for the Credentials provider.
//
// Slice 2b will: (1) authorize against usersTable, (2) resolve the real tenant +
// role from memberships instead of the default below, (3) add Google/MS OAuth.
const DEFAULT_TENANT_ID = "t_default";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");

        // 1) Demo accounts — offline, always on t_default.
        const account = findAccount(email, password);
        if (account) {
          return {
            id: account.id,
            name: account.name,
            email: account.email,
            role: mapDemoRole(account.role),
            tenantId: DEFAULT_TENANT_ID,
            avatarColor: account.avatarColor,
            demoRole: account.role,
            scope: account.scope,
          };
        }

        // 2) Registered users (doc 38). Resolve tenant + role from membership.
        // Authorization succeeds even if the tenant is pending/expired — the app
        // shell gates that and shows /pending; this keeps the error legible.
        if (!hasDb()) return null;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
        if (!user || user.password !== password) return null;
        const [mem] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id)).limit(1);
        if (!mem) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mem.role as Role,
          tenantId: mem.tenantId,
          avatarColor: user.avatarColor,
          demoRole: user.role,
          scope: user.scope ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.avatarColor = user.avatarColor;
        token.demoRole = user.demoRole;
        token.scope = user.scope;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // token fields are typed `unknown` on the base JWT — cast back to the
        // shapes we wrote in the jwt callback above.
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.tenantId = token.tenantId as string;
        session.user.avatarColor = token.avatarColor as string | undefined;
        session.user.demoRole = token.demoRole as string | undefined;
        session.user.scope = token.scope as string | undefined;
      }
      return session;
    },
  },
});

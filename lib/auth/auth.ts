import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { findAccount } from "./demo-accounts";
import { mapDemoRole } from "@/lib/rbac/permissions";

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
      authorize: (creds) => {
        const account = findAccount(String(creds?.email ?? ""), String(creds?.password ?? ""));
        if (!account) return null;
        return {
          id: account.id,
          name: account.name,
          email: account.email,
          role: mapDemoRole(account.role),
          tenantId: DEFAULT_TENANT_ID,
          // Display fields the existing UI/store still reads.
          avatarColor: account.avatarColor,
          demoRole: account.role,
          scope: account.scope,
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
        session.user.id = token.sub as string;
        session.user.role = token.role;
        session.user.tenantId = token.tenantId;
        session.user.avatarColor = token.avatarColor;
        session.user.demoRole = token.demoRole;
        session.user.scope = token.scope;
      }
      return session;
    },
  },
});

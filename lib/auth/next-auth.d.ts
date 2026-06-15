import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/rbac/permissions";

// Augment Auth.js types with our tenant/role fields (doc 19/28).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      tenantId: string;
      avatarColor?: string;
      demoRole?: string;
      scope?: string;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    tenantId: string;
    avatarColor?: string;
    demoRole?: string;
    scope?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    tenantId: string;
    avatarColor?: string;
    demoRole?: string;
    scope?: string;
  }
}

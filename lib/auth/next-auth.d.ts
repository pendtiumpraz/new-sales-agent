import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/rbac/permissions";

// Augment Auth.js types with our tenant/role fields (doc 19/28).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      tenantId: string;
      /** Platform-staff flag from `app_user.is_superadmin` (new auth domain). */
      isSuperadmin?: boolean;
      /** Tenant activation status (`pending|active|suspended|expired`) carried so
       *  the shell can gate without an extra round-trip. */
      tenantStatus?: string;
      avatarColor?: string;
      demoRole?: string;
      scope?: string;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    tenantId: string;
    isSuperadmin?: boolean;
    tenantStatus?: string;
    avatarColor?: string;
    demoRole?: string;
    scope?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    tenantId: string;
    isSuperadmin?: boolean;
    tenantStatus?: string;
    avatarColor?: string;
    demoRole?: string;
    scope?: string;
  }
}

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { useAuthStore } from "@/lib/stores/auth-store";
import type { DemoRole } from "@/lib/auth/demo-accounts";
import type { Role } from "@/lib/rbac/permissions";

/**
 * Map a canonical RBAC `Role` (carried by the NEW auth domain session) onto the
 * store's display `DemoRole`. Real users have no `demoRole`, so without this the
 * sidebar would mislabel every real account as "Sales Rep".
 */
function displayRole(role: Role | undefined, isSuperadmin?: boolean): DemoRole {
  if (isSuperadmin || role === "superadmin") return "Superadmin";
  switch (role) {
    case "tenant_owner":
      return "Admin";
    case "tenant_admin":
      return "Sales Manager";
    case "member":
    default:
      return "Sales Rep";
  }
}

// Bridges the Auth.js session into the existing Zustand auth-store, so every
// component that already reads useAuthStore().currentUser keeps working without
// a per-file refactor. The session (cookie-backed) is the source of truth; the
// store is just a display mirror.
export function AuthSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      useAuthStore.getState().setUser({
        id: session.user.id,
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        password: "",
        // Prefer the demo display role (offline accounts); otherwise derive a
        // display label from the canonical RBAC role / superadmin flag.
        role:
          (session.user.demoRole as DemoRole | undefined) ??
          displayRole(session.user.role, session.user.isSuperadmin),
        avatarColor: session.user.avatarColor ?? "#3B82F6",
        scope: session.user.scope ?? "",
      });
    } else if (status === "unauthenticated") {
      useAuthStore.getState().logout();
    }
  }, [status, session]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { useAuthStore } from "@/lib/stores/auth-store";
import type { DemoRole } from "@/lib/auth/demo-accounts";

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
        role: (session.user.demoRole as DemoRole) ?? "Sales Rep",
        avatarColor: session.user.avatarColor ?? "#3B82F6",
        scope: session.user.scope ?? "",
      });
    } else if (status === "unauthenticated") {
      useAuthStore.getState().logout();
    }
  }, [status, session]);

  return null;
}

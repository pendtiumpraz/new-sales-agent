"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";
import type { DemoRole } from "@/lib/auth/demo-accounts";

/**
 * Guard component — renders its children only when the current user's role is in
 * `allow`. Anyone else gets a one-time toast and a redirect to `/dashboard`.
 * Generalizes RequireSuperadmin for pages open to more than one role (e.g. the
 * compliance register, which the DPO roles — owner/admin — must reach, not just
 * the platform superadmin). While the role verifies it renders nothing to avoid
 * flashing protected content.
 */
export function RequireRole({
  allow,
  message = "Anda tidak memiliki akses ke halaman ini.",
  children,
}: {
  allow: DemoRole[];
  message?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const role = useAuthStore((s) => s.currentUser.role);
  const authenticated = useAuthStore((s) => s.authenticated);
  const [ready, setReady] = useState(false);

  const allowed = allow.includes(role as DemoRole);

  useEffect(() => {
    if (!authenticated) {
      // Auth gate in (app)/layout.tsx handles the unauthenticated case.
      return;
    }
    if (!allowed) {
      toast.error(message, { icon: <ShieldAlert className="h-4 w-4" /> });
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [authenticated, allowed, message, router]);

  if (!ready) return null;
  return <>{children}</>;
}

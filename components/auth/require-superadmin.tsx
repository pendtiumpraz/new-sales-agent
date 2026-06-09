"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * Guard component — only renders its children when the current user has the
 * Superadmin role. Anyone else gets a one-time toast and a redirect to
 * `/dashboard`. While the role is being verified the guard renders a brief
 * blank frame to prevent flashing protected content.
 *
 * Used on every admin-only settings sub-route (knowledge-base, diagnostics,
 * handoff, compliance) so direct-URL access from non-Superadmin sessions is
 * blocked, matching the visibility rules in `app/(app)/settings/page.tsx`.
 */
export function RequireSuperadmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.currentUser.role);
  const authenticated = useAuthStore((s) => s.authenticated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      // Auth gate in (app)/layout.tsx will handle the unauthenticated case;
      // we just wait for it.
      return;
    }
    if (role !== "Superadmin") {
      toast.error("Halaman ini hanya untuk Superadmin.", {
        icon: <ShieldAlert className="h-4 w-4" />,
      });
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [authenticated, role, router]);

  if (!ready) return null;
  return <>{children}</>;
}

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SideNav, TopBar } from "@/components/layout/side-nav";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const authenticated = useAuthStore((s) => s.authenticated);

  useEffect(() => {
    if (!authenticated) {
      // Carry the requested path so the login page can bounce them back after
      // they sign in. Encoded so query strings / hashes survive the round-trip.
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [authenticated, pathname, router]);

  // Brief blank frame before redirect — prevents flashing protected content.
  if (!authenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

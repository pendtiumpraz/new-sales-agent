"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useSession } from "next-auth/react";

import { SideNav, TopBar } from "@/components/layout/side-nav";
import { useKbStore } from "@/lib/stores/kb-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      // Carry the requested path so the login page can bounce them back after
      // they sign in. Encoded so query strings / hashes survive the round-trip.
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [status, pathname, router]);

  // Hydrate the Knowledge Base from Postgres once per session. The store
  // guards itself with a `hydrated` flag, so this is a safe no-op on repeat
  // mounts (e.g. route transitions that re-render the layout).
  useEffect(() => {
    void useKbStore.getState().hydrate();
  }, []);

  // Blank frame while the session resolves or before redirect — prevents
  // flashing protected content (middleware already gated server-side).
  if (status !== "authenticated") {
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

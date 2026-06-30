"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useSession } from "next-auth/react";

import { SideNav, TopBar } from "@/components/layout/side-nav";
import { WorkspaceGate } from "@/components/layout/workspace-gate";
import { UserThemeProvider } from "@/components/layout/user-theme-provider";
import { useKbStore } from "@/lib/stores/kb-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const mainRef = useRef<HTMLElement>(null);

  // a11y (audit #18): move focus to the content region on every route change so
  // keyboard / screen-reader users land on the new page's content instead of
  // staying parked on a now-stale control. Pairs with the skip link below.
  useEffect(() => {
    if (status !== "authenticated") return;
    mainRef.current?.focus();
  }, [pathname, status]);

  useEffect(() => {
    if (status === "unauthenticated") {
      // Carry the requested path so the login page can bounce them back after
      // they sign in. Encoded so query strings / hashes survive the round-trip.
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [status, pathname, router]);

  // Activation gate (doc 38): a pending / expired / suspended tenant can't use
  // the app — bounce to /pending. Fails open (errors → ignore) so a glitch never
  // locks a real tenant out.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/tenant/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && j.active === false) router.replace("/pending");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
    <UserThemeProvider>
      {/* Skip link (audit #18): first focusable element, visually hidden until
          focused. Lets keyboard users jump past the ~17 nav links + topbar
          straight to the page content. */}
      <a
        href="#main"
        className="sr-only z-[100] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Lewati ke konten
      </a>
      <div className="flex min-h-screen bg-background">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" tabIndex={-1} ref={mainRef} className="min-w-0 flex-1 outline-none">
            <WorkspaceGate>{children}</WorkspaceGate>
          </main>
        </div>
      </div>
    </UserThemeProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Map, Radar, Users, type LucideIcon } from "lucide-react";

import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { withWorkspace } from "@/lib/workspace/scope";
import { cn } from "@/lib/utils";

// Route-level tab bar for the "Kontak & Lead" cluster (redesign IA §3): folds
// Kontak / Profil / Discovery / Peta into one tabbed surface instead of 4
// separate sidebar destinations. Each tab is a real route; the active one is
// derived from the pathname. Carries the active workspace param along.
const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/contacts", label: "Kontak", icon: Users, exact: true },
  { href: "/contacts/profiles", label: "Profil", icon: Building2 },
  { href: "/contacts/discovery", label: "Discovery", icon: Radar },
  { href: "/contacts/map", label: "Peta", icon: Map },
];

export function ContactsTabs() {
  const pathname = usePathname();
  const activeWs = useWorkspaceStore((s) => s.active);

  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b bg-card px-4">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={withWorkspace(t.href, activeWs?.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

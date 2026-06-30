"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Map, Radar, Users, type LucideIcon } from "lucide-react";

import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { withWorkspace } from "@/lib/workspace/scope";
import { cn } from "@/lib/utils";

// ONE tab row for the whole "Kontak & Lead" cluster. This replaces the two
// competing sub-navs that used to STACK on /contacts/* — the numbered step pills
// ("1.Cari → 2.Hasil → 3.Sebaran → 4.Kelola") AND a second in-page `ContactsTabs`
// bar (Kontak/Profil/Discovery/Peta) — which made discovery/profiles/map show a
// confusing double nav (docs/rebuild/05-product-flow §). Plain tabs, NO step
// numbers (the flow isn't strictly sequential), the main list (Kontak) first.
// Each tab is a real route; the active one is derived from the pathname; the
// active workspace param is carried along (doc 44 workspace-first nav).
const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/contacts", label: "Kontak", icon: Users, exact: true },
  { href: "/contacts/discovery", label: "Discovery", icon: Radar },
  { href: "/contacts/profiles", label: "Profil", icon: Building2 },
  { href: "/contacts/map", label: "Peta", icon: Map },
];

export function ContactsSubnav() {
  const pathname = usePathname();
  const activeWs = useWorkspaceStore((s) => s.active);

  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-border bg-card px-4">
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, PlusCircle, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "/m", icon: Home, label: "Beranda" },
  { href: "/m/contacts", icon: Users, label: "Kontak" },
  { href: "/m/visits/new", icon: PlusCircle, label: "Kunjungan" },
  { href: "/m/check-in", icon: MapPin, label: "Check-in" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center justify-around border-t bg-card px-2 pb-5 pt-2">
      {TABS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

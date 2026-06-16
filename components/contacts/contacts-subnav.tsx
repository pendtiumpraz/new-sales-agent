"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contact, MapPin, Radar, Users } from "lucide-react";

import { cn } from "@/lib/utils";

// One coherent flow for the whole Kontak cluster so users aren't lost between
// the 4 sub-pages (doc 40): Cari → Hasil → Sebaran → Kelola.
const STEPS = [
  { href: "/contacts/discovery", icon: Radar, label: "1. Cari", hint: "Discovery / crawl" },
  { href: "/contacts/profiles", icon: Users, label: "2. Hasil", hint: "Profil orang & PT" },
  { href: "/contacts/map", icon: MapPin, label: "3. Sebaran", hint: "Peta provinsi" },
  { href: "/contacts", icon: Contact, label: "4. Kelola", hint: "Daftar kontak & outreach" },
];

export function ContactsSubnav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-card px-4 py-2">
      {STEPS.map((s) => {
        // exact match for /contacts so it doesn't light up on every sub-route
        const active = s.href === "/contacts" ? pathname === "/contacts" : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            title={s.hint}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
            <span className="hidden text-[10px] font-normal opacity-70 sm:inline">· {s.hint}</span>
          </Link>
        );
      })}
    </div>
  );
}

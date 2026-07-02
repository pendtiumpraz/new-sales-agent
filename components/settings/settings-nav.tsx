"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Bot,
  CreditCard,
  KeyRound,
  Mail,
  MessagesSquare,
  Puzzle,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useAuthStore } from "@/lib/stores/auth-store";
import type { DemoRole } from "@/lib/auth/demo-accounts";
import { cn } from "@/lib/utils";

// Unified Settings sub-nav (redesign IA §3): the 11 separate settings
// destinations become ONE surface with a left rail (desktop) / horizontal bar
// (mobile). Routes stay the same; the active section is derived from pathname.
// Sections with `roles` are gated to match the page-level guards.
interface Section {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  roles?: DemoRole[];
}

const SECTIONS: Section[] = [
  { href: "/settings", label: "Akun & Profil", icon: User, exact: true },
  { href: "/settings/team", label: "Tim & Akses", icon: Users },
  { href: "/settings/mailboxes", label: "Mailbox", icon: Mail },
  { href: "/settings/ai", label: "AI & Model", icon: Bot },
  { href: "/settings/billing", label: "Billing & Kuota", icon: CreditCard },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound, roles: ["Superadmin", "Admin", "Sales Manager"] },
  { href: "/settings/compliance", label: "Kepatuhan (PDP)", icon: ShieldCheck, roles: ["Superadmin", "Admin", "Sales Manager"] },
  { href: "/settings/extension", label: "Extension", icon: Puzzle },
  { href: "/settings/knowledge-base", label: "Knowledge Base", icon: BookOpen, roles: ["Superadmin"] },
  { href: "/settings/handoff", label: "Handoff AI", icon: MessagesSquare, roles: ["Superadmin"] },
  { href: "/settings/diagnostics", label: "Diagnostics", icon: Activity, roles: ["Superadmin"] },
];

export function SettingsNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.currentUser.role);
  const visible = SECTIONS.filter((s) => !s.roles || s.roles.includes(role as DemoRole));
  const isActive = (s: Section) => (s.exact ? pathname === s.href : pathname.startsWith(s.href));

  // ONE horizontal tab bar (desktop + mobile) — NOT a second left sidebar. Settings
  // reads as top-tabs under the main shell, so there is no "double sidebar".
  return (
    <div className="scrollbar-thin sticky top-14 z-10 flex gap-1 overflow-x-auto border-b bg-card px-3">
      {visible.map((s) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(s)
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bot,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Settings,
  ShoppingBag,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

const NAV: { href: string; icon: LucideIcon; key: string }[] = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/inbox", icon: Inbox, key: "inbox" },
  { href: "/contacts", icon: Users, key: "contacts" },
  { href: "/pipeline", icon: KanbanSquare, key: "pipeline" },
  { href: "/cadences", icon: Workflow, key: "cadences" },
  { href: "/content", icon: Megaphone, key: "content" },
  { href: "/field", icon: MapPin, key: "field" },
  { href: "/ecommerce", icon: ShoppingBag, key: "ecommerce" },
  { href: "/ai-assistant", icon: Bot, key: "aiAssistant" },
  { href: "/settings", icon: Settings, key: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <aside
      className={cn(
        "glass sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r transition-[width] duration-200 md:block",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <nav className="flex flex-col gap-1 p-3">
        {NAV.map(({ href, icon: Icon, key }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          const link = (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  active && "text-primary",
                )}
              />
              {!collapsed && <span className="truncate">{t(key)}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{t(key)}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
    </aside>
  );
}

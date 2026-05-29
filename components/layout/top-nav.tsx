"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  User,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AiChat } from "@/components/ai/ai-chat";
import { ChannelDot } from "@/components/shared/channel-dot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
];

const NOTIFS = [
  { ch: "whatsapp", text: "Budi Santoso membalas pesan WhatsApp Anda", time: "2 mnt" },
  { ch: "tokopedia", text: "Order baru masuk dari Tokopedia", time: "18 mnt" },
  { ch: "email", text: "PT Astra membuka penawaran Anda", time: "1 jam" },
];

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const tn = useTranslations("nav");

  return (
    <header className="glass sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-3 sm:px-4">
      <Link href="/dashboard" className="shrink-0">
        <BrandLogo size="sm" />
      </Link>

      {/* Pill navigation (icon-only when tight, icon + label on wide screens) */}
      <nav className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
        {NAV.map(({ href, icon: Icon, key }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors lg:px-3",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{tn(key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              onClick={() => router.push("/contacts")}
            >
              <Search className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cari (⌘K)</TooltipContent>
        </Tooltip>

        <LanguageToggle className="mr-0.5 hidden md:inline-flex" />

        {/* AI assistant slide-over */}
        <Sheet>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="hidden lg:inline">Asisten</span>
                </Button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent>Asisten sales</TooltipContent>
          </Tooltip>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Asisten Sales
              </SheetTitle>
            </SheetHeader>
            <AiChat className="flex-1" />
          </SheetContent>
        </Sheet>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-card" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifikasi</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NOTIFS.map((n, i) => (
              <DropdownMenuItem key={i} className="items-start gap-2.5 py-2.5">
                <ChannelDot channel={n.ch} size={8} className="mt-1.5" />
                <div className="flex-1">
                  <p className="text-sm leading-snug">{n.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.time} lalu</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
              <UserAvatar name="Andi Hidayat" color="#14B8A6" className="h-8 w-8" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Andi Hidayat</span>
                <span className="text-xs font-normal text-muted-foreground">
                  andi@agentic.co.id
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <User className="h-4 w-4" />
              Profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="h-4 w-4" />
              Pengaturan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/compliance")}>
              <Sparkles className="h-4 w-4" />
              Kepatuhan UU PDP
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/")}>
              <LogOut className="h-4 w-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

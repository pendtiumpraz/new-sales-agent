"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, LogOut, PanelLeft, Search, Settings, Sparkles, User } from "lucide-react";

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
import { useUiStore } from "@/lib/stores/ui-store";

const NOTIFS = [
  { ch: "whatsapp", text: "Budi Santoso membalas pesan WhatsApp Anda", time: "2 mnt" },
  { ch: "tokopedia", text: "Order baru masuk dari Tokopedia", time: "18 mnt" },
  { ch: "email", text: "PT Astra membuka penawaran Anda", time: "1 jam" },
];

export function TopNav() {
  const router = useRouter();
  const t = useTranslations("common");
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={toggleSidebar}
      >
        <PanelLeft className="h-5 w-5" />
      </Button>
      <Link href="/dashboard" className="mr-1">
        <BrandLogo size="sm" />
      </Link>

      {/* Search (mock) */}
      <button
        className="ml-2 hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:flex"
        onClick={() => router.push("/contacts")}
      >
        <Search className="h-4 w-4" />
        <span>{t("search")}</span>
        <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <LanguageToggle className="mr-1 hidden sm:inline-flex" />

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
              <UserAvatar name="Andi Hidayat" color="#0D9488" className="h-8 w-8" />
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

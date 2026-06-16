"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Database,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  PanelLeft,
  Puzzle,
  Rocket,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  User,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { signOut } from "next-auth/react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

// Grouped navigation with plain-Indonesian labels — sections make the menu
// scannable and self-explanatory (no jargon like "Enrichment"). The collapsed
// sidebar hides the section headers.
interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string; // shown as a tooltip — explains the menu in one line
}
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Utama",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", desc: "Ringkasan harian: KPI, tugas, funnel" },
    ],
  },
  {
    label: "Cari & Riset Lead",
    items: [
      { href: "/contacts", icon: Users, label: "Kontak & Lead", desc: "Kontak, penemuan lead, & profil" },
      { href: "/pipeline", icon: Database, label: "Riset Prospek", desc: "Enrichment + positioning AI (fit produk)" },
    ],
  },
  {
    label: "Jangkau & Otomasi AI",
    items: [
      { href: "/cadences", icon: Workflow, label: "Cadence", desc: "Urutan pesan otomatis lintas channel" },
      { href: "/escalations", icon: Bot, label: "Eskalasi AI", desc: "Balasan AI yang perlu ditinjau manusia" },
      { href: "/content", icon: Megaphone, label: "Konten", desc: "Buat & rencanakan konten" },
    ],
  },
  {
    label: "Pelanggan & Penjualan",
    items: [
      { href: "/retention", icon: Heart, label: "Retensi", desc: "Jaga & pertahankan pelanggan" },
      { href: "/ecommerce", icon: ShoppingBag, label: "E-Commerce", desc: "Order marketplace + pemulihan keranjang" },
      { href: "/field", icon: MapPin, label: "Sales Lapangan", desc: "Peta tim & kunjungan lapangan" },
    ],
  },
  {
    label: "Analitik & Bantuan",
    items: [
      { href: "/reports", icon: BarChart3, label: "Laporan", desc: "Performa & analitik" },
      { href: "/documentation", icon: BookOpen, label: "Panduan", desc: "Cara pakai tiap fitur, langkah demi langkah" },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { href: "/settings/ai", icon: Bot, label: "AI & Model", desc: "Ganti provider & model AI aktif, BYOK, pemakaian token" },
      { href: "/settings/extension", icon: Puzzle, label: "Extension LinkedIn", desc: "Unduh, hubungkan, & status collector" },
      { href: "/settings", icon: Settings, label: "Pengaturan", desc: "Akun, tim, mailbox, billing, kepatuhan" },
    ],
  },
];
// Autopilot is intentionally NOT in NAV — it surfaces as a "special" coral
// button in both the top bar and the bottom of the sidebar (above the AI dock).

const NOTIFS = [
  { ch: "whatsapp", text: "Budi Santoso membalas pesan WhatsApp Anda", time: "2 mnt" },
  { ch: "tokopedia", text: "Order baru masuk dari Tokopedia", time: "18 mnt" },
  { ch: "email", text: "PT Astra membuka penawaran Anda", time: "1 jam" },
];

async function handleLogout(router: ReturnType<typeof useRouter>) {
  // Clears the Auth.js session cookie, resets volatile UI state and the store
  // mirror, then bounces to the marketing landing page.
  useUiStore.setState({
    sidebarCollapsed: false,
    aiPanelOpen: false,
    inboxPanelOpen: true,
  });
  await signOut({ redirect: false });
  useAuthStore.getState().logout();
  toast.success("Anda telah keluar dari sesi");
  router.push("/");
}

/* -------------------------------------------------------------------------- */
/* Sidebar — desktop only. Pure navigation; collapsible via TopBar toggle.    */
/* -------------------------------------------------------------------------- */
export function SideNav() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <aside
      className={cn(
        "chrome sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 items-center border-b",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <Link href="/dashboard" className="shrink-0">
          {collapsed ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              Z
            </span>
          ) : (
            <BrandLogo size="sm" />
          )}
        </Link>
      </div>

      {/* Primary nav — grouped + self-explanatory */}
      <nav className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && (collapsed ? "mt-1.5" : "mt-3"))}>
            {!collapsed && (
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && <div className="mx-2 mb-1.5 border-t border-border/60" />}
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ href, icon: Icon, label, desc }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                const item = (
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-colors",
                      collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/75 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );
                return (
                  <Tooltip key={href}>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent side="right">
                      <span className="font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{desc}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Special Autopilot button — coral primary, sits above the AI dock as
          the headline action. Replaces the sidebar nav entry. */}
      <div className={cn("border-t", collapsed ? "p-2" : "p-3 pb-1.5")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/autopilot"
                className="flex h-9 w-9 mx-auto items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105"
              >
                <Rocket className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Autopilot — pipeline AI satu klik</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href="/autopilot"
            className="group flex w-full items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-[#F6845C] px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md"
          >
            <Rocket className="h-4 w-4" />
            <span className="flex-1 text-left">Autopilot</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
              Baru
            </span>
          </Link>
        )}
      </div>

      {/* AI assistant dock — anchored at the bottom of the sidebar */}
      <div className={cn(collapsed ? "p-2" : "p-3 pt-1.5")}>
        <Sheet>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <SheetTrigger asChild>
                  <button className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-white shadow-[0_4px_12px_-4px_rgba(59,130,246,0.55)] transition-transform hover:scale-105">
                    <Sparkles className="h-4 w-4" />
                  </button>
                </SheetTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Asisten Sales</TooltipContent>
            </Tooltip>
          ) : (
            <SheetTrigger asChild>
              <button className="group flex w-full items-center gap-2 rounded-lg bg-gradient-to-r from-[#3B82F6] to-[#6366F1] px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(59,130,246,0.55)] transition-all hover:shadow-[0_6px_18px_-4px_rgba(59,130,246,0.7)] hover:brightness-110">
                <Sparkles className="h-4 w-4" />
                <span className="flex-1 text-left">Asisten Sales</span>
              </button>
            </SheetTrigger>
          )}
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
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* TopBar — sticky bar above main content. Holds:                              */
/*   left: sidebar toggle (desktop) + mobile hamburger + mobile brand          */
/*   right: search · language · AI · notifications · profile (with logout)     */
/* -------------------------------------------------------------------------- */
export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const currentUser = useAuthStore((s) => s.currentUser);

  return (
    <header className="chrome sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b px-3 sm:px-4">
      {/* Desktop sidebar toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={toggleSidebar}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Tutup / buka sidebar</TooltipContent>
      </Tooltip>

      {/* Mobile sheet sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>
              <BrandLogo size="sm" />
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-0.5 p-2">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mt-2 first:mt-0">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
                {group.items.map(({ href, icon: Icon, label }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/75 hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Mobile brand (desktop brand lives in the sidebar) */}
      <Link href="/dashboard" className="md:hidden">
        <BrandLogo size="sm" />
      </Link>

      <div className="flex-1" />

      {/* Special Autopilot button — coral gradient, always prominent. The
          headline "one-button pipeline" action lives here as well as in the
          sidebar bottom. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/autopilot"
            className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[#F6845C] px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md"
          >
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Autopilot</span>
            <span className="hidden rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide lg:inline">
              Baru
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">Autopilot — pipeline AI satu klik</TooltipContent>
      </Tooltip>

      {/* Search */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/contacts")}
          >
            <Search className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Cari (⌘K)</TooltipContent>
      </Tooltip>

      {/* AI assistant — visible on every viewport so it's never missing on
          mobile where the sidebar (and its bottom dock) is hidden. */}
      <Sheet>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#6366F1] px-3 text-sm font-semibold text-white shadow-[0_4px_12px_-4px_rgba(59,130,246,0.5)] transition-all hover:shadow-[0_6px_18px_-4px_rgba(59,130,246,0.7)] hover:brightness-110">
                <Sparkles className="h-4 w-4" />
                <span className="hidden lg:inline">Asisten</span>
              </button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Asisten Sales</TooltipContent>
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

      <LanguageToggle className="hidden sm:inline-flex" />

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

      {/* Profile — now lives in the top bar */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="ml-1 flex items-center gap-2 rounded-full pl-1 pr-2 outline-none ring-offset-background transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar
              name={currentUser.name}
              color={currentUser.avatarColor}
              className="h-8 w-8"
            />
            <div className="hidden flex-col text-left leading-tight md:flex">
              <span className="text-sm font-medium">{currentUser.name}</span>
              <span className="text-xs text-muted-foreground">
                {currentUser.role}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{currentUser.name}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {currentUser.email}
              </span>
              <span
                className={cn(
                  "mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  currentUser.role === "Superadmin"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {currentUser.role}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/contacts?view=inbox")}>
            <Sparkles className="h-4 w-4" />
            Inbox
          </DropdownMenuItem>
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
          {currentUser.role === "Superadmin" && (
            <DropdownMenuItem onClick={() => router.push("/admin")}>
              <Shield className="h-4 w-4" />
              Superadmin Console
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleLogout(router)}
            className="text-danger focus:bg-danger/10 focus:text-danger"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

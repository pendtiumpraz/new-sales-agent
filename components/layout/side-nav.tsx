"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  ChevronDown,
  Database,
  FileText,
  Heart,
  Lightbulb,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  PanelLeft,
  Rocket,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Sparkles,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { withWorkspace } from "@/lib/workspace/scope";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { CommandPalette } from "@/components/layout/command-palette";
import { cn } from "@/lib/utils";

// Grouped navigation with plain-Indonesian labels — sections make the menu
// scannable and self-explanatory (no jargon like "Enrichment"). The collapsed
// sidebar hides the section headers.
interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string; // shown as a tooltip — explains the menu in one line
  managerOnly?: boolean; // hidden from Sales Rep (member) — doc 41
  badge?: string; // small pill (e.g. "AI" on Autopilot)
}
// Simplified IA (closing-flow): the WORKSPACE is the primary flow — produk →
// market-fit → discovery → script → chat, all inline in one hub. "Utama" holds
// what a rep touches daily; "Fitur lain" collapses everything else (collapsed by
// default) so the sidebar isn't a wall of items. ⌘K still reaches everything.
const NAV_GROUPS: { label: string; items: NavItem[]; collapsible?: boolean }[] = [
  {
    label: "Utama",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", desc: "Ringkasan harian: KPI, tugas, funnel" },
      { href: "/workspaces", icon: Briefcase, label: "Workspace", desc: "Alur jualan lengkap: produk → market-fit → discovery → script → chat", badge: "Alur" },
      { href: "/inbox", icon: Inbox, label: "Inbox", desc: "Semua percakapan omni-channel (WA, email, IG)" },
      { href: "/reports", icon: BarChart3, label: "Laporan", desc: "Performa & analitik" },
    ],
  },
  {
    // Collapsed by default — power features one click away (⌘K reaches them too).
    // Ordered along the sales funnel so it reads as a flow when expanded.
    label: "Fitur lain",
    collapsible: true,
    items: [
      // cari prospek
      { href: "/pipeline", icon: Database, label: "Riset Prospek", desc: "Enrichment + positioning AI (fit produk)" },
      { href: "/marketplace", icon: Store, label: "Marketplace Data", desc: "Jual-beli data perusahaan antar-tenant", managerOnly: true },
      // jangkau & closing
      { href: "/cadences", icon: Workflow, label: "Cadence", desc: "Urutan pesan otomatis lintas channel" },
      { href: "/autopilot", icon: Rocket, label: "Autopilot", desc: "Pipeline AI penuh — satu klik", badge: "AI" },
      { href: "/content", icon: Megaphone, label: "Konten", desc: "Buat & rencanakan konten" },
      { href: "/penawaran", icon: FileText, label: "Penawaran", desc: "Susun, kirim & lacak penawaran" },
      { href: "/escalations", icon: Bot, label: "Eskalasi AI", desc: "Balasan AI yang perlu ditinjau manusia" },
      // pasca-jual
      { href: "/retention", icon: Heart, label: "Retensi", desc: "Jaga & pertahankan pelanggan" },
      { href: "/ecommerce", icon: ShoppingBag, label: "E-Commerce", desc: "Order marketplace + pemulihan keranjang" },
      // tim
      { href: "/team", icon: Activity, label: "Monitoring Sales", desc: "Pantau tim: sales aktif, closing & lead", managerOnly: true },
      { href: "/field", icon: MapPin, label: "Sales Lapangan", desc: "Peta tim & kunjungan lapangan" },
    ],
  },
  {
    label: "Atur",
    items: [
      { href: "/documentation", icon: BookOpen, label: "Panduan", desc: "Cara pakai tiap fitur" },
      { href: "/use-case", icon: Lightbulb, label: "Use Case", desc: "Skenario sales & marketing per industri" },
      { href: "/settings", icon: Settings, label: "Pengaturan", desc: "Akun, tim, mailbox, AI, billing, kepatuhan" },
    ],
  },
];

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
  const [showMore, setShowMore] = useState(false); // "Fitur lain" collapsed by default
  const activeWs = useWorkspaceStore((s) => s.active); // doc 44 — carry scope into nav links
  const isRep = useAuthStore((s) => s.currentUser.role) === "Sales Rep";
  // Modules the superadmin disabled for this tenant are hidden (doc 44).
  const entQ = useQuery({
    queryKey: ["tenant-entitlements"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/entitlements");
      if (!r.ok) return { disabled: [] as string[] };
      return (await r.json()) as { disabled: string[] };
    },
    staleTime: 60_000,
  });
  const disabled = new Set(entQ.data?.disabled ?? []);
  const visible = (items: NavItem[]) =>
    items.filter((it) => (!it.managerOnly || !isRep) && !disabled.has(it.href));

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

      {/* Active-workspace switcher (doc 44 — workspace-first) */}
      {!collapsed && (
        <div className="border-b px-3 py-2">
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Primary nav — grouped + self-explanatory */}
      <nav className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && (collapsed ? "mt-1.5" : "mt-3"))}>
            {!collapsed && group.collapsible ? (
              <button
                onClick={() => setShowMore((v) => !v)}
                className="flex w-full items-center gap-1 px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                <ChevronDown className={cn("h-3 w-3 transition-transform", showMore ? "" : "-rotate-90")} />
                <span className="flex-1 text-left">{group.label}</span>
                <span className="rounded-full bg-muted px-1.5 text-[9px] tabular-nums">{visible(group.items).length}</span>
              </button>
            ) : !collapsed ? (
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
            ) : null}
            {collapsed && gi > 0 && <div className="mx-2 mb-1.5 border-t border-border/60" />}
            {(!group.collapsible || collapsed || showMore) && (
              <div className="flex flex-col gap-0.5">
                {visible(group.items).map(({ href, icon: Icon, label, desc, badge }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                const item = (
                  <Link
                    href={withWorkspace(href, activeWs?.id)}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-colors",
                      collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/75 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{label}</span>}
                    {!collapsed && badge && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                          active ? "bg-white/20 text-primary-foreground" : "bg-primary/15 text-primary",
                        )}
                      >
                        {badge}
                      </span>
                    )}
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
            )}
          </div>
        ))}
      </nav>

      {/* AI assistant dock — anchored at the bottom of the sidebar. Autopilot
          lives under "Fitur lain" + the topbar CTA, not a floating button. */}
      <div className={cn("border-t", collapsed ? "p-2" : "p-3")}>
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
  const activeWs = useWorkspaceStore((s) => s.active);

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
                {group.items
                  .filter((it) => !it.managerOnly || currentUser.role !== "Sales Rep")
                  .map(({ href, icon: Icon, label }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={withWorkspace(href, activeWs?.id)}
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

      {/* Command palette opener (⌘K) — replaces the old search-that-routed-to-contacts */}
      <button
        onClick={() => window.dispatchEvent(new Event("maira:command"))}
        className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent sm:flex"
      >
        <Search className="h-4 w-4" />
        <span>Cari…</span>
        <kbd className="ml-1 rounded bg-muted px-1.5 text-[10px]">⌘K</kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={() => window.dispatchEvent(new Event("maira:command"))}
      >
        <Search className="h-5 w-5" />
      </Button>

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
          <DropdownMenuItem onClick={() => router.push("/inbox")}>
            <Inbox className="h-4 w-4" />
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
      {/* Global ⌘K command palette — mounted once via the topbar */}
      <CommandPalette />
    </header>
  );
}

"use client";

import { useState, type SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { BrandLogo } from "@/components/shared/brand-logo";
import { useUserBrand } from "@/components/layout/user-theme-provider";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AiChat } from "@/components/ai/ai-chat";
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
import { useRetentionStore } from "@/lib/stores/retention-store";
import { withWorkspace } from "@/lib/workspace/scope";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { CommandPalette } from "@/components/layout/command-palette";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* 1-solid-color SVG icons (Sainskerta Rule 6). Each menu owns ONE fixed       */
/* wayfinding color (passed via the parent's `style={{ color }}` → fill uses   */
/* currentColor). No gradients, no stroke — single solid glyph per menu.       */
/* -------------------------------------------------------------------------- */
type Glyph = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const base = (path: JSX.Element): Glyph =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
        {path}
      </svg>
    );
  };

const IconDashboard = base(
  <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />,
);
const IconWorkspace = base(
  <path d="M10 4H4a2 2 0 0 0-2 2v4h8V4Zm10 0h-6v6h8V6a2 2 0 0 0-2-2ZM2 14v4a2 2 0 0 0 2 2h6v-6H2Zm12 6h6a2 2 0 0 0 2-2v-4h-8v6Z" />,
);
const IconContacts = base(
  <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.34-8 4v3h7v-2.5c0-1.1.45-2.62 1.6-3.78A11.7 11.7 0 0 0 8 13Zm8 0c-3 0-9 1.5-9 4.5V21h18v-3.5c0-3-6-4.5-9-4.5Z" />,
);
const IconEnrichment = base(
  <path d="M11 2 8.6 7.4 3 9.8l5.6 2.4L11 18l2.4-5.8L19 9.8l-5.6-2.4L11 2Zm7 11-1.2 2.8L14 17l2.8 1.2L18 21l1.2-2.8L22 17l-2.8-1.2L18 13Z" />,
);
const IconInbox = base(
  <path d="M20 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 12h-4l-2 3h-4l-2-3H4V5h16v10Z" />,
);
const IconPipeline = base(
  <path d="M3 4h5v16H3V4Zm6.5 0h5v11h-5V4ZM16 4h5v7h-5V4Z" />,
);
const IconCadence = base(
  <path d="M7 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm10 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-4-7h6v2h-6V6ZM5 16h6v2H5v-2Z" />,
);
const IconAutopilot = base(
  <path d="m12 2 2.4 5L20 8.2l-4 3.9.9 5.6L12 15.1 7.1 17.7 8 12.1l-4-3.9 5.6-1.2L12 2Z" />,
);
const IconEscalations = base(
  <path d="M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z" />,
);
const IconContent = base(
  <path d="M3 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm10 0v4h4l-4-4ZM7 13h10v2H7v-2Zm0 4h7v2H7v-2Z" />,
);
const IconRetention = base(
  <path d="M12 21s-7.5-4.6-10-9.5C.6 8 2.4 4.5 6 4.5c2 0 3.4 1 4.5 2.4C11.6 5.5 13 4.5 15 4.5c3.6 0 5.4 3.5 4 7C19.5 16.4 12 21 12 21Z" />,
);
const IconEcommerce = base(
  <path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM1 3v2h2l3.6 7.6-1.4 2.5A2 2 0 0 0 7 18h12v-2H7.4l1-2H17a2 2 0 0 0 1.8-1.1L22 6H6.2L5.3 4H1Z" />,
);
const IconMarketplace = base(
  <path d="M4 4h16l1 5a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-3-2.4L4 4Zm0 8.9A4.5 4.5 0 0 0 6 13v7h5v-5h2v5h5v-7a4.5 4.5 0 0 0 2-.1V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7.1Z" />,
);
const IconField = base(
  <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />,
);
const IconReports = base(
  <path d="M3 3h2v18H3V3Zm4 10h3v8H7v-8Zm5-6h3v14h-3V7Zm5 3h3v11h-3V10Z" />,
);
const IconBranding = base(
  <path d="M12 2 3 7v6c0 5 3.8 8.4 9 9 5.2-.6 9-4 9-9V7l-9-5Zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 6c2.2 0 4 1.3 4 3v.5c-1 1-2.5 1.5-4 1.7-1.5-.2-3-.7-4-1.7V15c0-1.7 1.8-3 4-3Z" />,
);
const IconAi = base(
  <path d="M9 2h6v3h3a2 2 0 0 1 2 2v3h3v6h-3v3a2 2 0 0 1-2 2h-3v3H9v-3H6a2 2 0 0 1-2-2v-3H1V10h3V7a2 2 0 0 1 2-2h3V2Zm0 7v6h6V9H9Z" />,
);
const IconTeam = base(
  <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.34-8 4v3h7v-2.5c0-1.1.45-2.62 1.6-3.78A11.7 11.7 0 0 0 8 13Zm8 0c-3 0-9 1.5-9 4.5V21h18v-3.5c0-3-6-4.5-9-4.5Z" />,
);
const IconBilling = base(
  <path d="M3 5h18a1 1 0 0 1 1 1v3H2V6a1 1 0 0 1 1-1ZM2 11h20v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Zm3 4v2h6v-2H5Z" />,
);
const IconKb = base(
  <path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V4Zm4 2v2h8V6H8Zm0 4v2h8v-2H8Z" />,
);
const IconMasterData = base(
  <path d="M4 3h7v7H4V3Zm9 0h7v7h-7V3ZM4 14h7v7H4v-7Zm9 0h7v7h-7v-7Zm2 2v3h3v-3h-3ZM6 5v3h3V5H6Zm9 0v3h3V5h-3ZM6 16v3h3v-3H6Z" />,
);

/* -------------------------------------------------------------------------- */
/* NEW IA — grouped exactly like wireframes/index.html:                        */
/*   Utama · Leads · Eksekusi · Lainnya · Pengaturan                           */
/* Each item carries its fixed wayfinding `color` (Rule 6). `Lainnya` is        */
/* collapsible; everything stays reachable via ⌘K.                             */
/* -------------------------------------------------------------------------- */
interface NavItem {
  href: string;
  icon: Glyph;
  color: string;
  label: string;
  desc: string; // one-line tooltip
  managerOnly?: boolean;
  badge?: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [
      { href: "/dashboard", icon: IconDashboard, color: "#3B82F6", label: "Dashboard", desc: "Ringkasan harian: KPI, tugas, funnel" },
      { href: "/workspace", icon: IconWorkspace, color: "#10B981", label: "Workspace", desc: "Alur jualan per produk: market-fit → discovery → script → chat", badge: "Alur" },
    ],
  },
  {
    label: "Leads",
    items: [
      { href: "/contacts", icon: IconContacts, color: "#14B8A6", label: "Kontak", desc: "Kontak & lead tersegmentasi B2C/B2B + drawer detail" },
      { href: "/enrichment", icon: IconEnrichment, color: "#8B5CF6", label: "Enrichment", desc: "Discovery lead → enrich profil → klasifikasi B2C/B2B" },
    ],
  },
  {
    label: "Eksekusi",
    items: [
      { href: "/inbox", icon: IconInbox, color: "#6366F1", label: "Inbox", desc: "Semua percakapan omni-channel (WA, email, IG)" },
      { href: "/pipeline", icon: IconPipeline, color: "#F59E0B", label: "Pipeline", desc: "Board kanban deal per tahap + skor AI" },
      { href: "/penawaran", icon: IconContent, color: "#8B5CF6", label: "Penawaran", desc: "Quote/penawaran ke pelanggan" },
      { href: "/cadences", icon: IconCadence, color: "#7C3AED", label: "Cadence", desc: "Urutan pesan otomatis lintas channel" },
      { href: "/autopilot", icon: IconAutopilot, color: "#F43F5E", label: "Autopilot", desc: "Orkestrasi obrolan AI otomatis", badge: "AI" },
      { href: "/escalations", icon: IconEscalations, color: "#EF4444", label: "Eskalasi", desc: "Balasan AI yang perlu ditinjau manusia" },
    ],
  },
  {
    label: "Lainnya",
    collapsible: true,
    items: [
      { href: "/content", icon: IconContent, color: "#EAB308", label: "Konten", desc: "Buat & rencanakan konten" },
      { href: "/retention", icon: IconRetention, color: "#EC4899", label: "Retensi", desc: "Jaga & pertahankan pelanggan" },
      { href: "/ecommerce", icon: IconEcommerce, color: "#F97316", label: "E-Commerce", desc: "Order marketplace + pemulihan keranjang" },
      { href: "/marketplace", icon: IconMarketplace, color: "#3B82F6", label: "Marketplace", desc: "Jual-beli data perusahaan antar-tenant", managerOnly: true },
      { href: "/field", icon: IconField, color: "#22C55E", label: "Sales Lapangan", desc: "Peta tim & kunjungan lapangan" },
      { href: "/reports", icon: IconReports, color: "#0EA5E9", label: "Laporan", desc: "Performa & analitik", managerOnly: true },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { href: "/branding", icon: IconBranding, color: "#FD7A5C", label: "Branding", desc: "Tema, logo & favicon (per-user, default Coral Sunset)" },
      { href: "/master-data", icon: IconMasterData, color: "#0D9488", label: "Master Data", desc: "Katalog industri & pekerjaan yang dipakai AI mengklasifikasi crawl" },
      { href: "/settings/ai", icon: IconAi, color: "#8B5CF6", label: "AI", desc: "Provider AI + kunci BYOK" },
      { href: "/settings/team", icon: IconTeam, color: "#EF4444", label: "Tim", desc: "Anggota tim & peran", managerOnly: true },
      { href: "/settings/billing", icon: IconBilling, color: "#10B981", label: "Billing", desc: "Paket, kuota & tagihan", managerOnly: true },
      { href: "/settings/knowledge-base", icon: IconKb, color: "#6B7280", label: "Basis Pengetahuan", desc: "Materi grounding untuk AI" },
    ],
  },
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
  useRetentionStore.getState().reset();
  toast.success("Anda telah keluar dari sesi");
  router.push("/");
}

/* -------------------------------------------------------------------------- */
/* Sidebar — desktop only. Pure navigation; collapsible via TopBar toggle.    */
/* -------------------------------------------------------------------------- */
export function SideNav() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const [showMore, setShowMore] = useState(false); // "Lainnya" collapsed by default
  const activeWs = useWorkspaceStore((s) => s.active);
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
  // Per-user white-label mark for the collapsed rail (logo img, else brand initial).
  const { logoUrl, brandName } = useUserBrand();
  const collapsedInitial = (brandName ?? "Maira Sales").trim().charAt(0).toUpperCase() || "M";

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
            logoUrl ? (
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={brandName ?? "Maira Sales"}
                  className="h-full w-full object-contain"
                />
              </span>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                {collapsedInitial}
              </span>
            )
          ) : (
            <BrandLogo size="sm" />
          )}
        </Link>
      </div>

      {/* Active-workspace switcher (workspace-first) */}
      {!collapsed && (
        <div className="border-b px-3 py-2">
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Primary nav — grouped to the NEW IA */}
      <nav className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && (collapsed ? "mt-1.5" : "mt-3"))}>
            {!collapsed && group.collapsible ? (
              <button
                onClick={() => setShowMore((v) => !v)}
                className="flex w-full items-center gap-1 px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={cn("h-3 w-3 transition-transform", showMore ? "" : "-rotate-90")} />
                <span className="flex-1 text-left">{group.label}</span>
                <span className="rounded-full bg-muted px-1.5 text-[9px] tabular-nums">{visible(group.items).length}</span>
              </button>
            ) : !collapsed ? (
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            ) : null}
            {collapsed && gi > 0 && <div className="mx-2 mb-1.5 border-t border-border/60" />}
            {(!group.collapsible || collapsed || showMore) && (
              <div className="flex flex-col gap-0.5">
                {visible(group.items).map(({ href, icon: Icon, color, label, desc, badge }) => {
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
                      {/* 1 solid color per menu — fixed wayfinding hue, except on
                          the active row where it inherits the brand foreground. */}
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={active ? undefined : { color }}
                      />
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

      {/* AI assistant dock — anchored at the bottom of the sidebar. */}
      <div className={cn("border-t", collapsed ? "p-2" : "p-3")}>
        <Sheet>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <SheetTrigger asChild>
                  <button className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#F6845C] text-primary-foreground shadow-sm transition-transform hover:scale-105">
                    <Sparkles className="h-4 w-4" />
                  </button>
                </SheetTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Asisten Sales</TooltipContent>
            </Tooltip>
          ) : (
            <SheetTrigger asChild>
              <button className="group flex w-full items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-[#F6845C] px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110">
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
/* TopBar — sticky bar above main content (Coral Sunset shell).                */
/*   left:  sidebar toggle (desktop) · mobile hamburger (full grouped nav)     */
/*   right: workspace · ⌘K · AI · language · profile (tenant brand + user)     */
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

      {/* Mobile sheet sidebar — full grouped nav (mirrors the desktop IA) */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 overflow-y-auto p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>
              <BrandLogo size="sm" />
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-0.5 p-2">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mt-2 first:mt-0">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                {group.items
                  .filter((it) => !it.managerOnly || currentUser.role !== "Sales Rep")
                  .map(({ href, icon: Icon, color, label }) => {
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
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={active ? undefined : { color }}
                        />
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

      {/* Active-workspace context — the daily spine starts here. */}
      {activeWs && (
        <Link
          href="/workspace"
          className="ml-1 hidden max-w-[200px] items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm transition hover:bg-accent lg:inline-flex"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span className="truncate text-muted-foreground">{activeWs.name}</span>
        </Link>
      )}

      <div className="flex-1" />

      {/* Command palette opener (⌘K) */}
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

      {/* AI assistant — visible on every viewport. */}
      <Sheet>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[#F6845C] px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110">
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

      {/* Notifications — opens the Inbox (no hardcoded fake feed). */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/inbox")}
          >
            <Bell className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifikasi & Inbox</TooltipContent>
      </Tooltip>

      {/* Profile — tenant brand + user */}
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
          <DropdownMenuItem onClick={() => router.push("/branding")}>
            <IconBranding className="h-4 w-4" style={{ color: "#FD7A5C" }} />
            Branding
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings className="h-4 w-4" />
            Pengaturan
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

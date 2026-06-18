"use client";

import Link from "next/link";
import {
  Activity,
  BrainCircuit,
  Building2,
  ChevronRight,
  CreditCard,
  Globe2,
  Info,
  Mail,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { IDRAmount } from "@/components/shared/idr-amount";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_ACCOUNTS, type DemoRole } from "@/lib/auth/demo-accounts";
import { useAuthStore } from "@/lib/stores/auth-store";
import { channelMeta } from "@/lib/utils/channel-config";
import { cn } from "@/lib/utils";

// Pengguna list = demo accounts + one extra rep, surfaced in the workspace
// so the Superadmin can see who has seats.
const USERS = [
  ...DEMO_ACCOUNTS.map((a) => ({
    name: a.name,
    email: a.email,
    role: a.role,
    avatarColor: a.avatarColor,
    scope: a.scope,
  })),
  {
    name: "Maya Kusuma",
    email: "maya@mairasales.com",
    role: "Sales Rep" as DemoRole,
    avatarColor: "#A855F7",
    scope: "Inbox marketplace, kontak yang ditugaskan, dan tugas follow-up.",
  },
];

// Role color language — coral hot (Superadmin), amber (Admin),
// teal (Manager), info-blue (Rep). Matches the side-nav badge palette.
const ROLE_STYLE: Record<
  DemoRole,
  { ring: string; pill: string; label: string }
> = {
  Superadmin: {
    ring: "ring-primary/50",
    pill: "bg-primary/10 text-primary border border-primary/20",
    label: "Superadmin",
  },
  Admin: {
    ring: "ring-amber-400/50",
    pill: "bg-warning/15 text-warning border border-warning/30",
    label: "Admin",
  },
  "Sales Manager": {
    ring: "ring-tertiary/50",
    pill: "bg-tertiary/10 text-tertiary border border-tertiary/25",
    label: "Sales Manager",
  },
  "Sales Rep": {
    ring: "ring-info/50",
    pill: "bg-info/10 text-info border border-info/25",
    label: "Sales Rep",
  },
};

const INTEGRATIONS: {
  ch: string;
  name: string;
  on: boolean;
  description: string;
}[] = [
  {
    ch: "whatsapp",
    name: "WhatsApp Business API",
    on: true,
    description: "Pesan masuk & auto-reply melalui Meta Cloud API.",
  },
  {
    ch: "email",
    name: "Email (SMTP)",
    on: true,
    description: "Outbound email via SMTP terenkripsi TLS.",
  },
  {
    ch: "instagram",
    name: "Instagram DM",
    on: true,
    description: "Inbox DM Instagram Business — terhubung ke Meta.",
  },
  {
    ch: "tokopedia",
    name: "Tokopedia",
    on: true,
    description: "Sinkronisasi pesanan & chat seller Tokopedia.",
  },
  {
    ch: "shopee",
    name: "Shopee",
    on: false,
    description: "Aktifkan untuk menarik chat & pesanan Shopee.",
  },
  {
    ch: "tiktok",
    name: "TikTok Shop",
    on: false,
    description: "Aktifkan untuk inbox & order TikTok Shop.",
  },
];

export default function SettingsPage() {
  // Only Superadmins see the admin tabs + admin entry cards. Other roles
  // get a leaner Settings page focused on workspace info + their profile.
  const isSuperadmin = useAuthStore((s) => s.currentUser.role === "Superadmin");

  return (
    <div>
      <PageHeader title="Pengaturan" description="Kelola workspace, tim, dan integrasi." />

      <div className="p-6">
        <Tabs defaultValue="umum">
          <TabsList>
            <TabsTrigger value="umum">Umum</TabsTrigger>
            {isSuperadmin && (
              <>
                <TabsTrigger value="pengguna">Pengguna</TabsTrigger>
                <TabsTrigger value="integrasi">Integrasi</TabsTrigger>
                <TabsTrigger value="tagihan">Tagihan</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* ── Umum ───────────────────────────────────────────────── */}
          <TabsContent value="umum" className="mt-5 space-y-4">
            {/* Workspace hero strip — coral gradient */}
            <Card className="overflow-hidden border-primary/20">
              <div className="relative bg-gradient-to-br from-primary/15 via-primary/8 to-tertiary/10 p-5">
                <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
                <div className="absolute -left-2 -bottom-12 h-28 w-28 rounded-full bg-tertiary/20 blur-2xl" />
                <div className="relative flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_rgba(251,94,59,0.6)]">
                    <Building2 className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">Workspace</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Identitas perusahaan, zona waktu, dan preferensi domain.
                    </p>
                  </div>
                  <Badge variant="muted" className="hidden gap-1 sm:inline-flex">
                    <Globe2 className="h-3 w-3" />
                    UTC+7 · WIB
                  </Badge>
                </div>
              </div>
              <CardContent className="space-y-4 p-5">
                <div className="space-y-1.5">
                  <Label htmlFor="ws-name">Nama workspace</Label>
                  <Input
                    id="ws-name"
                    defaultValue="Maira Sales Indonesia"
                    readOnly
                    className="cursor-not-allowed bg-muted/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-domain">Domain</Label>
                  <Input
                    id="ws-domain"
                    defaultValue="mairasales.com"
                    readOnly
                    className="cursor-not-allowed bg-muted/40"
                  />
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0" />
                  Mode demo — identitas workspace masih statis, belum tersambung
                  ke penyimpanan.
                </p>
                <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <div>
                    <p className="text-sm font-medium">Zona waktu</p>
                    <p className="text-xs text-muted-foreground">Asia/Jakarta (WIB)</p>
                  </div>
                  <Badge variant="default" className="bg-primary/15 text-primary">
                    UTC+7
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Admin entry cards — Superadmin only. Hidden from other roles
                so non-admins don't see admin surface area. Direct-URL access
                to each route is also blocked by <RequireSuperadmin> guard. */}
            {isSuperadmin ? (
              <>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Hanya untuk Superadmin
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EntryCard
                    href="/settings/knowledge-base"
                    icon={BrainCircuit}
                    title="Basis Pengetahuan AI"
                    description="Produk, harga, segmen & alur retensi — sumber data Advanced RAG"
                    tone="coral"
                    badge="RAG"
                  />
                  <EntryCard
                    href="/settings/compliance"
                    icon={ShieldCheck}
                    title="Kepatuhan UU PDP"
                    description="Skor 94/100 · log persetujuan & jejak audit"
                    tone="green"
                    badge="94 / 100"
                  />
                  <EntryCard
                    href="/settings/compliance/dsar"
                    icon={ShieldCheck}
                    title="DSAR & Audit (live)"
                    description="Export/hapus data subjek, retensi data, dan jejak audit tersimpan di database."
                    tone="green"
                    badge="UU PDP"
                  />
                  <EntryCard
                    href="/settings/diagnostics"
                    icon={Activity}
                    title="Tes API & AI"
                    description="Status koneksi Deepseek, database, dan probe semua endpoint AI."
                    tone="blue"
                    badge="Live"
                  />
                  <EntryCard
                    href="/settings/handoff"
                    icon={Sparkles}
                    title="Alihkan ke Manusia"
                    description="Atur kapan AI menyerahkan percakapan ke agen."
                    tone="teal"
                    badge="Otomasi"
                  />
                  <EntryCard
                    href="/settings/team"
                    icon={Users}
                    title="Tim & Akses (RBAC)"
                    description="Anggota workspace, peran, dan undangan — tersimpan di database."
                    tone="coral"
                    badge="Live"
                  />
                  <EntryCard
                    href="/settings/ai"
                    icon={BrainCircuit}
                    title="AI & Model"
                    description="Pilih model aktif, kelola API key (BYOK), dan pantau pemakaian token & biaya."
                    tone="green"
                    badge="Registry"
                  />
                  <EntryCard
                    href="/settings/mailboxes"
                    icon={Mail}
                    title="Email & Jangkauan"
                    description="Connect mailbox SMTP, kirim email dari identitas sendiri, suppression & unsubscribe."
                    tone="blue"
                    badge="Kirim"
                  />
                  <EntryCard
                    href="/settings/extension"
                    icon={Puzzle}
                    title="Extension LinkedIn"
                    description="Unduh & pasang collector browser (RPA) untuk crawl lead LinkedIn ke workspace."
                    tone="coral"
                    badge="Crawl"
                  />
                  <EntryCard
                    href="/settings/billing"
                    icon={CreditCard}
                    title="Tagihan & Kuota"
                    description="Paket aktif, kuota token AI / email / kursi, dan pemakaian berjalan."
                    tone="coral"
                    badge="Plan"
                  />
                </div>
              </>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span>
                    Pengaturan lanjutan (Basis Pengetahuan, Kepatuhan, Tes
                    API/AI, Handoff) hanya tersedia untuk peran Superadmin.
                  </span>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Pengguna ───────────────────────────────────────────── */}
          <TabsContent value="pengguna" className="mt-5">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-gradient-to-r from-primary/8 via-transparent to-tertiary/8">
                <div>
                  <CardTitle className="text-base">Tim & Akses</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {USERS.length} pengguna aktif di workspace ini
                  </p>
                </div>
                <Badge variant="muted" className="gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Lisensi Growth
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {USERS.map((u) => {
                    const r = ROLE_STYLE[u.role];
                    return (
                      <li
                        key={u.email}
                        className="flex items-start gap-3 p-4 transition-colors hover:bg-primary/[0.03]"
                      >
                        <div
                          className={cn(
                            "rounded-full ring-2 ring-offset-2 ring-offset-card",
                            r.ring,
                          )}
                        >
                          <UserAvatar
                            name={u.name}
                            color={u.avatarColor}
                            className="h-11 w-11 text-[12px]"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{u.name}</p>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                r.pill,
                              )}
                            >
                              {r.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {u.email}
                          </p>
                          <p className="mt-1 text-xs italic text-muted-foreground/80">
                            {u.scope}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Integrasi ──────────────────────────────────────────── */}
          <TabsContent value="integrasi" className="mt-5 space-y-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              Mode demo — status koneksi bersifat ilustratif; toggle dinonaktifkan
              karena belum tersambung ke API channel.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {INTEGRATIONS.map((it) => {
                const meta = channelMeta(it.ch);
                const Icon = meta.icon;
                const tintColor = meta.color;
                return (
                  <Card
                    key={it.ch}
                    className={cn(
                      "relative overflow-hidden border-l-4 transition-shadow hover:shadow-md",
                      it.on ? "" : "opacity-90",
                    )}
                    style={{ borderLeftColor: tintColor }}
                  >
                    <CardContent className="flex items-start gap-3 p-4">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                        style={{ backgroundColor: tintColor }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{it.name}</p>
                          {it.on ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Terhubung
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                              Nonaktif
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {it.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {meta.label}
                          </span>
                          <Switch
                            defaultChecked={it.on}
                            disabled
                            aria-label={`${it.name} (mode demo)`}
                            title="Mode demo — belum tersambung ke API channel"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Tagihan ────────────────────────────────────────────── */}
          <TabsContent value="tagihan" className="mt-5">
            <Card className="overflow-hidden border-primary/25">
              {/* Gradient header strip */}
              <div className="relative bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground">
                <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                <div className="absolute -left-4 -bottom-10 h-24 w-24 rounded-full bg-tertiary/40 blur-2xl" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      <Sparkles className="h-3 w-3" />
                      Aktif
                    </span>
                    <h3 className="mt-2 text-xl font-semibold">Paket Growth</h3>
                    <p className="mt-0.5 text-xs text-primary-foreground/90">
                      AI Autopilot · 10 kursi · seluruh channel
                    </p>
                  </div>
                  <div className="text-right">
                    <IDRAmount
                      value={449000}
                      className="text-2xl font-bold tnum"
                    />
                    <p className="text-[10px] uppercase tracking-wide text-primary-foreground/80">
                      / pengguna / bln
                    </p>
                  </div>
                </div>
              </div>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between rounded-lg bg-tertiary/8 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Pengguna aktif</span>
                  {/* Derive from the same list as the Pengguna tab so the two
                      sections don't contradict (was a hardcoded "10 / 10"). */}
                  <span className="font-semibold text-tertiary">{USERS.length} / 10</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-info/8 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Tagihan berikutnya</span>
                  <span className="font-semibold text-info">1 Juli 2026</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total bulan ini</span>
                  <IDRAmount value={4490000} className="text-lg font-bold text-primary" />
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Link href="/settings/billing">Kelola paket</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Vivid entry card ───────────────────────────────────────────────────────
function EntryCard({
  href,
  icon: Icon,
  title,
  description,
  tone,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone: "coral" | "green" | "blue" | "teal";
  badge?: string;
}) {
  // tone → background gradient + icon tint + accent border + badge pill
  const styles = {
    coral: {
      border: "hover:border-primary/40",
      grad: "from-primary/10 via-primary/5 to-transparent",
      iconBg: "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(251,94,59,0.6)]",
      badge: "bg-primary/10 text-primary border-primary/20",
      arrow: "text-primary",
    },
    green: {
      border: "hover:border-success/40",
      grad: "from-success/10 via-success/5 to-transparent",
      iconBg: "bg-success text-white shadow-[0_8px_20px_-8px_rgba(16,185,129,0.55)]",
      badge: "bg-success/10 text-success border-success/20",
      arrow: "text-emerald-600",
    },
    blue: {
      border: "hover:border-info/40",
      grad: "from-info/10 via-info/5 to-transparent",
      iconBg: "bg-info text-white shadow-[0_8px_20px_-8px_rgba(59,130,246,0.55)]",
      badge: "bg-info/10 text-info border-info/20",
      arrow: "text-info",
    },
    teal: {
      border: "hover:border-tertiary/40",
      grad: "from-tertiary/10 via-tertiary/5 to-transparent",
      iconBg: "bg-tertiary text-tertiary-foreground shadow-[0_8px_20px_-8px_rgba(20,184,166,0.55)]",
      badge: "bg-tertiary/10 text-tertiary border-tertiary/20",
      arrow: "text-tertiary",
    },
  }[tone];

  return (
    <Link href={href} className="group">
      <Card
        className={cn(
          "relative h-full overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          styles.border,
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
            styles.grad,
          )}
        />
        <CardContent className="relative flex items-start gap-3 p-4">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              styles.iconBg,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{title}</p>
              {badge && (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    styles.badge,
                  )}
                >
                  {badge}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {description}
            </p>
          </div>
          <ChevronRight
            className={cn(
              "h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5",
              styles.arrow,
            )}
          />
        </CardContent>
      </Card>
    </Link>
  );
}

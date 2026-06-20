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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  // Only Superadmins see the admin entry cards. Other roles get a leaner
  // Settings page focused on workspace info + their profile. The dedicated
  // sub-sections (Tim, Mailbox, Billing, …) live in the left SettingsNav rail,
  // so the old Pengguna/Integrasi/Tagihan tabs were duplicates and are gone.
  const isSuperadmin = useAuthStore((s) => s.currentUser.role === "Superadmin");

  return (
    <div>
      <PageHeader title="Pengaturan" description="Kelola workspace, tim, dan integrasi." />

      <div className="p-6">
        <div className="space-y-4">
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
        </div>
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

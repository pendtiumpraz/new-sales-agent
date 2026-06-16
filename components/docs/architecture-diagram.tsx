"use client";

import { ArrowDown, Bot, Building2, Crown, Globe2, Lock, Radar, Send, ShieldCheck, Store, UserCog, Users } from "lucide-react";

// High-level architecture diagram (doc 41) — explains the role hierarchy, the
// two levels of data isolation, and the RPA → AI → execution → attribution flow
// so users understand how the platform fits together.

function Box({
  icon: Icon,
  title,
  children,
  tone = "slate",
}: {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  tone?: "slate" | "primary" | "blue" | "emerald" | "violet";
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50",
    primary: "border-primary/30 bg-primary/5",
    blue: "border-blue-200 bg-blue-50",
    emerald: "border-emerald-200 bg-emerald-50",
    violet: "border-violet-200 bg-violet-50",
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tones[tone]}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0" />
        {title}
      </p>
      {children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

function FlowStep({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="flex-1 rounded-md border bg-card px-2.5 py-2 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" />
      <p className="mt-1 text-xs font-semibold">{title}</p>
      <p className="text-[10px] leading-tight text-muted-foreground">{sub}</p>
    </div>
  );
}

export function ArchitectureDiagram() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">Arsitektur tingkat tinggi</h2>
        <p className="text-sm text-muted-foreground">
          Siapa melihat apa, bagaimana data dipisah, dan alur kerja dari crawl sampai closing.
        </p>
      </div>

      {/* Superadmin */}
      <Box icon={Crown} title="Superadmin — pemilik platform" tone="primary">
        Kelola semua tenant · aktivasi + kredit AI · kill-switch. Tidak ikut campur data jualan tenant.
      </Box>

      <div className="flex justify-center">
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Tenants — isolated from each other */}
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
        {/* Tenant A (expanded) */}
        <div className="rounded-lg border-2 border-dashed border-primary/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Building2 className="h-3.5 w-3.5" /> Tenant A (perusahaan)
          </p>
          <div className="space-y-2">
            <Box icon={UserCog} title="Manajer tenant (owner / admin)" tone="blue">
              Lihat <b>SEMUA</b> kontak & data semua sales. <b>Boleh sales langsung</b> ke partner/klien dari akunnya
              sendiri — tak harus lewat sales.
            </Box>
            <div className="grid grid-cols-3 gap-2">
              {["Sales A", "Sales B", "Sales C"].map((s) => (
                <Box key={s} icon={Users} title={s} tone="emerald">
                  Hanya lihat lead <b>miliknya</b>.
                </Box>
              ))}
            </div>
            <p className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Data tiap sales <b>terisolasi</b> antar-sales, tapi <b>milik perusahaan tenant</b> (manajer tetap lihat semua).
            </p>
          </div>
        </div>

        {/* Isolation divider */}
        <div className="flex flex-col items-center justify-center gap-1 px-1 text-muted-foreground">
          <Lock className="h-5 w-5" />
          <span className="text-center text-[10px] font-medium leading-tight">isolasi<br />antar-tenant</span>
        </div>

        {/* Tenant B (collapsed) */}
        <div className="rounded-lg border-2 border-dashed border-slate-300 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Tenant B (perusahaan lain)
          </p>
          <div className="flex h-[calc(100%-2rem)] items-center justify-center rounded-md border border-dashed bg-muted/40 p-4 text-center text-xs text-muted-foreground">
            Struktur sama, <b className="mx-1">data 100% terpisah</b> — Tenant A & B tak pernah saling lihat.
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Workflow */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Alur kerja tiap sales / manajer
        </p>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <FlowStep icon={Radar} title="RPA crawl" sub="extension, sesi login sales sendiri" />
          <span className="self-center text-muted-foreground">→</span>
          <FlowStep icon={ShieldCheck} title="Profiling" sub="rules + AI tipis (hemat token)" />
          <span className="self-center text-muted-foreground">→</span>
          <FlowStep icon={Bot} title="AI rekomendasi" sub="filter B2C/B2B + cara komunikasi" />
          <span className="self-center text-muted-foreground">→</span>
          <FlowStep icon={Send} title="Eksekusi" sub="dari akun sales / manajer sendiri" />
        </div>
        <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
          <b>Atribusi:</b> tiap aksi ber-identitas → kelihatan sales mana aktif, closing dari sales mana, dan partner/lead
          mana dipegang sales mana. <b>AI hemat token</b>: RPA yang ekstrak data, AI cuma kasih rekomendasi & filter.
        </p>
        <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
          <b>Akun per-sales:</b> tiap sales daftarkan akun <b>LinkedIn</b> + <b>Instagram</b>-nya di web → extension pakai
          <b> token per-sales</b> → lead hasil crawl otomatis <b>ter-assign</b> ke sales itu (dan ter-dedup di level tenant).
        </p>
      </div>

      <div className="flex justify-center">
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Shared contact pool / marketplace */}
      <div className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/40 p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-violet-700">
          <Store className="h-4 w-4" /> Shared Contact Pool (marketplace antar-tenant) — hanya mode SaaS
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Jual-beli data <b>orang</b> & <b>perusahaan</b>. Superadmin set mode deploy: <b>SaaS</b> → menu aktif ·
          <b> on-prem</b> → menu di-disable (single-tenant, tak ada pasar).
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Box icon={Globe2} title="Publish (opt-in)" tone="violet">
            Tenant boleh <b>mem-publik-kan</b> sebagian kontak (idealnya <b>level perusahaan</b>) ke pool platform.
          </Box>
          <Box icon={Store} title="Browse & beli" tone="violet">
            Tenant lain lihat <b>shared contact</b> & beli untuk dipakai sales-nya.
          </Box>
          <Box icon={ShieldCheck} title="Consent-gated" tone="violet">
            Hanya kontak dengan <b>dasar hukum/consent</b> yang boleh di-share (UU PDP). Default: privat.
          </Box>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Default semua kontak <b>privat</b> (per-sales, per-tenant). Marketplace hanya untuk yang sengaja di-publish +
          patuh consent. Dedup otomatis: kontak yang sama (per-tenant) tak ganda walau di-crawl beberapa sales.
        </p>
      </div>
    </div>
  );
}

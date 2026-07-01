"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Code2,
  Eye,
  Fingerprint,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  defaultDraft,
  draftToPatch,
  HEX_RE,
  TOKEN_DEFS,
  themeToDraft,
  TOKEN_BY_KEY,
  type BrandingDraft,
  type ResolvedThemeDto,
  type TokenGroup,
  type TokenKey,
} from "./tokens";

// ── API envelope ───────────────────────────────────────────────────────────
interface ThemeApiData {
  theme: ResolvedThemeDto;
  vars: Record<string, string>;
}
interface ApiOk {
  ok: true;
  data: ThemeApiData;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}

async function readApi(res: Response): Promise<ThemeApiData> {
  const json = (await res.json().catch(() => null)) as ApiOk | ApiErr | null;
  if (!res.ok || !json || !json.ok) {
    throw new Error(json && !json.ok ? json.error : "Gagal memuat branding");
  }
  return json.data;
}

// ── luminance → readable foreground (mirrors the mockup heuristic) ──────────
function luminance(hex: string): number {
  let c = hex.replace("#", "");
  if (c.length === 3)
    c = c
      .split("")
      .map((x) => x + x)
      .join("");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const GROUP_LABEL: Record<TokenGroup, string> = {
  core: "Inti — brand & aksen",
  surface: "Permukaan & teks",
  status: "Status",
};

// Editor is split into tabs; the preview + save/reset stay outside them.
type EditorTab = "identitas" | "warna" | "css";

export default function BrandingPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Akun kamu";
  const initials = useMemo(
    () =>
      userName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("") || "AK",
    [userName],
  );

  // Server theme → seed the editor draft once loaded.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["branding-theme"],
    queryFn: async () => readApi(await fetch("/api/branding/theme")),
  });

  const [draft, setDraft] = useState<BrandingDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Editor sections are tabbed; preview + actions stay outside the tabs.
  const [tab, setTab] = useState<EditorTab>("identitas");
  // Invalid-hex cue per token (don't push junk into the preview).
  const [badHex, setBadHex] = useState<Partial<Record<TokenKey, boolean>>>({});

  // Seed the draft from the server snapshot exactly once it arrives.
  useEffect(() => {
    if (data && !draft) setDraft(themeToDraft(data.theme));
  }, [data, draft]);

  function patchDraft(next: Partial<BrandingDraft>) {
    setDraft((d) => (d ? { ...d, ...next } : d));
    setDirty(true);
  }
  function setToken(key: TokenKey, hex: string) {
    setDraft((d) => (d ? { ...d, tokens: { ...d.tokens, [key]: hex } } : d));
    setDirty(true);
  }

  // ── Save (PUT) + Reset (POST) — both re-theme the live shell on success ──
  const save = useMutation({
    mutationFn: async (d: BrandingDraft) =>
      readApi(
        await fetch("/api/branding/theme", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftToPatch(d)),
        }),
      ),
    onSuccess: (d) => {
      setDraft(themeToDraft(d.theme));
      setDirty(false);
      // Re-theme the real chrome: the shell's UserThemeProvider reads this key.
      qc.invalidateQueries({ queryKey: ["user-theme"] });
      qc.setQueryData(["branding-theme"], d);
      toast.success("Branding tersimpan — berlaku di sesi kamu");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan branding"),
  });

  const reset = useMutation({
    mutationFn: async () =>
      readApi(await fetch("/api/branding/theme/reset", { method: "POST" })),
    onSuccess: (d) => {
      setDraft(themeToDraft(d.theme));
      setDirty(false);
      setResetOpen(false);
      qc.invalidateQueries({ queryKey: ["user-theme"] });
      qc.setQueryData(["branding-theme"], d);
      toast.success("Direset ke Coral Sunset");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Gagal mereset branding"),
  });

  // ── Identity uploads → data URLs (round-trippable through the API) ──────
  function readAsDataUrl(file: File, onDone: (url: string) => void) {
    const r = new FileReader();
    r.onload = () => onDone(String(r.result));
    r.readAsDataURL(file);
  }

  function loadPreset() {
    setDraft((d) => (d ? { ...defaultDraft(), brandName: d.brandName } : defaultDraft()));
    setBadHex({});
    setDirty(true);
    toast.success('Preset "Coral Sunset" dimuat');
  }

  return (
    <div>
      <PageHeader
        title="Branding & Tampilan"
        description='Atur tampilan aplikasi untuk dirimu sendiri — logo, favicon, semua token warna, & Custom CSS. Default-nya tema bawaan "Coral Sunset".'
      >
        <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tertiary/15 text-[9px] font-bold text-tertiary">
            {initials}
          </span>
          Akun: <span className="font-medium text-foreground/80">{userName}</span>
        </span>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* Per-user emphasis banner — "hanya untuk akun kamu" */}
        <div className="flex items-start gap-3 rounded-lg border border-tertiary/30 bg-tertiary/[0.08] px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tertiary/15 text-tertiary">
            <Info className="h-4 w-4" />
          </span>
          <div className="text-[13px] leading-relaxed">
            <b className="text-foreground">Perubahan hanya berlaku untuk akun kamu.</b>{" "}
            <span className="text-muted-foreground">
              Rekan satu tim & tenant tetap melihat tampilan mereka sendiri. Branding disimpan
              per-user (bukan se-tenant), diterapkan saat sesi login kamu. Entitlement/modul/kuota
              tetap per-tenant.
            </span>
          </div>
        </div>

        {isError ? (
          <ErrorState
            title="Gagal memuat branding"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : isLoading || !draft ? (
          <BrandingSkeleton />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-3">
            {/* ============ EDITOR COLUMN (2/3) — tabbed ============ */}
            <div className="space-y-5 lg:col-span-2">
              {/* Tab bar — mirrors reports/page.tsx (TabButton + border-b gating) */}
              <div className="flex items-center gap-1 border-b border-border">
                <TabButton active={tab === "identitas"} onClick={() => setTab("identitas")}>
                  <Fingerprint className="h-4 w-4" />
                  Identitas
                </TabButton>
                <TabButton active={tab === "warna"} onClick={() => setTab("warna")}>
                  <Palette className="h-4 w-4" />
                  Skema Warna
                </TabButton>
                <TabButton active={tab === "css"} onClick={() => setTab("css")}>
                  <Code2 className="h-4 w-4" />
                  Custom CSS
                </TabButton>
              </div>

              {/* (1) IDENTITAS */}
              {tab === "identitas" && (
                <IdentitySection
                  draft={draft}
                  onBrandName={(v) => patchDraft({ brandName: v })}
                  onLogo={(f) =>
                    f
                      ? readAsDataUrl(f, (url) => patchDraft({ logoUrl: url }))
                      : patchDraft({ logoUrl: null })
                  }
                  onFavicon={(f) => f && readAsDataUrl(f, (url) => patchDraft({ faviconUrl: url }))}
                  onFaviconClear={() => patchDraft({ faviconUrl: null })}
                />
              )}

              {/* (2) SKEMA WARNA */}
              {tab === "warna" && (
                <ColorSchemeSection
                  draft={draft}
                  badHex={badHex}
                  onPreset={loadPreset}
                  onColor={(key, hex) => {
                    setBadHex((b) => ({ ...b, [key]: false }));
                    setToken(key, hex);
                  }}
                  onHex={(key, raw) => {
                    let v = raw.trim();
                    if (v && v[0] !== "#") v = "#" + v;
                    if (HEX_RE.test(v)) {
                      setBadHex((b) => ({ ...b, [key]: false }));
                      setToken(key, v.toUpperCase());
                    } else {
                      setBadHex((b) => ({ ...b, [key]: true }));
                    }
                  }}
                />
              )}

              {/* (3) Advanced — Custom CSS */}
              {tab === "css" && (
                <section className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-xs font-bold text-primary">
                      <Code2 className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold">Advanced — Custom CSS</h2>
                      <p className="text-[11px] text-muted-foreground">
                        Override penuh lewat CSS mentah. Untuk pengguna lanjutan.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 p-5">
                    <textarea
                      rows={6}
                      spellCheck={false}
                      value={draft.customCss}
                      onChange={(e) => patchDraft({ customCss: e.target.value })}
                      placeholder={"/* contoh */\n:root { --radius: 0.75rem; }"}
                      className="w-full resize-y rounded-lg border border-border bg-[#1B1A19] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#e8e2dd] focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Disuntik setelah token warna, jadi mengalahkan skema di atas. Salah CSS hanya
                      merusak tampilan-mu sendiri. CSS disanitasi di server sebelum disimpan.
                    </p>
                  </div>
                </section>
              )}
            </div>

            {/* ============ PREVIEW + ACTIONS (1/3, sticky) ============ */}
            <div className="space-y-5 lg:sticky lg:top-[88px]">
              <LivePreview draft={draft} />

              <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-md">
                {dirty && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Ada perubahan belum disimpan.
                  </div>
                )}
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() => save.mutate(draft)}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {save.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Simpan perubahan
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
                >
                  <RotateCcw className="h-4 w-4" /> Reset ke default (Coral Sunset)
                </button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Reset mengembalikan logo, favicon, & semua token ke tema bawaan. Konfirmasi dulu
                  via panel kanan.
                </p>
              </section>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Grain: <b>branding = per-user</b> (appearance), terpisah dari{" "}
          <b>entitlements/modul/kuota = per-tenant</b>. Token warna ter-apply via CSS variable di
          brand mark, menu aktif, tombol primary, & aksen di seluruh shell aplikasi.
        </p>
      </div>

      {/* ── Reset confirm — right drawer ── */}
      <Sheet open={resetOpen} onOpenChange={(o) => !reset.isPending && setResetOpen(o)}>
        <SheetContent side="right" className="w-[400px] max-w-full p-0">
          <SheetHeader className="flex-row items-center gap-3 border-b border-border p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/[0.12] text-danger">
              <RotateCcw className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm font-bold">
                Reset ke Coral Sunset?
              </SheetTitle>
              <p className="truncate text-[11px] text-muted-foreground">
                Tema bawaan · hanya akun kamu
              </p>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.08] px-3 py-2.5 text-[12px] text-foreground/80">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                Tindakan ini mengembalikan <b>logo, favicon, nama brand, semua token warna, &
                Custom CSS</b> ke tema bawaan. Tidak bisa dibatalkan setelah dijalankan.
              </span>
            </div>
            <ul className="space-y-2 text-[12px] text-muted-foreground">
              {(["primary", "brand", "highlight", "background"] as TokenKey[]).map((k) => {
                const d = TOKEN_BY_KEY[k];
                return (
                  <li key={k} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-sm border border-border"
                      style={{ background: d.hex }}
                    />
                    {d.label.split(" ")[0]} →{" "}
                    <span className="font-medium text-foreground/80">{d.hex}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Branding rekan tim & tenant tidak terpengaruh.
            </p>
          </div>

          <SheetFooter className="flex-row gap-2.5 border-t border-border p-5">
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => setResetOpen(false)}
              className="h-9 flex-1 rounded-lg border border-border bg-card text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {reset.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Mereset…
                </>
              ) : (
                "Ya, reset"
              )}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// (1) IDENTITAS — logo + favicon + brand name
// ════════════════════════════════════════════════════════════════════════════
function IdentitySection({
  draft,
  onBrandName,
  onLogo,
  onFavicon,
  onFaviconClear,
}: {
  draft: BrandingDraft;
  onBrandName: (v: string) => void;
  onLogo: (f: File | null) => void;
  onFavicon: (f: File | null) => void;
  onFaviconClear: () => void;
}) {
  const logoInput = useRef<HTMLInputElement>(null);
  const favInput = useRef<HTMLInputElement>(null);
  const brandLabel = draft.brandName.trim() || "SapaAI";
  const mark = brandLabel.slice(0, 2).toUpperCase();

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
          <Fingerprint className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Identitas</h2>
          <p className="text-[11px] text-muted-foreground">
            Logo, favicon, & nama brand di sidebar + tab browser.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Logo */}
        <div className="flex flex-wrap items-start gap-4">
          <span className="w-28 shrink-0 pt-2 text-[13px] font-medium text-foreground">Logo</span>
          <div className="flex h-14 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 text-[10px] text-muted-foreground">
            {draft.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.logoUrl} alt="logo" className="max-h-12 max-w-full object-contain" />
            ) : (
              <span className="flex items-center gap-1.5 font-semibold text-foreground/70">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
                  {mark}
                </span>
                {brandLabel}
              </span>
            )}
          </div>
          <div className="flex min-w-[180px] flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted"
              >
                <Upload className="h-3.5 w-3.5" /> Upload .png/.svg
              </button>
              <input
                ref={logoInput}
                type="file"
                accept=".png,.svg,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
              />
              {draft.logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onLogo(null);
                    if (logoInput.current) logoInput.current.value = "";
                  }}
                  className="h-8 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-danger"
                >
                  Hapus
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              PNG/SVG, maks ~1MB, rasio lebar. Kosong → pakai logo default.
            </p>
          </div>
        </div>

        {/* Favicon */}
        <div className="flex flex-wrap items-start gap-4 border-t border-border/70 pt-5">
          <span className="w-28 shrink-0 pt-1 text-[13px] font-medium text-foreground">
            Favicon
          </span>
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-border bg-primary bg-cover bg-center text-[10px] font-bold text-primary-foreground"
              style={draft.faviconUrl ? { backgroundImage: `url(${draft.faviconUrl})` } : undefined}
            >
              {!draft.faviconUrl && mark}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-sm border border-border bg-primary bg-cover bg-center text-[6px] font-bold text-primary-foreground"
                style={
                  draft.faviconUrl ? { backgroundImage: `url(${draft.faviconUrl})` } : undefined
                }
              >
                {!draft.faviconUrl && mark.slice(0, 1)}
              </div>
              <span className="text-[9px] text-muted-foreground">16px (tab)</span>
            </div>
          </div>
          <div className="flex min-w-[180px] flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => favInput.current?.click()}
                className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted"
              >
                <Upload className="h-3.5 w-3.5" /> Upload .png/.ico
              </button>
              <input
                ref={favInput}
                type="file"
                accept=".png,.ico,.svg"
                className="hidden"
                onChange={(e) => onFavicon(e.target.files?.[0] ?? null)}
              />
              {draft.faviconUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onFaviconClear();
                    if (favInput.current) favInput.current.value = "";
                  }}
                  className="h-8 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-danger"
                >
                  Hapus
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Persegi, ≥32×32. Dipakai di tab browser hanya untuk sesi kamu.
            </p>
          </div>
        </div>

        {/* Brand name */}
        <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-5">
          <span className="w-28 shrink-0 text-[13px] font-medium text-foreground">Nama brand</span>
          <input
            type="text"
            value={draft.brandName}
            onChange={(e) => onBrandName(e.target.value)}
            placeholder='Mis. "Maira Sales"'
            className="h-9 min-w-[200px] flex-1 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// (2) SKEMA WARNA — every token row: label · color picker · hex
// ════════════════════════════════════════════════════════════════════════════
function ColorSchemeSection({
  draft,
  badHex,
  onPreset,
  onColor,
  onHex,
}: {
  draft: BrandingDraft;
  badHex: Partial<Record<TokenKey, boolean>>;
  onPreset: () => void;
  onColor: (key: TokenKey, hex: string) => void;
  onHex: (key: TokenKey, raw: string) => void;
}) {
  const groups: TokenGroup[] = ["core", "surface", "status"];
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Skema Warna</h2>
            <p className="text-[11px] text-muted-foreground">
              Edit <b>semua</b> token. Tiap baris: label · color picker · hex.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onPreset}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Muat preset &quot;Coral Sunset&quot;
        </button>
      </div>

      {groups.map((group, gi) => (
        <div key={group}>
          <div
            className={cn(
              "px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70",
              gi > 0 && "border-t border-border",
            )}
          >
            {GROUP_LABEL[group]}
          </div>
          <div className="divide-y divide-border">
            {TOKEN_DEFS.filter((d) => d.group === group).map((def) => {
              const hex = draft.tokens[def.key];
              return (
                <div key={def.key} className="flex items-center gap-3 px-5 py-2.5">
                  <label className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border">
                    <input
                      type="color"
                      value={HEX_RE.test(hex) ? hex : def.hex}
                      onChange={(e) => onColor(def.key, e.target.value.toUpperCase())}
                      className="absolute inset-0 h-full w-full cursor-pointer"
                      aria-label={`Warna ${def.label}`}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">
                      {def.label}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{def.desc}</div>
                  </div>
                  <input
                    type="text"
                    maxLength={7}
                    value={hex}
                    onChange={(e) => onHex(def.key, e.target.value)}
                    className={cn(
                      "h-8 w-24 rounded-lg border bg-card px-2 text-center text-[12px] uppercase tabular-nums tracking-wide focus:outline-none focus:ring-2 focus:ring-ring/40",
                      badHex[def.key] ? "border-danger" : "border-border",
                    )}
                    aria-label={`Hex ${def.label}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Swatch = color picker. Nilai hex bisa diketik manual. Setiap perubahan langsung tercermin di
        Live Preview.
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// (4) LIVE PREVIEW — self-contained themed mini app-shell (--p-* vars)
// ════════════════════════════════════════════════════════════════════════════
function LivePreview({ draft }: { draft: BrandingDraft }) {
  const t = draft.tokens;
  const brandLabel = draft.brandName.trim() || "SapaAI";
  const mark = brandLabel.slice(0, 2).toUpperCase();
  const primaryFg = luminance(t.primary) > 0.6 ? "#1B1A19" : "#FFFFFF";

  // Each token → its --p-* var; the surface below reads only these.
  const scopeVars: Record<string, string> = { "--p-primary-fg": primaryFg };
  for (const def of TOKEN_DEFS) scopeVars[def.previewVar] = t[def.key];
  const v = (name: string) => `var(${name})`;
  const mix = (name: string, pct: number) =>
    `color-mix(in srgb, var(${name}) ${pct}%, transparent)`;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
            <Eye className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold">Live Preview</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-tertiary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" /> update langsung
        </span>
      </div>

      <div className="p-4">
        <div
          className="overflow-hidden rounded-xl border"
          style={{ ...scopeVars, borderColor: v("--p-border"), background: v("--p-bg"), color: v("--p-fg") }}
        >
          {/* mini topbar */}
          <div
            className="flex h-9 items-center justify-between border-b px-3"
            style={{ background: v("--p-card"), borderColor: v("--p-border") }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: v("--p-fg") }}>
              <span
                className="flex h-4 w-4 items-center justify-center overflow-hidden rounded bg-cover bg-center text-[8px] font-bold"
                style={
                  draft.logoUrl
                    ? { backgroundImage: `url(${draft.logoUrl})` }
                    : { background: v("--p-primary"), color: v("--p-primary-fg") }
                }
              >
                {!draft.logoUrl && mark}
              </span>
              <span>{brandLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: v("--p-tertiary") }} />
              <span className="h-4 w-4 rounded-full" style={{ background: v("--p-primary") }} />
            </div>
          </div>

          <div className="flex" style={{ height: 210 }}>
            {/* mini sidebar */}
            <div
              className="w-20 space-y-1.5 border-r p-2"
              style={{ background: v("--p-card"), borderColor: v("--p-border") }}
            >
              <div
                className="flex h-5 items-center rounded px-1.5 text-[8px] font-semibold"
                style={{ background: mix("--p-primary", 14), color: v("--p-primary") }}
              >
                Dasbor
              </div>
              {["Kontak", "Inbox", "Pipeline", "Branding"].map((label) => (
                <div
                  key={label}
                  className="flex h-4 items-center rounded px-1.5 text-[8px]"
                  style={{ color: v("--p-fg"), opacity: 0.6 }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* mini content */}
            <div className="flex-1 space-y-2.5 p-3" style={{ background: v("--p-bg") }}>
              <div className="text-[10px] font-bold" style={{ color: v("--p-fg") }}>
                Halo, {brandLabel.split(" ")[0]} 👋
              </div>
              <div className="flex gap-1.5">
                <div
                  className="flex h-6 items-center rounded-md px-2.5 text-[8px] font-semibold shadow-sm"
                  style={{ background: v("--p-primary"), color: v("--p-primary-fg") }}
                >
                  Buka Workspace
                </div>
                <div
                  className="flex h-6 items-center rounded-md border px-2.5 text-[8px] font-medium"
                  style={{ color: v("--p-tertiary"), borderColor: v("--p-tertiary") }}
                >
                  Aksi
                </div>
              </div>
              <div
                className="rounded-lg border p-2"
                style={{ background: v("--p-card"), borderColor: v("--p-border") }}
              >
                <div className="mb-1 text-[8px] font-semibold" style={{ color: v("--p-fg") }}>
                  Deal jalan
                </div>
                <div className="text-[12px] font-bold" style={{ color: v("--p-tertiary") }}>
                  Rp 284 jt
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                  style={{ background: mix("--p-fg", 10) }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: "62%", background: v("--p-highlight") }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[7px] font-semibold"
                  style={{ background: mix("--p-success", 16), color: v("--p-success") }}
                >
                  Sukses
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[7px] font-semibold"
                  style={{ background: mix("--p-warning", 18), color: v("--p-warning") }}
                >
                  Peringatan
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[7px] font-semibold"
                  style={{ background: mix("--p-danger", 14), color: v("--p-danger") }}
                >
                  Error
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[7px] font-semibold"
                  style={{
                    background: mix("--p-highlight", 18),
                    color: `color-mix(in srgb, var(--p-highlight) 75%, var(--p-fg))`,
                  }}
                >
                  Sorotan
                </span>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          Cermin sidebar · topbar · tombol · card · badge dengan token kamu — termasuk favicon di
          tab setelah disimpan.
        </p>
      </div>
    </section>
  );
}

// ── tab bar button — mirrors reports/page.tsx (Coral Sunset underline tab) ──
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── loading skeleton — mirrors the 2-column editor + sticky preview ─────────
function BrandingSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}

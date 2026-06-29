"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// REAL Module-1 onboarding — faithful to mockups/onboarding.html (Coral Sunset).
// Full-screen 3-step wizard (one step visible at a time), wired to the new API:
//   Step 1 — pick usage/vertical → PATCH /api/onboarding { verticalKey } (seeds
//            entitlements from the vertical bundle). Catalog: GET /api/onboarding/verticals.
//   Step 2 — per-USER appearance → PUT /api/branding/theme { brandName, primaryColor }
//            with a live preview (CSS-var driven, applied document-wide on save).
//   Step 3 — invite team (UX; seats quota). "Selesai" → PATCH /api/onboarding
//            { complete:true } → /dashboard.
// Loading / empty / error states are explicit at every fetch.

interface VerticalRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultModules: string[];
}

interface SwatchOption {
  label: string;
  hex: string;
  hsl: string; // "H S% L%"
}

const SWATCHES: SwatchOption[] = [
  { label: "Coral Sunset", hex: "#FD7A5C", hsl: "12 96% 67%" },
  { label: "Teal", hex: "#14B8A6", hsl: "173 80% 40%" },
  { label: "Ocean Blue", hex: "#2563EB", hsl: "221 83% 53%" },
  { label: "Violet", hex: "#8B5CF6", hsl: "262 83% 58%" },
  { label: "Emerald", hex: "#10B981", hsl: "160 84% 39%" },
  { label: "Rose", hex: "#E1306C", hsl: "333 80% 52%" },
];

// Fallback verticals so the wizard is usable even when the catalog is empty / no DB.
const FALLBACK_VERTICALS: VerticalRow[] = [
  { id: "v_hr", key: "hr", name: "HR", description: "Rekrutmen & outreach kandidat.", defaultModules: ["contacts", "inbox", "cadences"] },
  { id: "v_sales", key: "sales", name: "Sales", description: "Pipeline, deals & closing WA-first.", defaultModules: ["contacts", "inbox", "pipeline", "penawaran"] },
  { id: "v_other", key: "other", name: "Lainnya", description: "Custom — pilih modul manual.", defaultModules: [] },
];

const STEPS = [
  { n: 1, label: "Usage / Vertical" },
  { n: 2, label: "Tampilan personal" },
  { n: 3, label: "Undang Seat" },
];

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [step, setStep] = useState(1);
  const [verticals, setVerticals] = useState<VerticalRow[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [vertical, setVertical] = useState<string>("sales");

  const [brandName, setBrandName] = useState("");
  const [primaryHex, setPrimaryHex] = useState("#FD7A5C");

  const [invites, setInvites] = useState<{ email: string; role: string }[]>([
    { email: "", role: "Sales Rep" },
  ]);

  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gate: must be authenticated (an activated tenant). Otherwise bounce.
  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.replace("/login");
  }, [sessionStatus, router]);

  // Default brand name from the session; pre-select vertical from register hint.
  useEffect(() => {
    if (session?.user?.name && !brandName) setBrandName(session.user.name);
    try {
      const hint = sessionStorage.getItem("maira:onboarding-vertical");
      if (hint) setVertical(hint);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Load the vertical catalog (loading / empty / error all handled).
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/onboarding/verticals");
        if (!r.ok) throw new Error("forbidden");
        const j = await r.json();
        const rows: VerticalRow[] = j?.ok ? j.data : Array.isArray(j) ? j : [];
        if (cancelled) return;
        setVerticals(rows.length > 0 ? rows : FALLBACK_VERTICALS);
      } catch {
        if (!cancelled) {
          setCatalogError(true);
          setVerticals(FALLBACK_VERTICALS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const selectedVertical = useMemo(
    () => verticals?.find((v) => v.key === vertical) ?? null,
    [verticals, vertical],
  );

  // Apply the chosen primary color live (document-wide) so the preview + whole UI react.
  function applyPrimary(hex: string) {
    setPrimaryHex(hex);
    const channels = hexToHsl(hex);
    document.documentElement.style.setProperty("--primary", channels);
    document.documentElement.style.setProperty("--ring", channels);
  }

  // Step 1 → persist vertical (seeds entitlements server-side).
  async function saveVertical(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "branding", verticalKey: vertical }),
      });
      // Non-200 is non-fatal for the demo flow, but surface real failures.
      if (!r.ok && r.status !== 503) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? "Gagal menyimpan vertical");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan vertical");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Step 2 → persist per-user appearance.
  async function saveAppearance(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/branding/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: brandName.trim() || null, primaryColor: primaryHex }),
      });
      if (!r.ok && r.status !== 503) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? "Gagal menyimpan tampilan");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan tampilan");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (step === 1) {
      if (await saveVertical()) setStep(2);
    } else if (step === 2) {
      if (await saveAppearance()) setStep(3);
    }
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: true }),
      });
    } catch {
      /* fail-soft: still proceed to the dashboard */
    } finally {
      try {
        sessionStorage.removeItem("maira:onboarding-vertical");
      } catch {
        /* ignore */
      }
      router.replace("/dashboard");
    }
  }

  if (sessionStatus !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const brandInitial = (brandName.trim()[0] ?? "W").toUpperCase();

  return (
    <div className="relative min-h-screen bg-background">
      <div
        className="pointer-events-none absolute -left-24 -top-10 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(closest-side, hsl(var(--primary)/0.18), transparent)" }}
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-3xl px-4 py-9 sm:px-6 sm:py-12">
        {/* header */}
        <header className="mb-7 text-center">
          <div
            className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-primary-foreground shadow-sm"
            style={{ background: "linear-gradient(135deg,hsl(var(--primary)),hsl(12 92% 60%))" }}
          >
            {brandInitial}
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
            Selamat datang — atur workspace kamu
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            3 langkah cepat sebelum mulai. Semua bisa diubah lagi nanti di Pengaturan.
          </p>
        </header>

        {/* stepper */}
        <div className="mb-7 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex flex-1 items-center last:flex-none">
              <div className="flex shrink-0 items-center gap-2.5">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                    s.n <= step
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {s.n < step ? <Check className="h-4 w-4" strokeWidth={3} /> : s.n}
                </div>
                <div className="hidden text-left sm:block">
                  <div
                    className={cn(
                      "text-[13px] font-semibold leading-tight",
                      s.n <= step ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </div>
                  <div className="text-[11px] leading-tight text-muted-foreground">
                    {s.n < step ? "Selesai" : s.n === step ? "Langkah aktif" : "Berikutnya"}
                  </div>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className="mx-2.5 h-[3px] flex-1 overflow-hidden rounded-full bg-border sm:mx-4">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: s.n < step ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ===================== STEP 1 ===================== */}
        {step === 1 && (
          <section>
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-7">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span
                  className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold tracking-wide"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  STEP 1
                </span>
                <h2 className="text-lg font-bold">Pilih usage / vertical</h2>
              </div>
              <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
                Pilihan ini menentukan <span className="font-semibold text-foreground">modul &amp; entitlement</span>{" "}
                yang aktif untuk tenant kamu (grain = tenant — berlaku untuk seluruh tim).
              </p>

              {catalogError && (
                <p className="mb-4 rounded-md border border-highlight/40 bg-highlight/10 px-3 py-2 text-[11px] text-foreground">
                  Katalog vertical tidak dapat dimuat dari server — memakai daftar bawaan.
                </p>
              )}

              {verticals === null ? (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-muted/50" />
                  ))}
                </div>
              ) : verticals.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Belum ada vertical tersedia. Hubungi superadmin.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3" role="radiogroup">
                  {verticals.map((v) => {
                    const active = vertical === v.key;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setVertical(v.key)}
                        className={cn(
                          "rounded-lg border bg-card p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-ring/50",
                          active
                            ? "border-primary bg-accent shadow-[0_0_0_1px_hsl(var(--primary)),0_12px_28px_-10px_hsl(var(--primary)/0.4)]"
                            : "border-border hover:-translate-y-0.5",
                        )}
                      >
                        <div className="mb-3 flex items-start justify-between">
                          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                            <Users className="h-5 w-5" />
                          </span>
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border-2",
                              active ? "border-primary bg-primary" : "border-border",
                            )}
                          >
                            <Check
                              className={cn("h-3 w-3 text-white", active ? "opacity-100" : "opacity-0")}
                              strokeWidth={3}
                            />
                          </span>
                        </div>
                        <div className="mb-1 text-[15px] font-bold capitalize">{v.name}</div>
                        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                          {v.description ?? "—"}
                        </p>
                        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Modul aktif
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(v.defaultModules.length > 0 ? v.defaultModules : ["pilih sendiri…"])
                            .slice(0, 4)
                            .map((m) => (
                              <span
                                key={m}
                                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                              >
                                {m}
                              </span>
                            ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedVertical && (
                <div className="mt-5 flex gap-2.5 rounded-lg border border-border bg-accent/40 p-3.5 text-[12px] leading-relaxed text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Ringkasan: vertical <b className="capitalize">{selectedVertical.name}</b> —{" "}
                    {selectedVertical.defaultModules.length > 0
                      ? `mengaktifkan ${selectedVertical.defaultModules.join(", ")}.`
                      : "pilih modul manual setelah ini."}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Langkah 1 dari 3</span>
              <button
                type="button"
                onClick={next}
                disabled={saving || !selectedVertical}
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Lanjut <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </section>
        )}

        {/* ===================== STEP 2 ===================== */}
        {step === 2 && (
          <section>
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-7">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span
                  className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold tracking-wide"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  STEP 2
                </span>
                <h2 className="text-lg font-bold">Tampilan personal</h2>
              </div>
              <p className="mb-2 text-[13px] leading-relaxed text-muted-foreground">
                Atur identitas brand yang kamu lihat di app — nama &amp; warna aksen. Di-apply real-time ke
                sidebar, tombol &amp; aksen.
              </p>
              <div
                className="mb-5 flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-[12px] text-foreground"
                style={{ borderColor: "hsl(var(--tertiary)/0.45)", background: "hsl(var(--tertiary)/0.06)" }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "hsl(var(--tertiary))" }} />
                Pengaturan ini <b className="mx-1">berlaku untuk akun kamu</b> (grain user). Versi lengkap ada di{" "}
                <span className="rounded border border-border bg-card px-1 py-0.5 font-mono">/settings</span>.
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* form */}
                <div className="space-y-4">
                  <div>
                    <label htmlFor="brandName" className="mb-1.5 block text-[13px] font-medium">
                      Nama Brand
                    </label>
                    <input
                      id="brandName"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="mis. Maira Sales"
                      className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium">Warna Utama</label>
                    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Warna utama">
                      {SWATCHES.map((s) => {
                        const active = primaryHex.toLowerCase() === s.hex.toLowerCase();
                        return (
                          <button
                            key={s.hex}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            title={s.label}
                            onClick={() => applyPrimary(s.hex)}
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full border border-border transition hover:scale-105",
                              active && "ring-2 ring-foreground/55 ring-offset-2 ring-offset-card",
                            )}
                            style={{ background: s.hex }}
                          >
                            <Check
                              className={cn("h-4 w-4 text-white", active ? "opacity-100" : "opacity-0")}
                              strokeWidth={3}
                            />
                          </button>
                        );
                      })}
                      <span className="mx-0.5 h-7 w-px bg-border" />
                      <label
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-input transition hover:border-primary"
                        title="Warna kustom"
                      >
                        <input
                          type="color"
                          value={primaryHex}
                          onChange={(e) => applyPrimary(e.target.value)}
                          className="sr-only"
                        />
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </label>
                    </div>
                    <div className="mt-2 inline-flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-2.5 font-mono text-[12px] text-muted-foreground">
                      <span
                        className="h-3.5 w-3.5 rounded-sm border border-border"
                        style={{ background: primaryHex }}
                      />
                      {primaryHex.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* live preview */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium">Live Preview</label>
                  <div className="rounded-lg border border-border bg-accent/30 p-3">
                    <div className="flex h-52 overflow-hidden rounded-md border border-border bg-card shadow-sm">
                      <div className="flex w-20 flex-col gap-2 p-2.5" style={{ background: "hsl(var(--primary)/0.08)" }}>
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-primary-foreground"
                          style={{ background: "hsl(var(--primary))" }}
                        >
                          {brandInitial}
                        </span>
                        <div
                          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[8px] font-medium text-primary-foreground"
                          style={{ background: "hsl(var(--primary))" }}
                        >
                          <span className="h-2.5 w-2.5 rounded-sm bg-white/80" />
                          Menu
                        </div>
                        <div className="h-5 rounded-md bg-muted" />
                        <div className="h-5 rounded-md bg-muted" />
                      </div>
                      <div className="flex flex-1 flex-col gap-2.5 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-bold">{brandName.trim() || "Workspace"}</span>
                          <span className="h-6 w-6 rounded-full" style={{ background: "hsl(var(--primary)/0.2)" }} />
                        </div>
                        <div className="flex h-14 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5">
                          <span className="h-8 w-8 rounded-md" style={{ background: "hsl(var(--primary)/0.15)" }} />
                          <span className="flex-1 space-y-1.5">
                            <span className="block h-2 w-3/4 rounded bg-muted" />
                            <span className="block h-2 w-1/2 rounded bg-muted" />
                          </span>
                        </div>
                        <div className="mt-auto flex gap-2">
                          <button
                            className="h-8 rounded-md px-3 text-[11px] font-semibold text-primary-foreground"
                            style={{ background: "hsl(var(--primary))" }}
                          >
                            Tombol utama
                          </button>
                          <button className="h-8 rounded-md border border-border bg-card px-3 text-[11px] font-medium">
                            Batal
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-center text-[11px] text-muted-foreground">
                      Preview update real-time saat warna / nama diubah.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-card px-5 text-sm font-semibold transition hover:bg-muted/60"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali
              </button>
              <div className="flex items-center gap-3">
                <span className="hidden text-[12px] font-medium text-muted-foreground sm:inline">Langkah 2 dari 3</span>
                <button
                  type="button"
                  onClick={next}
                  disabled={saving}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Lanjut <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===================== STEP 3 ===================== */}
        {step === 3 && (
          <section>
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-7">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span
                  className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold tracking-wide"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  STEP 3
                </span>
                <h2 className="text-lg font-bold">Undang anggota tim (seat)</h2>
              </div>
              <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
                Undang sales rep ke workspace. Jumlah seat dibatasi kuota tenant (dari aktivasi superadmin).
                Bisa di-skip &amp; undang nanti.
              </p>

              <label className="mb-1.5 block text-[13px] font-medium">Daftar Email Undangan</label>
              <div className="space-y-2">
                {invites.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) =>
                        setInvites((rows) => rows.map((r, j) => (j === i ? { ...r, email: e.target.value } : r)))
                      }
                      placeholder="email anggota…"
                      className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                    <select
                      value={row.role}
                      onChange={(e) =>
                        setInvites((rows) => rows.map((r, j) => (j === i ? { ...r, role: e.target.value } : r)))
                      }
                      className="h-11 w-32 shrink-0 rounded-md border border-input bg-card px-3 text-[13px] transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50"
                    >
                      <option>Sales Rep</option>
                      <option>Manager</option>
                      <option>Admin</option>
                      <option>Viewer</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setInvites((rows) =>
                          rows.length <= 1
                            ? [{ email: "", role: "Sales Rep" }]
                            : rows.filter((_, j) => j !== i),
                        )
                      }
                      aria-label="Hapus baris"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setInvites((rows) => [...rows, { email: "", role: "Sales Rep" }])}
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition hover:opacity-80"
              >
                <Plus className="h-4 w-4" />
                Tambah email
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-card px-5 text-sm font-semibold transition hover:bg-muted/60"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={finish}
                  disabled={finishing}
                  className="text-[12px] font-medium text-muted-foreground underline decoration-border transition hover:decoration-primary disabled:opacity-60"
                >
                  Lewati untuk sekarang
                </button>
                <span className="hidden text-[12px] font-medium text-muted-foreground sm:inline">Langkah 3 dari 3</span>
                <button
                  type="button"
                  onClick={finish}
                  disabled={finishing}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition disabled:opacity-60"
                >
                  {finishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Menyiapkan…
                    </>
                  ) : (
                    <>
                      Selesai
                      <Check className="h-4 w-4" strokeWidth={2.4} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        <p className="mt-7 text-center text-[11px] text-muted-foreground">
          Flow: <Link href="/login" className="underline decoration-border hover:decoration-primary">login</Link>{" "}
          (tenant aktif) → onboarding (3 langkah) →{" "}
          <Link href="/dashboard" className="underline decoration-border hover:decoration-primary">dashboard</Link>.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Eye,
  EyeOff,
  Grid3x3,
  Loader2,
  Radar,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// REAL Module-1 register — faithful to mockups/register.html (Coral Sunset):
// nama workspace + nama admin + email + password (strength meter + show/hide) +
// usage/vertical chips → POST /api/auth/register (creates tenant 'pending' + owner
// user with a HASHED password + owner membership). The vertical is a UX hint kept
// in sessionStorage so the onboarding wizard can pre-select it (the register API
// intentionally only takes company/name/email/password; vertical drives
// entitlements later at onboarding).

interface Vertical {
  key: string;
  label: string;
  desc: string;
  icon: typeof BarChart3;
  tint: string; // hsl var ref for the icon bg/fg
}

const VERTICALS: Vertical[] = [
  { key: "sales", label: "Sales", desc: "CRM & pipeline", icon: BarChart3, tint: "primary" },
  { key: "hr", label: "HR", desc: "Rekrutmen", icon: Users, tint: "tertiary" },
  { key: "other", label: "Lainnya", desc: "Kustom", icon: Grid3x3, tint: "muted" },
];

const STRENGTH_WORDS = ["—", "Lemah", "Cukup", "Bagus", "Kuat"];
const STRENGTH_COLORS = [
  "hsl(var(--secondary))",
  "hsl(var(--destructive))",
  "hsl(var(--highlight))",
  "hsl(var(--tertiary))",
  "hsl(142 70% 45%)",
];

function scorePassword(v: string): number {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 6) s++;
  if (v.length >= 10) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
  return s;
}

export default function RegisterPage() {
  const [form, setForm] = useState({ company: "", name: "", email: "", password: "" });
  const [vertical, setVertical] = useState("sales");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  }

  const strength = useMemo(() => scorePassword(form.password), [form.password]);

  const fieldErr = {
    company: touched.company && !form.company.trim() ? "Nama workspace wajib diisi." : null,
    name: touched.name && !form.name.trim() ? "Nama admin wajib diisi." : null,
    email:
      touched.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)
        ? "Format email tidak valid."
        : null,
    password:
      touched.password && form.password.length < 6 ? "Kata sandi minimal 6 karakter." : null,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ company: true, name: true, email: true, password: true });
    setError(null);

    if (
      !form.company.trim() ||
      !form.name.trim() ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ||
      form.password.length < 6
    ) {
      setError("Periksa kembali isian yang ditandai.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "Gagal mendaftar");
      // Carry the chosen vertical into onboarding (UX hint; entitlements resolve later).
      try {
        sessionStorage.setItem("maira:onboarding-vertical", vertical);
      } catch {
        /* sessionStorage may be unavailable — non-fatal */
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mendaftar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* soft hero orbs */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(closest-side, hsl(var(--primary)/0.18), transparent)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full opacity-70"
        style={{ background: "radial-gradient(closest-side, hsl(var(--primary)/0.18), transparent)" }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        {/* Brand lockup */}
        <div className="mb-6 flex flex-col items-center">
          <span
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg text-primary-foreground shadow-sm"
            style={{ background: "linear-gradient(135deg,hsl(var(--primary)),hsl(12 92% 60%))" }}
          >
            <Radar className="h-[22px] w-[22px]" />
          </span>
          <div className="text-[17px] font-semibold tracking-tight">
            Maira<span className="text-muted-foreground"> Sales</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Workspace AI penjualan untuk tim kamu
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-7">
          {done ? (
            <div className="space-y-3 py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-emerald-600">
                <Check className="h-7 w-7" />
              </span>
              <h2 className="text-lg font-semibold">Akun dibuat 🎉</h2>
              <p className="text-sm text-muted-foreground">
                Akun{" "}
                <b className="text-foreground">{form.email}</b> berstatus{" "}
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[11px] font-medium"
                  style={{ background: "hsl(var(--highlight)/0.16)", color: "hsl(38 92% 30%)" }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "hsl(var(--highlight))" }}
                  />
                  menunggu aktivasi
                </span>
                . Superadmin akan mengaktifkannya. Setelah aktif, kamu bisa masuk.
              </p>
              <div className="grid gap-2 pt-1">
                <Link
                  href="/pending"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
                >
                  Lihat status pending
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-card text-sm font-semibold transition hover:bg-secondary"
                >
                  Ke halaman masuk
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Daftar workspace</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Buat akun workspace baru. Aktivasi oleh superadmin.
              </p>

              <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
                <Field
                  id="company"
                  label="Nama workspace / perusahaan"
                  placeholder="PT Contoh Jaya"
                  value={form.company}
                  onChange={(v) => set("company", v)}
                  onBlur={() => setTouched((t) => ({ ...t, company: true }))}
                  error={fieldErr.company}
                  autoComplete="organization"
                />
                <Field
                  id="name"
                  label="Nama admin"
                  placeholder="Budi Santoso"
                  value={form.name}
                  onChange={(v) => set("name", v)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  error={fieldErr.name}
                  autoComplete="name"
                />
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  placeholder="budi@contoh.co.id"
                  value={form.email}
                  onChange={(v) => set("email", v)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  error={fieldErr.email}
                  autoComplete="email"
                />

                {/* Password + strength meter + show/hide */}
                <div className="grid gap-1.5">
                  <label htmlFor="password" className="text-[13px] font-medium">
                    Kata sandi <span className="text-muted-foreground">(min 6)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className={cn(
                        "h-11 w-full rounded-md border bg-card px-3.5 pr-11 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary",
                        fieldErr.password ? "border-destructive" : "border-input",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                      className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary"
                    >
                      {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-4 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 rounded-full transition-colors"
                          style={{
                            background:
                              i < strength ? STRENGTH_COLORS[strength] : "hsl(var(--secondary))",
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className="w-16 text-right text-[11px]"
                      style={{
                        color: strength ? STRENGTH_COLORS[strength] : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {STRENGTH_WORDS[strength]}
                    </span>
                  </div>
                  {fieldErr.password && (
                    <p className="text-[11px] text-destructive">{fieldErr.password}</p>
                  )}
                </div>

                {/* Usage / vertical chips */}
                <div className="grid gap-1.5">
                  <label className="text-[13px] font-medium">Pilih usage / vertical</label>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Usage / vertical">
                    {VERTICALS.map((v) => {
                      const active = vertical === v.key;
                      const Icon = v.icon;
                      return (
                        <button
                          key={v.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setVertical(v.key)}
                          className={cn(
                            "relative rounded-md border bg-card p-3 text-center transition",
                            active
                              ? "border-primary bg-accent shadow-[0_0_0_3px_hsl(var(--primary)/0.16)]"
                              : "border-input hover:-translate-y-0.5",
                          )}
                        >
                          {active && (
                            <span className="absolute right-1.5 top-1.5 text-primary">
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                          )}
                          <span
                            className="mx-auto mb-1.5 grid h-8 w-8 place-items-center rounded-md"
                            style={{
                              background: v.tint === "muted" ? "hsl(var(--secondary))" : "hsl(var(--accent))",
                              color:
                                v.tint === "muted"
                                  ? "hsl(var(--muted-foreground))"
                                  : `hsl(var(--${v.tint}))`,
                            }}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="block text-[13px] font-medium">{v.label}</span>
                          <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                            {v.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Menentukan modul &amp; entitlement aktif setelah aktivasi.
                  </p>
                </div>

                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mendaftarkan…
                    </>
                  ) : (
                    <>
                      Daftar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                {/* Pending note */}
                <div
                  className="flex items-start gap-2.5 rounded-md border border-highlight/40 px-3 py-2.5"
                  style={{ background: "hsl(var(--highlight)/0.10)" }}
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "hsl(var(--highlight))" }} />
                  <p className="text-[11px] leading-relaxed text-foreground">
                    <b>Akun menunggu aktivasi.</b> Setelah daftar, akun berstatus{" "}
                    <i>pending</i> sampai superadmin mengaktifkan. Kamu akan diberi tahu lewat email
                    saat aktif.
                  </p>
                </div>
              </form>
            </>
          )}
        </div>

        {!done && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Masuk
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: string;
  error?: string | null;
  autoComplete?: string;
}

function Field({ id, label, value, onChange, onBlur, placeholder, type, error, autoComplete }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn(
          "h-11 w-full rounded-md border bg-card px-3.5 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary",
          error ? "border-destructive" : "border-input",
        )}
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

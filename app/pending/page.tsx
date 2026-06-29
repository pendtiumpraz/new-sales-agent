"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Check, Hourglass, LogOut, Mail, Radar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// REAL Module-1 pending — faithful to mockups/pending.html (Coral Sunset, amber-led
// "waiting" page). Polls GET /api/tenant/status (the activation gate, doc 38):
//   still pending/suspended/expired → stay, show the status
//   active                          → redirect to /onboarding (vertical → branding)
// Pre-auth shell: brand-neutral product mark (per-tenant white-label only applies
// AFTER the superadmin activates), no sidebar.

interface Status {
  active?: boolean;
  status?: string;
  activeUntil?: string | null;
  reason?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Aktivasi",
  suspended: "Ditangguhkan",
  expired: "Masa Aktif Berakhir",
};

const STATUS_COPY: Record<string, string> = {
  pending:
    "Pendaftaran Anda berhasil. Akun (tenant) Anda berstatus pending dan baru bisa digunakan setelah superadmin mengaktifkan — menetapkan masa aktif & kuota.",
  suspended: "Akun Anda saat ini ditangguhkan. Hubungi superadmin untuk informasi lebih lanjut.",
  expired: "Masa aktif akun Anda telah berakhir. Hubungi superadmin untuk perpanjangan.",
};

export default function PendingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [info, setInfo] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [activated, setActivated] = useState(false);
  const redirectedRef = useRef(false);

  async function check() {
    setChecking(true);
    try {
      const r = await fetch("/api/tenant/status");
      const j = (await r.json()) as Status;
      setInfo(j);
      if (j.active && !redirectedRef.current) {
        redirectedRef.current = true;
        setActivated(true);
        // Brief "aktif" moment → onboarding (the next step in the real flow).
        setTimeout(() => router.replace("/onboarding"), 1100);
      }
    } catch {
      /* fail-soft: keep showing the pending card */
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (sessionStatus === "authenticated") void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  const reason = info?.reason && info.reason !== "ok" && info.reason !== "error" ? info.reason : "pending";
  const label = activated ? "Aktif" : STATUS_LABEL[reason] ?? STATUS_LABEL.pending;
  const email = session?.user?.email ?? "—";
  const brand = session?.user?.name ?? "Workspace Anda";

  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="h-72 w-full max-w-md animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* amber-led mesh backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute h-[560px] w-[560px] rounded-full blur-3xl"
          style={{
            top: "-12%",
            left: "-8%",
            background: "radial-gradient(circle at center,hsl(38 92% 50% / 0.16) 0%,transparent 65%)",
          }}
        />
        <div
          className="absolute h-[520px] w-[520px] rounded-full blur-3xl"
          style={{
            top: "40%",
            left: "55%",
            background: "radial-gradient(circle at center,hsl(173 80% 40% / 0.13) 0%,transparent 65%)",
          }}
        />
      </div>

      {/* brand-neutral product mark */}
      <Link href="/" aria-label="Beranda" className="mb-7 inline-flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Radar className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Maira<span className="text-muted-foreground"> Sales</span>
        </span>
      </Link>

      <div className="w-full max-w-md">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-7 text-center">
            {/* status icon */}
            <span
              className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: activated ? "hsl(var(--tertiary)/0.15)" : "hsl(var(--highlight)/0.15)",
                color: activated ? "hsl(var(--tertiary))" : "hsl(var(--highlight))",
              }}
            >
              {!activated && (
                <span
                  className="absolute -inset-1.5 animate-ping rounded-full"
                  style={{ background: "hsl(38 92% 50% / 0.18)" }}
                  aria-hidden="true"
                />
              )}
              {activated ? (
                <Check className="relative h-7 w-7" strokeWidth={2.5} />
              ) : (
                <Hourglass className="relative h-7 w-7" />
              )}
            </span>

            {/* status badge */}
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
              )}
              style={{
                borderColor: activated ? "hsl(var(--tertiary)/0.3)" : "hsl(var(--highlight)/0.3)",
                background: activated ? "hsl(var(--tertiary)/0.1)" : "hsl(var(--highlight)/0.1)",
                color: activated ? "hsl(173 60% 30%)" : "hsl(38 92% 38%)",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: activated ? "hsl(var(--tertiary))" : "hsl(var(--highlight))" }}
              />
              {label}
            </div>

            <h1 className="mt-4 text-xl font-semibold tracking-tight">
              {activated ? "Akun Anda aktif" : "Akun Anda sedang ditinjau"}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {activated
                ? "Mengalihkan ke onboarding — pilih vertical & tampilan."
                : STATUS_COPY[reason] ?? STATUS_COPY.pending}
            </p>

            {/* account summary */}
            <dl className="mt-5 space-y-2 rounded-md border border-border bg-muted/40 p-3.5 text-left text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Akun</dt>
                <dd className="truncate font-medium text-foreground">{brand}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Email pendaftar</dt>
                <dd className="truncate font-medium text-foreground">{email}</dd>
              </div>
              {info?.activeUntil && (
                <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                  <dt className="text-muted-foreground">Masa aktif s/d</dt>
                  <dd className="font-medium text-foreground">
                    {new Date(info.activeUntil).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd
                  className="inline-flex items-center gap-1.5 font-medium"
                  style={{ color: activated ? "hsl(173 60% 30%)" : "hsl(38 92% 38%)" }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: activated ? "hsl(var(--tertiary))" : "hsl(var(--highlight))" }}
                  />
                  {label}
                </dd>
              </div>
            </dl>

            {/* primary action: cek status */}
            <button
              type="button"
              onClick={check}
              disabled={checking || activated}
              className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-80"
            >
              {activated ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  Aktif — mengalihkan…
                </>
              ) : checking ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Memeriksa…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Cek status
                </>
              )}
            </button>

            {!activated && info && !info.active && (
              <div
                className="mt-3 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs"
                style={{
                  borderColor: "hsl(var(--highlight)/0.3)",
                  background: "hsl(var(--highlight)/0.1)",
                  color: "hsl(38 92% 36%)",
                }}
                role="status"
              >
                Masih <span className="font-medium">{label}</span>. Coba lagi nanti — kami akan email
                begitu aktif.
              </div>
            )}

            {/* help */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Butuh bantuan?</p>
              <a
                href="mailto:support@maira.id"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground transition-colors hover:text-primary"
              >
                <Mail className="h-3.5 w-3.5" />
                support@maira.id
              </a>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Bukan akun Anda?{" "}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar
          </button>
        </p>
      </div>
    </div>
  );
}

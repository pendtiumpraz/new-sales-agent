"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Loader2, Radar } from "lucide-react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary at the page level (Next 14
  // static-prerender constraint). The inner component reads ?next=.
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Resolve the post-login destination — defaults to /dashboard, but honors
  // ?next=<encoded-path> so middleware-style redirects survive.
  const nextHref = (() => {
    const raw = searchParams.get("next");
    if (!raw) return "/dashboard";
    try {
      const decoded = decodeURIComponent(raw);
      // Only allow same-origin internal paths.
      return decoded.startsWith("/") ? decoded : "/dashboard";
    } catch {
      return "/dashboard";
    }
  })();

  // If already authenticated, bounce straight to the destination — prevents
  // showing the login screen to a logged-in user who navigates here.
  useEffect(() => {
    if (sessionStatus === "authenticated") {
      router.replace(nextHref);
    }
  }, [sessionStatus, nextHref, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Email atau kata sandi salah.");
        setLoading(false);
        return;
      }

      // Session cookie is set; AuthSync mirrors it into the store.
      toast.success("Berhasil masuk");
      // Brief checkmark moment, then fade-out the page before route change.
      setSuccess(true);
      const fadeMs = reduceMotion ? 0 : 320;
      const checkMs = reduceMotion ? 0 : 420;
      setTimeout(() => {
        setLeaving(true);
        setTimeout(() => router.push(nextHref), fadeMs);
      }, checkMs);
    } catch (err) {
      console.error("[login]", err);
      setError("Tidak dapat terhubung ke server. Coba lagi.");
      setLoading(false);
    }
  }

  // Word-by-word stagger for the heading.
  const headingWords = useMemo(
    () => "Masuk ke akun Anda".split(" "),
    [],
  );

  // Pre-computed particle config so positions/delays stay stable across renders.
  const particles = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => ({
        left: `${[12, 28, 44, 62, 78, 90][i]}%`,
        size: [3, 4, 3, 4, 3, 4][i],
        delay: i * 4.2,
        duration: 22 + (i % 3) * 4,
      })),
    [],
  );

  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 transition-opacity duration-300",
        leaving ? "opacity-0" : "opacity-100",
      )}
    >
      {/* Layered animated mesh gradient — soft coral + teal blobs drifting. */}
      <MeshBackdrop reduce={!!reduceMotion} />

      {/* Optional subtle particle layer. */}
      {!reduceMotion && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {particles.map((p, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-primary/40"
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                filter: "blur(0.5px)",
              }}
              initial={{ y: "100vh", opacity: 0 }}
              animate={{ y: "-10vh", opacity: [0, 0.6, 0.6, 0] }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}

      {/* Brand logo with mount entrance + one-time scan sweep on the Radar mark. */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        whileHover={reduceMotion ? undefined : { scale: 1.04 }}
        className="mb-8"
      >
        <Link href="/" aria-label="Beranda" className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Radar
              className={cn(
                "h-[18px] w-[18px]",
                !reduceMotion && "login-scan-once",
              )}
            />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Agentic<span className="text-muted-foreground"> Sales</span>
          </span>
        </Link>
      </motion.div>

      {/* Login card — spring rise + shadow growth as it settles. */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 22, delay: 0.2 }}
        className="w-full max-w-sm"
      >
        <Card className="login-card-shadow w-full">
          <CardContent className="p-6">
            <h1
              className="text-xl font-semibold tracking-tight"
              aria-label="Masuk ke akun Anda"
            >
              {reduceMotion ? (
                "Masuk ke akun Anda"
              ) : (
                <span aria-hidden="true">
                  {headingWords.map((word, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.32,
                        delay: 0.45 + i * 0.07,
                        ease: "easeOut",
                      }}
                      className="inline-block"
                    >
                      {word}
                      {i < headingWords.length - 1 ? " " : ""}
                    </motion.span>
                  ))}
                </span>
              )}
            </h1>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.75 }}
              className="mt-1 text-sm text-muted-foreground"
            >
              Gunakan email dan kata sandi terdaftar.
            </motion.p>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="email"
                  className={cn(
                    "transition-colors duration-200",
                    emailFocused && "text-primary",
                  )}
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="nama@perusahaan.co.id"
                  autoComplete="email"
                  required
                  className="login-input"
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className={cn(
                      "transition-colors duration-200",
                      passwordFocused && "text-primary",
                    )}
                  >
                    Kata sandi
                  </Label>
                  <a href="#" className="text-xs text-primary hover:underline">
                    Lupa sandi?
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  autoComplete="current-password"
                  required
                  className="login-input"
                />
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    key="login-error"
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -8, x: 0 }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, y: 0, x: [0, -4, 4, -4, 4, 0] }
                    }
                    exit={{ opacity: 0, y: -6 }}
                    transition={
                      reduceMotion
                        ? { duration: 0.15 }
                        : {
                            y: {
                              type: "spring",
                              stiffness: 360,
                              damping: 26,
                            },
                            x: { duration: 0.42, ease: "easeInOut" },
                            opacity: { duration: 0.2 },
                          }
                    }
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                type="submit"
                disabled={loading || success}
                whileHover={
                  reduceMotion || loading || success
                    ? undefined
                    : { scale: 1.02 }
                }
                whileTap={
                  reduceMotion || loading || success
                    ? undefined
                    : { scale: 0.98 }
                }
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={cn(
                  "relative mt-2 inline-flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-shadow duration-200 hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-80",
                )}
              >
                {/* Cross-fade between idle / loading / success states. */}
                <AnimatePresence mode="wait" initial={false}>
                  {success ? (
                    <motion.span
                      key="success"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ type: "spring", stiffness: 420, damping: 18 }}
                      className="inline-flex items-center gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Berhasil
                    </motion.span>
                  ) : loading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="inline-flex items-center gap-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memuat...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="inline-flex items-center gap-2"
                    >
                      Masuk
                      <ArrowRight className="h-4 w-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="mt-6 text-sm text-muted-foreground"
      >
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="group inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
        >
          Daftar
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </motion.p>

      {/* Local CSS — Radar scan, input focus ring expand, and card shadow growth. */}
      <style jsx>{`
        @keyframes login-scan {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        :global(.login-scan-once) {
          animation: login-scan 1.2s ease-out 1;
          transform-origin: 50% 50%;
        }
        :global(.login-card-shadow) {
          box-shadow: 0 1px 2px 0 hsl(11 96% 61% / 0.05);
          animation: login-card-shadow-grow 0.9s ease-out 0.2s both;
        }
        @keyframes login-card-shadow-grow {
          0% {
            box-shadow: 0 1px 2px 0 hsl(11 96% 61% / 0.04);
          }
          100% {
            box-shadow:
              0 18px 40px -18px hsl(11 96% 61% / 0.22),
              0 4px 12px -4px hsl(173 80% 40% / 0.08);
          }
        }
        :global(.login-input) {
          transition:
            border-color 0.2s ease,
            box-shadow 0.25s ease;
        }
        :global(.login-input:focus-visible) {
          border-color: hsl(var(--primary));
          box-shadow:
            0 0 0 3px hsl(var(--primary) / 0.18),
            0 1px 2px 0 hsl(var(--primary) / 0.08);
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated mesh gradient backdrop                                     */
/* ------------------------------------------------------------------ */

function MeshBackdrop({ reduce }: { reduce: boolean }) {
  // Four soft blobs — coral primary, teal accent, warm coral mid, faint amber.
  // Each drifts slowly with different offsets so the page feels alive.
  const blobs: Array<{
    className: string;
    gradient: string;
    initial: { top: string; left: string };
    x: number[];
    y: number[];
    scale: number[];
    duration: number;
    delay: number;
  }> = [
    {
      className: "h-[600px] w-[600px]",
      gradient:
        "radial-gradient(circle at center, hsl(11 96% 61% / 0.18) 0%, transparent 65%)",
      initial: { top: "-10%", left: "-10%" },
      x: [0, 40, -20, 0],
      y: [0, 30, -10, 0],
      scale: [1, 1.08, 0.96, 1],
      duration: 16,
      delay: 0,
    },
    {
      className: "h-[640px] w-[640px]",
      gradient:
        "radial-gradient(circle at center, hsl(173 80% 40% / 0.15) 0%, transparent 65%)",
      initial: { top: "30%", left: "55%" },
      x: [0, -50, 30, 0],
      y: [0, 20, 40, 0],
      scale: [1, 0.95, 1.05, 1],
      duration: 18,
      delay: 1.5,
    },
    {
      className: "h-[560px] w-[560px]",
      gradient:
        "radial-gradient(circle at center, hsl(11 96% 61% / 0.14) 0%, transparent 65%)",
      initial: { top: "55%", left: "-15%" },
      x: [0, 30, 60, 0],
      y: [0, -30, 10, 0],
      scale: [1, 1.06, 1, 1],
      duration: 14,
      delay: 3,
    },
    {
      className: "h-[520px] w-[520px]",
      gradient:
        "radial-gradient(circle at center, hsl(38 92% 50% / 0.10) 0%, transparent 65%)",
      initial: { top: "-5%", left: "60%" },
      x: [0, -30, 10, 0],
      y: [0, 40, 20, 0],
      scale: [1, 1.04, 0.98, 1],
      duration: 17,
      delay: 2,
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full blur-3xl", b.className)}
          style={{
            top: b.initial.top,
            left: b.initial.left,
            background: b.gradient,
          }}
          initial={false}
          animate={
            reduce
              ? undefined
              : { x: b.x, y: b.y, scale: b.scale }
          }
          transition={
            reduce
              ? undefined
              : {
                  duration: b.duration,
                  delay: b.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      ))}
    </div>
  );
}

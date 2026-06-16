"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  MessageCircle,
  Play,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCadences } from "@/lib/api-mock/hooks";
import type { Cadence, CadenceStepChannel } from "@/lib/types";
import { channelMeta } from "@/lib/utils/channel-config";
import { cn } from "@/lib/utils";

const STATUS: Record<
  Cadence["status"],
  { label: string; variant: "success" | "muted" | "warning" }
> = {
  active: { label: "Aktif", variant: "success" },
  draft: { label: "Draf", variant: "muted" },
  paused: { label: "Jeda", variant: "warning" },
};

// Primary channel → border tint (hex with alpha) for each card.
// Picks the first channel in the mix; "multi" coral fallback when 3+.
function primaryAccent(mix: CadenceStepChannel[]): {
  hex: string;
  // tw classes for ring/border softening; keep alpha low so it stays neat
  borderClass: string;
  haloClass: string;
} {
  if (mix.length >= 3) {
    return {
      hex: "#FB5E3B",
      borderClass: "border-primary/25",
      haloClass: "from-primary/5 to-tertiary/5",
    };
  }
  const first = mix[0];
  const color = first ? channelMeta(first).color : "#FB5E3B";
  return {
    hex: color,
    borderClass: "border-[color:var(--cad-border)]/40",
    haloClass: "from-[color:var(--cad-halo)]/8 to-transparent",
  };
}

// Filter chip definitions — channel + status, with color hints
const CHANNEL_CHIPS: { key: "all" | CadenceStepChannel; label: string }[] = [
  { key: "all", label: "Semua channel" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
];

const STATUS_CHIPS: {
  key: "all" | Cadence["status"];
  label: string;
  dot: string;
}[] = [
  { key: "all", label: "Semua status", dot: "bg-muted-foreground/40" },
  { key: "active", label: "Aktif", dot: "bg-emerald-500" },
  { key: "draft", label: "Draf", dot: "bg-muted-foreground/40" },
  { key: "paused", label: "Jeda", dot: "bg-amber-500" },
];

export default function CadencesPage() {
  const { data: cadences, isLoading } = useCadences();
  const reduce = useReducedMotion();
  const [channelFilter, setChannelFilter] = useState<
    (typeof CHANNEL_CHIPS)[number]["key"]
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    (typeof STATUS_CHIPS)[number]["key"]
  >("all");

  // Workspace scope (doc 44): ?workspace=<id> filters cadences to that workspace.
  const workspaceId = useSearchParams().get("workspace");
  const [wsAll, setWsAll] = useState(false);
  const visible = useMemo(() => {
    const list = cadences ?? [];
    return list.filter((c) => {
      const channelOk =
        channelFilter === "all" ||
        c.channelMix.includes(channelFilter as CadenceStepChannel);
      const statusOk = statusFilter === "all" || c.status === statusFilter;
      const wsOk = !workspaceId || wsAll || (c as { workspaceId?: string | null }).workspaceId === workspaceId;
      return channelOk && statusOk && wsOk;
    });
  }, [cadences, channelFilter, statusFilter, workspaceId, wsAll]);

  const summary = useMemo(() => {
    const list = cadences ?? [];
    const active = list.filter((c) => c.status === "active");
    const enrolled = list.reduce((s, c) => s + c.enrolled, 0);
    const replyRates = list.filter((c) => c.replyRate > 0).map((c) => c.replyRate);
    const avgReply =
      replyRates.length > 0
        ? Math.round(
            replyRates.reduce((s, r) => s + r, 0) / replyRates.length,
          )
        : 0;
    return { activeCount: active.length, enrolled, avgReply };
  }, [cadences]);

  return (
    <div>
      <PageHeader title="Cadence" description="Rangkaian pesan lintas channel — dijalankan manual via “Jalankan sekarang”.">
        <div className="flex items-center gap-2">
          <RunAutoReplyButton />
          <RunUpsellButton />
          <RunCadencesButton />
          <Button
            asChild
            className="shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)] transition-all hover:-translate-y-px hover:shadow-[0_6px_18px_-4px_rgba(251,94,59,0.7)]"
          >
            <Link href="/cadences/new">
              <Plus className="h-4 w-4" />
              Buat cadence
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-5 p-6">
        {workspaceId && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span>Difilter ke <b>workspace ini</b> — {wsAll ? "semua cadence" : "cadence workspace ini saja"}.</span>
            <button onClick={() => setWsAll((v) => !v)} className="ml-auto text-xs text-primary hover:underline">
              {wsAll ? "Workspace saja" : "Lihat semua"}
            </button>
          </div>
        )}
        {/* Hero strip — soft coral→teal radial backdrop with KPI pills */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-tertiary/5 p-5 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,94,59,0.25),transparent_70%)] blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -bottom-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.22),transparent_70%)] blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-1/3 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_70%)] blur-2xl"
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Workflow className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">
                  Otomasi outreach Anda
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  AI bantu nulis draft, kamu jalankan & tutup — cadence jalan saat “Jalankan sekarang” ditekan.
                </p>
              </div>
            </div>
            {/* KPI pills row */}
            <div className="flex flex-wrap items-center gap-2">
              <SummaryPill
                tone="coral"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Cadence aktif"
                value={summary.activeCount}
              />
              <SummaryPill
                tone="teal"
                icon={<Users className="h-3.5 w-3.5" />}
                label="Total enrolled"
                value={summary.enrolled}
              />
              <SummaryPill
                tone="amber"
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Avg reply rate"
                value={`${summary.avgReply}%`}
              />
            </div>
          </div>
        </div>

        {/* Filter chips — channel + status */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {CHANNEL_CHIPS.map((f) => {
              const active = channelFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setChannelFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)]"
                      : "bg-card text-muted-foreground hover:-translate-y-px hover:text-foreground hover:shadow-sm",
                  )}
                >
                  {f.key !== "all" && (
                    <ChannelDot channel={f.key} size={8} />
                  )}
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_CHIPS.map((f) => {
              const active = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
                    active
                      ? "border-tertiary/40 bg-tertiary/10 text-tertiary"
                      : "bg-card text-muted-foreground hover:text-foreground hover:shadow-sm",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("h-1.5 w-1.5 rounded-full", f.dot)}
                  />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cadence cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-52 w-full rounded-2xl" />
              ))
            : visible.map((c, i) => {
                const accent = primaryAccent(c.channelMix);
                const status = STATUS[c.status];
                const isMulti = c.channelMix.length >= 3;
                return (
                  <motion.div
                    key={c.id}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.32,
                      ease: "easeOut",
                      delay: reduce ? 0 : Math.min(i * 0.04, 0.32),
                    }}
                  >
                    <Link href={`/cadences/${c.id}`} className="block h-full">
                      <Card
                        className={cn(
                          "group relative h-full overflow-hidden border transition-all duration-200 ease-out",
                        )}
                        style={
                          {
                            // CSS vars feed the dynamic per-channel border tint
                            "--cad-border": accent.hex,
                            "--cad-halo": accent.hex,
                            borderColor: isMulti
                              ? undefined
                              : `${accent.hex}33`,
                          } as React.CSSProperties
                        }
                      >
                        {/* Top channel-tinted strip */}
                        <span
                          aria-hidden
                          className="absolute inset-x-0 top-0 h-1"
                          style={{
                            background: isMulti
                              ? "linear-gradient(90deg, #FB5E3B 0%, #F59E0B 50%, #14B8A6 100%)"
                              : `linear-gradient(90deg, ${accent.hex}cc, ${accent.hex}33)`,
                          }}
                        />
                        {/* Soft corner halo using the channel hex */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-90"
                          style={{
                            background: `radial-gradient(circle at center, ${accent.hex}22, transparent 70%)`,
                          }}
                        />

                        <CardContent className="relative flex h-full flex-col p-5 pt-6">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 ease-out group-hover:scale-105"
                              style={{
                                backgroundColor: `${accent.hex}1A`,
                                color: accent.hex,
                              }}
                            >
                              <Workflow className="h-5 w-5" />
                            </span>
                            <Badge variant={status.variant}>
                              {status.label}
                            </Badge>
                          </div>

                          <h3 className="mt-3 line-clamp-2 font-semibold leading-snug">
                            {c.name}
                          </h3>

                          {/* Channel mix big dots row */}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {c.channelMix.map((ch) => (
                                <ChannelDot key={ch} channel={ch} size={10} />
                              ))}
                            </div>
                            <span className="tnum text-xs font-medium text-muted-foreground">
                              · {c.steps.length} langkah
                            </span>
                          </div>

                          {/* Footer with enrolled + reply rate */}
                          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Users className="h-4 w-4" />
                              <span className="tnum font-medium text-foreground">
                                {c.enrolled}
                              </span>
                              <span className="text-xs">kontak</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle
                                className={cn(
                                  "h-3.5 w-3.5",
                                  c.replyRate >= 25
                                    ? "text-tertiary"
                                    : "text-muted-foreground",
                                )}
                              />
                              <span
                                className={cn(
                                  "tnum text-sm font-semibold",
                                  c.replyRate >= 25
                                    ? "text-tertiary"
                                    : "text-foreground",
                                )}
                              >
                                {c.replyRate}%
                              </span>
                              <span className="text-xs text-muted-foreground">
                                balas
                              </span>
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
        </div>

        {/* Empty state — coral-tinted, not grey */}
        {!isLoading && visible.length === 0 && (
          <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-card to-tertiary/5">
            <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Workflow className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  Tidak ada cadence untuk filter ini
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Coba ubah filter channel atau status, atau buat cadence baru.
                </p>
              </div>
              <Button asChild size="sm" className="mt-1">
                <Link href="/cadences/new">
                  <Plus className="h-4 w-4" />
                  Buat cadence
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

// Runs all due enrollments now (Fase 5 slice 2): personalize → dispatch email
// to the send queue / queue other channels → advance each enrollment.
function RunCadencesButton() {
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      const r = await fetch("/api/cadences/process", { method: "POST" });
      const j = await r.json();
      if (j?.source === "mock") {
        toast.info("Mode demo — sambungkan database untuk benar-benar menjalankan cadence.");
        return;
      }
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
      const s = j.summary as {
        dueEnrollments: number;
        emailQueued: number;
        waSent: number;
        otherQueued: number;
        completed: number;
        skipped: number;
        failed: number;
      };
      if (s.dueEnrollments === 0) {
        toast.info("Tidak ada langkah cadence yang jatuh tempo saat ini.");
      } else {
        toast.success(
          `Cadence dijalankan — ${s.emailQueued} email antri${s.waSent ? `, ${s.waSent} WhatsApp terkirim` : ""}, ${s.otherQueued} channel lain antri, ${s.completed} selesai${s.skipped ? `, ${s.skipped} dilewati` : ""}.`,
        );
      }
    } catch (e) {
      toast.error(`Gagal menjalankan cadence (${e instanceof Error ? e.message : e})`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      <Play className="h-4 w-4" />
      {pending ? "Menjalankan…" : "Jalankan sekarang"}
    </Button>
  );
}

// Autonomous auto-reply + escalation (doc 36): draft + judge inbound chats,
// auto-send when confident + opted in, else escalate to a human.
function RunAutoReplyButton() {
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      const r = await fetch("/api/engagement/auto-reply", { method: "POST" });
      const j = await r.json();
      if (j?.source === "mock") {
        toast.info("Mode demo — sambungkan database untuk menjalankan auto-reply.");
        return;
      }
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
      const s = j.summary as {
        candidates: number;
        sent: number;
        escalated: number;
        skipped: number;
        failed: number;
        autoSend: boolean;
      };
      if (s.candidates === 0) {
        toast.info("Tidak ada percakapan yang menunggu balasan.");
      } else {
        toast.success(
          `Auto-reply — ${s.sent} terkirim, ${s.escalated} escalate ke manusia${s.failed ? `, ${s.failed} gagal` : ""}${s.autoSend ? "" : " (auto-send OFF)"}.`,
        );
      }
    } catch (e) {
      toast.error(`Gagal auto-reply (${e instanceof Error ? e.message : e})`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      <MessageCircle className="h-4 w-4" />
      {pending ? "Memproses…" : "Auto-reply"}
    </Button>
  );
}

// Autonomous upsell + close (doc 35): offer the KB upsell product to closed-won
// customers with a Stripe checkout link, via email/WA. Idempotent per contact.
function RunUpsellButton() {
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      const r = await fetch("/api/engagement/upsell", { method: "POST" });
      const j = await r.json();
      if (j?.source === "mock") {
        toast.info("Mode demo — sambungkan database untuk menjalankan upsell.");
        return;
      }
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
      const s = j.summary as {
        candidates: number;
        sent: number;
        skipped: number;
        failed: number;
        dedup: number;
      };
      if (s.candidates === 0) {
        toast.info("Belum ada customer closed-won untuk di-upsell.");
      } else {
        toast.success(
          `Upsell jalan — ${s.sent} terkirim, ${s.dedup} sudah pernah, ${s.skipped} dilewati${s.failed ? `, ${s.failed} gagal` : ""}.`,
        );
      }
    } catch (e) {
      toast.error(`Gagal upsell (${e instanceof Error ? e.message : e})`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      <Sparkles className="h-4 w-4" />
      {pending ? "Memproses…" : "Jalankan upsell"}
    </Button>
  );
}

function SummaryPill({
  tone,
  icon,
  label,
  value,
}: {
  tone: "coral" | "teal" | "amber";
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  const toneCls =
    tone === "coral"
      ? "bg-primary/10 text-primary ring-primary/20"
      : tone === "teal"
        ? "bg-tertiary/10 text-tertiary ring-tertiary/20"
        : "bg-amber-100 text-amber-700 ring-amber-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-transform hover:-translate-y-px",
        toneCls,
      )}
    >
      {icon}
      <span className="text-muted-foreground/80">{label}</span>
      <span className="tnum font-semibold text-foreground">{value}</span>
    </span>
  );
}

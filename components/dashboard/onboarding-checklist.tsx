"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, Mail, Radar, Rocket, Sparkles, X, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS: { key: string; label: string; desc: string; href: string; icon: LucideIcon }[] = [
  { key: "mailbox", label: "Hubungkan mailbox", desc: "Kirim email dari identitasmu sendiri", href: "/settings/mailboxes", icon: Mail },
  { key: "kb", label: "Isi Basis Pengetahuan", desc: "Produk & harga, biar AI paham bisnismu", href: "/settings/knowledge-base", icon: BookOpen },
  { key: "crawl", label: "Buat workspace & isi lead", desc: "Pilih produk → market-fit → tambah lead, semua di workspace", href: "/workspaces", icon: Radar },
  { key: "aiModel", label: "Pilih model AI", desc: "Set 1 model aktif untuk workspace-mu", href: "/settings/ai", icon: Sparkles },
];

const KEY = "maira_onboarding_dismissed";

export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1",
  );
  const { data } = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/onboarding");
      if (!r.ok) return null;
      return (await r.json()) as { steps: Record<string, boolean> | null; doneCount: number; total: number; complete: boolean };
    },
  });

  const steps = data?.steps;
  // Hide when dismissed, not logged in / no data, or fully set up.
  if (dismissed || !steps || data?.complete) return null;

  const done = data?.doneCount ?? 0;
  const total = data?.total ?? STEPS.length;

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-tertiary/5">
      <button
        onClick={dismiss}
        aria-label="Sembunyikan"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Rocket className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Mulai di sini</h3>
            <p className="text-xs text-muted-foreground">
              {done}/{total} langkah selesai — siapkan workspace-mu biar AI bisa kerja.
            </p>
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {STEPS.map((s) => {
            const isDone = steps[s.key];
            const Icon = s.icon;
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border p-3 transition-colors",
                    isDone ? "border-success/30 bg-success/5" : "bg-card hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      isDone ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", isDone && "text-muted-foreground line-through")}>{s.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.desc}</p>
                  </div>
                  {!isDone && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

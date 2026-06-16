"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, Globe, Loader2, Mail, Users, XCircle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CrawlStatus = "idle" | "pending" | "success" | "error";

export interface CrawlResult {
  name?: string;
  emails?: number;
  phones?: number;
  socials?: number;
  contacts?: number;
  people?: number;
}

// The crawl is a single server request (no token-stream), so we animate the
// real stages it goes through while pending, then show the actual result.
const STAGES = [
  { icon: Globe, label: "Membuka & memuat website" },
  { icon: Mail, label: "Ekstrak email, telepon, sosmed" },
  { icon: Users, label: "Cari orang (Hunter.io)" },
  { icon: Database, label: "Simpan ke database" },
];

export function CrawlProgressDialog({
  open,
  onOpenChange,
  status,
  target,
  result,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  status: CrawlStatus;
  target: string;
  result?: CrawlResult | null;
  error?: string | null;
}) {
  const [active, setActive] = useState(0);

  // Advance the stage indicator while pending (illustrative pacing).
  useEffect(() => {
    if (status !== "pending") return;
    setActive(0);
    const t = setInterval(() => setActive((a) => Math.min(a + 1, STAGES.length - 1)), 1100);
    return () => clearInterval(t);
  }, [status]);

  const done = status === "success";
  const failed = status === "error";

  return (
    <Dialog open={open} onOpenChange={(v) => !(status === "pending") && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {done && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {failed && <XCircle className="h-4 w-4 text-destructive" />}
            {status === "pending" ? "Crawling…" : done ? "Crawl selesai" : "Crawl gagal"}
          </DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{target}</DialogDescription>
        </DialogHeader>

        {/* Stages */}
        <ul className="space-y-2.5">
          {STAGES.map((s, i) => {
            const state = failed
              ? i <= active
                ? "fail"
                : "idle"
              : done || i < active
                ? "done"
                : i === active && status === "pending"
                  ? "active"
                  : "idle";
            return (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    state === "done" && "bg-emerald-100 text-emerald-600",
                    state === "active" && "bg-primary/10 text-primary",
                    state === "fail" && "bg-destructive/10 text-destructive",
                    state === "idle" && "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : state === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <s.icon className="h-4 w-4" />
                  )}
                </span>
                <span className={cn(state === "idle" && "text-muted-foreground")}>{s.label}</span>
              </li>
            );
          })}
        </ul>

        {/* Result / error footer */}
        {done && result && (
          <div className="rounded-lg border bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <p className="font-semibold">{result.name ?? "Perusahaan"}</p>
            <p className="text-xs">
              {result.contacts ?? 0} kontak · {result.emails ?? 0} email · {result.phones ?? 0} telp
              {result.socials ? ` · ${result.socials} sosmed` : ""}
              {result.people ? ` · ${result.people} orang (Hunter)` : ""}
            </p>
          </div>
        )}
        {failed && (
          <div className="rounded-lg border bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {error || "Gagal meng-crawl situs ini. Coba URL lain atau pakai extension untuk situs full-JS."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

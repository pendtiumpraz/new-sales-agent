"use client";

// Group-level error boundary for the ENTIRE (app) shell — catches any page render
// crash (e.g. the pipeline "client-side exception") that doesn't have a closer
// route-level error.tsx, and surfaces the REAL error name/message/stack instead of
// the generic white "Application error" overlay, with a retry. This is what lets us
// diagnose a client-side exception without the browser console.

import Link from "next/link";
import { AlertOctagon, ArrowLeft, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-8">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-destructive/40 bg-gradient-to-br from-destructive/8 via-card to-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertOctagon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Halaman gagal dimuat</h2>
            <p className="text-xs text-muted-foreground">
              Terjadi error saat me-render halaman ini. Detail di bawah — coba muat ulang.
            </p>
          </div>
        </div>

        <pre className="scrollbar-thin max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {error.name}: {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          {error.stack ? `\n\n${error.stack.split("\n").slice(0, 16).join("\n")}` : ""}
        </pre>

        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" />
            Coba lagi
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Dasbor
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

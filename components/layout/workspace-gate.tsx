"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { isScopedRoute, withWorkspace } from "@/lib/workspace/scope";

interface WsRow {
  id: string;
  name: string;
  type: string;
  status?: string;
}

// Workspace-first gate (doc 44): scoped features require an active workspace. When
// none is selected, block the page and make the user pick/create one first.
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = useWorkspaceStore((s) => s.active);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const scoped = isScopedRoute(pathname);

  const q = useQuery({
    queryKey: ["workspace", "list"],
    queryFn: async () => {
      // Singular /api/workspace (workspace_v2) — same source as the switcher,
      // hub, and onboarding bootstrap.
      const r = await fetch("/api/workspace");
      if (!r.ok) throw new Error("forbidden");
      return (await r.json()) as { ok: boolean; data: WsRow[] };
    },
    enabled: scoped && !active,
    retry: false,
  });
  const list = (q.data?.data ?? []).filter((w) => w.status !== "archived");

  // Auto-select the first workspace when none is active but the tenant has ≥1
  // (e.g. straight after onboarding) — so scoped routes aren't needlessly
  // blocked. Only the truly empty tenant sees the picker below.
  useEffect(() => {
    if (scoped && !active && list.length > 0) {
      const first = list[0];
      setActive({ id: first.id, name: first.name, type: first.type });
      router.replace(withWorkspace(pathname, first.id));
    }
  }, [scoped, active, list, setActive, router, pathname]);

  if (!scoped || active) return <>{children}</>;

  const pick = (w: WsRow) => {
    setActive({ id: w.id, name: w.name, type: w.type });
    router.replace(withWorkspace(pathname, w.id)); // carry scope into the URL the page reads
  };

  // While the list is still loading, don't flash the "no workspace" picker —
  // the auto-select effect above resolves it once the query resolves.
  if (q.isLoading || (list.length > 0 && !active)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <LayoutGrid className="h-6 w-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutGrid className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Pilih workspace dulu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fitur ini bekerja di dalam sebuah workspace. Pilih atau buat dulu biar lead, pipeline, inbox &amp; penawaran ter-fokus per tujuan.
          </p>
        </div>
        {list.length > 0 && (
          <div className="space-y-1.5 text-left">
            {list.slice(0, 6).map((w) => (
              <button
                key={w.id}
                onClick={() => pick(w)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-accent"
              >
                <span className="truncate font-medium">{w.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">pilih →</span>
              </button>
            ))}
          </div>
        )}
        <Button asChild className="w-full">
          <Link href="/workspace">
            <Plus className="h-4 w-4" /> Kelola / buat workspace
          </Link>
        </Button>
      </div>
    </div>
  );
}

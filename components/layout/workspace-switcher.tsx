"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { isScopedRoute, withWorkspace } from "@/lib/workspace/scope";

interface WsRow {
  id: string;
  name: string;
  type: string;
  status?: string;
}

// Active-workspace switcher (doc 44) — sits at the top of the sidebar. Picking a
// workspace sets the active context and re-scopes the current page.
export function WorkspaceSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const active = useWorkspaceStore((s) => s.active);
  const setActive = useWorkspaceStore((s) => s.setActive);

  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const r = await fetch("/api/workspaces");
      if (!r.ok) throw new Error("forbidden");
      return (await r.json()) as { data: WsRow[] };
    },
    retry: false,
  });
  const list = (q.data?.data ?? []).filter((w) => w.status !== "archived");

  const choose = (w: WsRow) => {
    setActive({ id: w.id, name: w.name, type: w.type });
    if (isScopedRoute(pathname)) router.replace(withWorkspace(pathname, w.id));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-sm transition hover:bg-accent">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Workspace</span>
            <span className="block truncate font-medium">{active?.name ?? "Pilih workspace…"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspace kamu</DropdownMenuLabel>
        {list.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Belum ada workspace.</p>}
        {list.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => choose(w)} className="gap-2">
            <Check className={"h-4 w-4 " + (active?.id === w.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{w.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces" className="gap-2">
            <Plus className="h-4 w-4" /> Kelola / buat workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

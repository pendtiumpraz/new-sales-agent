"use client";

// Kontak & Lead — funnel into the workspace flow (doc 44 / closing-flow). Leads
// are managed PER-WORKSPACE now (1 workspace = 1 produk): pick a workspace to do
// produk → market-fit → discovery (tambah lead) → sales script → chat in one
// place. The old standalone contacts/discovery tabs are retired; the full
// crawler still lives at /contacts/discovery (opened scoped from a workspace).

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Briefcase, Package, Plus, Target, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface WorkspaceRow {
  id: string;
  name: string;
  productName: string | null;
  targetSegment: string | null;
  status: string;
  ownerName: string | null;
  leadCount: number;
}

export default function ContactsPage() {
  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const r = await fetch("/api/workspaces");
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as { data: WorkspaceRow[] };
    },
    retry: false,
  });
  const all = (q.data?.data ?? []).filter((w) => w.status !== "archived");

  return (
    <div>
      <PageHeader
        title="Kontak & Lead"
        description="Lead dikelola per-workspace sekarang (1 workspace = 1 produk). Pilih workspace untuk kelola lead + chat di alur yang sama."
      >
        <Button asChild>
          <Link href="/workspaces">
            <Plus className="h-4 w-4" /> Buat / kelola workspace
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Penjelasan alur baru */}
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Briefcase className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              Alur baru: tiap <span className="font-medium text-foreground">workspace</span> = 1 produk. Di dalamnya berurutan:{" "}
              <span className="font-medium text-foreground">
                pilih produk → Market-Fit → Discovery (tambah lead) → Sales Script → Chat
              </span>{" "}
              — semua di satu tempat, nggak loncat-loncat.
            </p>
          </CardContent>
        </Card>

        {q.isLoading ? (
          <CardGridSkeleton count={6} />
        ) : all.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Belum ada workspace"
            description="Buat workspace pertama untuk mulai kelola lead per produk — alur produk → market-fit → discovery → chat."
            action={
              <Button asChild>
                <Link href="/workspaces">
                  <Plus className="h-4 w-4" /> Buat workspace
                </Link>
              </Button>
            }
          />
        ) : (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pilih workspace ({all.length})
            </p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {all.map((w) => (
                <Link key={w.id} href={`/workspaces/${w.id}`} className="group block">
                  <Card className="h-full transition hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-semibold">{w.name}</p>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {w.productName ? (
                          <p className="flex items-center gap-1.5">
                            <Package className="h-3 w-3" /> {w.productName}
                          </p>
                        ) : (
                          <p className="flex items-center gap-1.5 text-amber-600">
                            <Package className="h-3 w-3" /> Belum ada produk — mulai dari sini
                          </p>
                        )}
                        {w.targetSegment && (
                          <p className="flex items-center gap-1.5">
                            <Target className="h-3 w-3" /> {w.targetSegment}
                          </p>
                        )}
                      </div>
                      <div className="mt-auto flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {w.leadCount} lead
                        </span>
                        {w.ownerName && <span className="truncate">oleh {w.ownerName}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

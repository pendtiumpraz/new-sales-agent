"use client";

import Link from "next/link";
import { Plus, Users, Workflow } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCadences } from "@/lib/api-mock/hooks";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; variant: "success" | "muted" | "warning" }> = {
  active: { label: "Aktif", variant: "success" },
  draft: { label: "Draf", variant: "muted" },
  paused: { label: "Jeda", variant: "warning" },
};

export default function CadencesPage() {
  const { data: cadences, isLoading } = useCadences();

  return (
    <div>
      <PageHeader title="Cadence" description="Rangkaian otomatis lintas channel.">
        <Button asChild>
          <Link href="/cadences/new">
            <Plus className="h-4 w-4" />
            Buat cadence
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))
          : (cadences ?? []).map((c) => (
              <Link key={c.id} href="/cadences/new">
                <Card className="h-full transition-shadow hover:shadow-sm">
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                        <Workflow className="h-5 w-5 text-foreground" />
                      </div>
                      <Badge variant={STATUS[c.status].variant}>
                        {STATUS[c.status].label}
                      </Badge>
                    </div>
                    <h3 className="mt-3 font-semibold leading-snug">{c.name}</h3>
                    <div className="mt-1 flex items-center gap-1.5">
                      {c.channelMix.map((ch) => (
                        <ChannelDot key={ch} channel={ch} size={8} />
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {c.steps.length} langkah
                      </span>
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {c.enrolled} kontak
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          c.replyRate >= 25 ? "text-tertiary" : "text-foreground",
                        )}
                      >
                        {c.replyRate}% balas
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>
    </div>
  );
}

"use client";

import { Building2, Globe2, Info } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  // Lean profile landing. The dedicated sub-sections (Tim, Mailbox, Billing,
  // Diagnostics, …) live in the left SettingsNav rail, so the old entry-card
  // grid that duplicated that nav is gone — this page is now just the
  // workspace/profile band.
  return (
    <div>
      <PageHeader title="Pengaturan" description="Kelola workspace, tim, dan integrasi." />

      <div className="p-6">
        <div className="space-y-4">
          {/* Workspace hero strip — coral gradient */}
          <Card className="overflow-hidden border-primary/20">
            <div className="relative bg-gradient-to-br from-primary/15 via-primary/8 to-tertiary/10 p-5">
              <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
              <div className="absolute -left-2 -bottom-12 h-28 w-28 rounded-full bg-tertiary/20 blur-2xl" />
              <div className="relative flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_rgba(251,94,59,0.6)]">
                  <Building2 className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">Workspace</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Identitas perusahaan, zona waktu, dan preferensi domain.
                  </p>
                </div>
                <Badge variant="muted" className="hidden gap-1 sm:inline-flex">
                  <Globe2 className="h-3 w-3" />
                  UTC+7 · WIB
                </Badge>
              </div>
            </div>
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">Nama workspace</Label>
                <Input
                  id="ws-name"
                  defaultValue="Maira Sales Indonesia"
                  readOnly
                  className="cursor-not-allowed bg-muted/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-domain">Domain</Label>
                <Input
                  id="ws-domain"
                  defaultValue="mairasales.com"
                  readOnly
                  className="cursor-not-allowed bg-muted/40"
                />
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3 shrink-0" />
                Mode demo — identitas workspace masih statis, belum tersambung
                ke penyimpanan.
              </p>
              <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-primary/5 p-3">
                <div>
                  <p className="text-sm font-medium">Zona waktu</p>
                  <p className="text-xs text-muted-foreground">Asia/Jakarta (WIB)</p>
                </div>
                <Badge variant="default" className="bg-primary/15 text-primary">
                  UTC+7
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

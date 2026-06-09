"use client";

import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Sparkles,
  Tag,
  Users,
  Wand2,
  Zap,
} from "lucide-react";

import { TempBadge } from "@/components/shared/temp-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import type { ProspectLead } from "@/lib/types";
import { toast } from "sonner";

function aiSummary(p: ProspectLead): string {
  return `${p.company} adalah perusahaan ${p.industry} di ${p.city} dengan ${p.companySize} karyawan dan estimasi omzet ${p.revenue}. Skor kecocokan AI ${p.aiScore}/100 berdasarkan ${p.intentSignals.length} sinyal niat beli.`;
}

function aiOpener(p: ProspectLead): string {
  const first = p.name.split(" ")[0];
  return `Halo ${first} 👋 Saya perhatikan ${p.company} sedang berkembang di sektor ${p.industry}. Banyak tim sales sejenis memakai Maira Sales untuk menyatukan WhatsApp + email dan mempercepat closing hingga 3×. Berkenan demo singkat 15 menit minggu ini?`;
}

export function ProspectSheet({
  prospect,
  open,
  onOpenChange,
}: {
  prospect: ProspectLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const enrich = useProspectingStore((s) => s.enrich);
  const addToCrm = useProspectingStore((s) => s.addToCrm);
  // read the live version from the store so enrich/add updates reflect instantly
  const live = useProspectingStore((s) =>
    prospect ? s.prospects.find((p) => p.id === prospect.id) ?? prospect : null,
  );
  const p = live;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
        {p && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-3">
                <UserAvatar name={p.name} color={p.avatarColor} className="h-12 w-12" />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{p.name}</SheetTitle>
                  <p className="truncate text-sm text-muted-foreground">
                    {p.title} · {p.company}
                  </p>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <TempBadge score={p.aiScore} temp={p.aiTemp} />
                {p.inCrm ? (
                  <Badge variant="success">Di CRM</Badge>
                ) : (
                  <Badge variant="muted">Prospek baru</Badge>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-5 p-6">
              {/* AI research */}
              <div className="rounded-xl border border-tertiary/30 bg-tertiary/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-tertiary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Riset AI
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {aiSummary(p)}
                </p>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" />
                  Sinyal niat beli
                </p>
                <ul className="space-y-1.5">
                  {p.intentSignals.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary" />
                      <span className="text-muted-foreground">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div className="space-y-3 text-sm">
                <Row icon={Building2} value={`${p.company} · ${p.industry}`} />
                <Row icon={MapPin} value={p.city} />
                <Row icon={Users} value={`${p.companySize} karyawan · ${p.revenue}`} />
                <Row icon={Mail} value={p.email} muted={!p.enriched} />
                <Row icon={Phone} value={p.phone} muted={!p.enriched} />
              </div>

              {p.enriched && p.techStack.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" />
                    Tech stack
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.techStack.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* AI recommended opener */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Wand2 className="h-3.5 w-3.5 text-tertiary" />
                  Pesan pembuka rekomendasi AI
                </p>
                <div
                  className="rounded-xl px-3 py-2.5 text-sm leading-relaxed"
                  style={{ backgroundColor: "#D9FDD3", color: "#0F172A" }}
                >
                  {aiOpener(p)}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 space-y-2 border-t bg-card p-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={p.enriched}
                  onClick={() => {
                    enrich(p.id);
                    toast.success(`Data ${p.name} diperkaya.`);
                  }}
                >
                  <Wand2 className="h-4 w-4" />
                  {p.enriched ? "Sudah diperkaya" : "Perkaya data"}
                </Button>
                <Button
                  className="flex-1"
                  disabled={p.inCrm}
                  onClick={() => {
                    addToCrm(p.id);
                    toast.success(`${p.name} ditambahkan ke CRM.`);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {p.inCrm ? "Di CRM" : "Tambah ke CRM"}
                </Button>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => toast.success(`${p.name} didaftarkan ke cadence "Demo to Close".`)}
              >
                <Sparkles className="h-4 w-4" />
                Tambah ke cadence outbound
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({
  icon: Icon,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className={muted ? "text-muted-foreground" : ""}>{value}</span>
    </div>
  );
}

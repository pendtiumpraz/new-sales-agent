"use client";

import Link from "next/link";
import { CalendarCheck, Building2, Plus, Tag, UserRound } from "lucide-react";

import { ConsentBadge } from "@/components/shared/consent-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useContact, useDeals } from "@/lib/api-mock/hooks";
import { useUiStore } from "@/lib/stores/ui-store";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatDateID } from "@/lib/utils/format-date-id";
import { toast } from "sonner";

const STAGE_LABEL: Record<string, string> = {
  prospek: "Prospek",
  kualifikasi: "Kualifikasi",
  penawaran: "Penawaran",
  negosiasi: "Negosiasi",
  tutup: "Tutup",
};

export function ContactPanel({ contactId }: { contactId: string }) {
  const { data: contact, isLoading } = useContact(contactId);
  const { data: deals } = useDeals();
  const open = useUiStore((s) => s.inboxPanelOpen);
  const deal = deals?.find((d) => d.contactId === contactId);

  if (!open) return null;

  if (isLoading || !contact) {
    return (
      <div className="hidden w-80 shrink-0 space-y-4 border-l bg-card p-5 xl:block">
        <Skeleton className="mx-auto h-16 w-16 rounded-full" />
        <Skeleton className="mx-auto h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const pref = channelMeta(contact.channelPreference);

  return (
    <aside className="scrollbar-thin hidden w-80 shrink-0 overflow-y-auto border-l bg-card xl:block">
      <div className="flex flex-col items-center gap-2 p-5 text-center">
        <UserAvatar name={contact.name} color={contact.avatarColor} className="h-16 w-16 text-lg" />
        <div>
          <p className="font-semibold">{contact.name}</p>
          <p className="text-sm text-muted-foreground">{contact.title}</p>
        </div>
        <ConsentBadge status={contact.consent} />
      </div>

      <Separator />

      <div className="space-y-3 p-5 text-sm">
        <InfoRow icon={Building2} label="Perusahaan" value={contact.company} />
        <InfoRow
          icon={ChannelPrefIcon(contact.channelPreference)}
          label="Channel utama"
          value={pref.label}
        />
        <InfoRow icon={Tag} label="Industri" value={contact.industry} />
        <InfoRow icon={UserRound} label="Sumber" value={contact.consentSource} />
        <InfoRow
          icon={CalendarCheck}
          label="Disetujui"
          value={formatDateID(contact.consentDate)}
        />
      </div>

      <Separator />

      {/* Deal status */}
      <div className="space-y-3 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deal terkait
        </p>
        {deal ? (
          <Link
            href="/pipeline"
            className="block rounded-lg border p-3 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{deal.name}</p>
              <Badge variant="secondary">{STAGE_LABEL[deal.stage]}</Badge>
            </div>
            <IDRAmount value={deal.value} className="mt-1 text-sm font-semibold text-primary" />
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada deal aktif.</p>
        )}
      </div>

      <div className="space-y-2 p-5 pt-0">
        <Button
          className="w-full"
          onClick={() =>
            toast.success(`${contact.name} ditambahkan ke cadence "Demo to Close".`)
          }
        >
          <Plus className="h-4 w-4" />
          Tambahkan ke cadence
        </Button>
        <Button variant="outline" className="w-full" asChild>
          <Link href="/contacts">Lihat di Kontak</Link>
        </Button>
      </div>
    </aside>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}

function ChannelPrefIcon(channel: string) {
  return channelMeta(channel).icon;
}

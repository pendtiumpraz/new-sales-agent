"use client";

import Link from "next/link";
import { Briefcase, Building2, ExternalLink, MapPin, Tag } from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { ConsentBadge } from "@/components/shared/consent-badge";
import { TempBadge } from "@/components/shared/temp-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { channelMeta } from "@/lib/utils/channel-config";
import { leadScore } from "@/lib/utils/lead-score";
import type { Contact } from "@/lib/types";

interface ProspectCardProps {
  contact: Contact;
}

/** Compact prospect summary used in the unified workspace right rail. */
export function ProspectCard({ contact }: ProspectCardProps) {
  const { score, temp } = leadScore(contact);
  const pref = channelMeta(contact.channelPreference);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <UserAvatar
          name={contact.name}
          color={contact.avatarColor}
          className="h-11 w-11 text-sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{contact.name}</p>
            <Link
              href={`/contacts?focus=${contact.id}`}
              className="text-muted-foreground hover:text-foreground"
              title="Lihat di Kontak"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {contact.title}
          </p>
        </div>
        <TempBadge score={score} temp={temp} className="shrink-0" />
      </div>

      <div className="space-y-2.5 p-4 text-xs">
        <InfoRow
          icon={Building2}
          label="Perusahaan"
          value={contact.company}
        />
        <InfoRow icon={Tag} label="Industri" value={contact.industry} />
        <InfoRow icon={MapPin} label="Kota" value={contact.city} />
        <InfoRow
          icon={Briefcase}
          label="Channel utama"
          value={
            <span className="inline-flex items-center gap-1.5">
              <ChannelDot channel={contact.channelPreference} size={8} />
              {pref.label}
            </span>
          }
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4 py-2.5 text-[11px]">
        <span className="text-muted-foreground">Status persetujuan</span>
        <ConsentBadge status={contact.consent} />
      </div>
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}

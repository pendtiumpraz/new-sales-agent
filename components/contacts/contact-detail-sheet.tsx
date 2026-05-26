"use client";

import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Tag,
} from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { ConsentBadge } from "@/components/shared/consent-badge";
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
import { channelMeta } from "@/lib/utils/channel-config";
import { formatDateID, formatRelativeID } from "@/lib/utils/format-date-id";
import type { Contact } from "@/lib/types";
import { toast } from "sonner";

// Mock sequence history per contact (deterministic by id length).
const HISTORY = [
  { label: "Email perkenalan terkirim", channel: "email", when: 9 },
  { label: "WhatsApp dibalas oleh kontak", channel: "whatsapp", when: 6 },
  { label: "Ditambahkan ke cadence Demo to Close", channel: "whatsapp", when: 4 },
  { label: "Penawaran dibuka 2×", channel: "email", when: 2 },
];

export function ContactDetailSheet({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
        {contact && (
          <>
            <SheetHeader className="items-center border-b pb-6 text-center">
              <UserAvatar
                name={contact.name}
                color={contact.avatarColor}
                className="h-16 w-16 text-lg"
              />
              <SheetTitle>{contact.name}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {contact.title} · {contact.company}
              </p>
              <ConsentBadge status={contact.consent} />
            </SheetHeader>

            <div className="space-y-5 p-6">
              <div className="space-y-3 text-sm">
                <Row icon={Mail} value={contact.email} />
                <Row icon={Phone} value={contact.phone} />
                <Row icon={Building2} value={contact.company} />
                <Row icon={MapPin} value={contact.city} />
                <Row icon={Tag} value={contact.industry} />
              </div>

              {contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              <Separator />

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Preferensi channel
                </p>
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <ChannelDot channel={contact.channelPreference} size={10} />
                  <span className="text-sm font-medium">
                    {channelMeta(contact.channelPreference).label}
                  </span>
                  <Badge variant="muted" className="ml-auto">
                    Disukai
                  </Badge>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Persetujuan data (UU PDP)
                </p>
                <p className="text-sm text-muted-foreground">
                  Sumber: <span className="font-medium text-foreground">{contact.consentSource}</span>
                  {" · "}
                  {formatDateID(contact.consentDate)}
                </p>
              </div>

              <Separator />

              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Riwayat sequence
                </p>
                <ol className="space-y-3">
                  {HISTORY.map((h, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <ChannelDot channel={h.channel} size={9} />
                        {i < HISTORY.length - 1 && (
                          <span className="mt-1 h-full w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div className="-mt-0.5 pb-1">
                        <p className="text-sm">{h.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeID(
                            new Date(Date.now() - h.when * 864e5).toISOString(),
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t bg-card p-4">
              <Button
                className="flex-1"
                onClick={() =>
                  toast.success(`${contact.name} ditambahkan ke cadence.`)
                }
              >
                <Plus className="h-4 w-4" />
                Tambah ke cadence
              </Button>
              <Button variant="outline" className="flex-1">
                Kirim WhatsApp
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{value}</span>
    </div>
  );
}

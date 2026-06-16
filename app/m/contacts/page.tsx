"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Phone, Search } from "lucide-react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useContacts } from "@/lib/api-mock/hooks";

/** Digits only, no leading + — required by wa.me (e.g. "+62 841-..." -> "62841..."). */
function waNumber(phone: string) {
  return phone.replace(/\D/g, "");
}
/** E.164-ish for tel: — keep a single leading +, drop spaces/dashes. */
function telNumber(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export default function MobileContactsPage() {
  const { data: contacts, isLoading } = useContacts();
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const base = (contacts ?? []).slice(0, 40);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Kontak Terdekat</h1>
      <div className="relative mt-3">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari kontak..."
          className="pl-8"
        />
      </div>

      <ul className="mt-3 space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))
          : list.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <UserAvatar name={c.name} color={c.avatarColor} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                </div>
                <a
                  href={`tel:${telNumber(c.phone)}`}
                  aria-label={`Telepon ${c.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-muted-foreground"
                >
                  <Phone className="h-4 w-4" />
                </a>
                <a
                  href={`https://wa.me/${waNumber(c.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${c.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "#25D366" }}
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              </li>
            ))}
      </ul>
    </div>
  );
}

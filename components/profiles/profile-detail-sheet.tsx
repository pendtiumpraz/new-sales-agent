"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Sparkles,
  Users,
  X,
  // lucide v1.16 doesn't ship brand glyphs — alias generic icons (matches repo convention, see #185 commit).
  Network as Linkedin,
  Code2 as Github,
  Camera as Instagram,
  AtSign as Twitter,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared data shapes (inlined per contract — do not import from server libs)
// ---------------------------------------------------------------------------
interface ContactPoint {
  id: string;
  channel: string;
  value: string;
  consentStatus: string;
}

interface PersonRow {
  id: string;
  fullName: string;
  title?: string | null;
  department?: string | null;
  location?: string | null;
  companyName?: string | null;
  companyId?: string | null;
  source?: string | null;
  leadType?: string | null;
  leadReason?: string | null;
  capturedAt?: string | null;
  assignedTo?: string | null;
  workspaceId?: string | null;
  linkedinUrl?: string | null;
  gender?: string | null;
  honorific?: string | null;
  socials?: Record<string, string> | null;
  profileSummary?: string | null;
  contacts: ContactPoint[];
}

interface CompanyRow {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  summary?: string | null;
  source?: string | null;
  contacts: ContactPoint[];
  peopleCount: number;
}

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------
function toWaDigits(phone: string): string {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
}

function linkForChannel(channel: string, value: string): string | null {
  const c = (channel || "").toLowerCase();
  const v = (value || "").trim();
  if (!v) return null;
  if (c.includes("email") || c.includes("mail")) return `mailto:${v}`;
  if (c.includes("phone") || c.includes("tel") || c.includes("mobile"))
    return `tel:${v}`;
  if (c.includes("whatsapp") || c.includes("wa"))
    return `https://wa.me/${toWaDigits(v)}`;
  if (c.includes("address") || c.includes("alamat")) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.includes(".") && !v.includes(" ")) return `https://${v}`;
  return null;
}

function isPhoneChannel(channel: string): boolean {
  const c = (channel || "").toLowerCase();
  return c.includes("phone") || c.includes("tel") || c.includes("mobile");
}

function isAddressChannel(channel: string): boolean {
  const c = (channel || "").toLowerCase();
  return c.includes("address") || c.includes("alamat");
}

function channelIcon(channel: string) {
  const c = (channel || "").toLowerCase();
  if (c.includes("email") || c.includes("mail"))
    return <Mail className="h-4 w-4" />;
  if (c.includes("whatsapp") || c.includes("wa"))
    return <MessageCircle className="h-4 w-4" />;
  if (isPhoneChannel(c)) return <Phone className="h-4 w-4" />;
  if (isAddressChannel(c)) return <MapPin className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

function socialIcon(key: string) {
  const k = (key || "").toLowerCase();
  if (k.includes("github")) return <Github className="h-4 w-4" />;
  if (k.includes("twitter") || k.includes("x"))
    return <Twitter className="h-4 w-4" />;
  if (k.includes("instagram") || k.includes("ig"))
    return <Instagram className="h-4 w-4" />;
  if (k.includes("linkedin")) return <Linkedin className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

function socialHref(value: string): string {
  const v = (value || "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ContactRow({ contact }: { contact: ContactPoint }) {
  const href = linkForChannel(contact.channel, contact.value);
  const phone = isPhoneChannel(contact.channel);
  const address = isAddressChannel(contact.channel);

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
      <span className="mt-0.5 text-muted-foreground">
        {channelIcon(contact.channel)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {contact.channel}
        </p>
        {href ? (
          <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="block break-words text-sm text-tertiary hover:underline"
          >
            {contact.value}
          </a>
        ) : (
          <p className="break-words text-sm text-foreground">
            {contact.value}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="muted" className="text-[10px]">
            {contact.consentStatus}
          </Badge>
          {phone && (
            <a
              href={`https://wa.me/${toWaDigits(contact.value)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-2 text-[11px] text-success"
              >
                <MessageCircle className="h-3 w-3" />
                WhatsApp
              </Button>
            </a>
          )}
        </div>
      </div>
      {address && <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />}
    </div>
  );
}

function SocialsList({
  socials,
}: {
  socials?: Record<string, string> | null;
}) {
  if (!socials) return null;
  const entries = Object.entries(socials).filter(([, v]) => !!v);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, value]) => (
        <a
          key={key}
          href={socialHref(value)}
          target="_blank"
          rel="noreferrer"
        >
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-xs capitalize"
          >
            {socialIcon(key)}
            {key}
          </Button>
        </a>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ProfileDetailSheetProps {
  kind: "person" | "company" | null;
  data: PersonRow | CompanyRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEnrich?: (id: string) => void;
  enriching?: boolean;
}

interface PersonForm {
  fullName: string;
  title: string;
  department: string;
  location: string;
}

interface CompanyForm {
  name: string;
  domain: string;
  industry: string;
  size: string;
  summary: string;
}

const EMPTY_PERSON: PersonForm = {
  fullName: "",
  title: "",
  department: "",
  location: "",
};
const EMPTY_COMPANY: CompanyForm = {
  name: "",
  domain: "",
  industry: "",
  size: "",
  summary: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ProfileDetailSheet({
  kind,
  data,
  open,
  onOpenChange,
  onEnrich,
  enriching,
}: ProfileDetailSheetProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [personForm, setPersonForm] = useState<PersonForm>(EMPTY_PERSON);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY);

  const isPerson = kind === "person";
  const person = isPerson ? (data as PersonRow | null) : null;
  const company = !isPerson ? (data as CompanyRow | null) : null;

  // Reset form values + exit edit mode whenever the underlying record changes.
  useEffect(() => {
    setEditing(false);
    if (!data) {
      setPersonForm(EMPTY_PERSON);
      setCompanyForm(EMPTY_COMPANY);
      return;
    }
    if (kind === "person") {
      const p = data as PersonRow;
      setPersonForm({
        fullName: p.fullName ?? "",
        title: p.title ?? "",
        department: p.department ?? "",
        location: p.location ?? "",
      });
    } else {
      const c = data as CompanyRow;
      setCompanyForm({
        name: c.name ?? "",
        domain: c.domain ?? "",
        industry: c.industry ?? "",
        size: c.size ?? "",
        summary: c.summary ?? "",
      });
    }
  }, [data, kind]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data || !kind) throw new Error("no record");
      const patch: Record<string, string | null> =
        kind === "person"
          ? {
              fullName: personForm.fullName.trim() || null,
              title: personForm.title.trim() || null,
              department: personForm.department.trim() || null,
              location: personForm.location.trim() || null,
            }
          : {
              name: companyForm.name.trim() || null,
              domain: companyForm.domain.trim() || null,
              industry: companyForm.industry.trim() || null,
              size: companyForm.size.trim() || null,
              summary: companyForm.summary.trim() || null,
            };

      const res = await fetch("/api/profiles/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: data.id, patch }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "update failed");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Profil tersimpan");
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      setEditing(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Gagal menyimpan profil");
    },
  });

  const title = isPerson ? person?.fullName : company?.name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="px-0 pb-2 pt-0">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 rounded-xl bg-tertiary/10 p-2 text-tertiary">
                {isPerson ? (
                  <Users className="h-5 w-5" />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </span>
              <SheetTitle className="break-words text-base">
                {title || (
                  <Skeleton className="h-5 w-40" />
                )}
              </SheetTitle>
            </div>
            {data && (
              <Button
                size="sm"
                variant={editing ? "secondary" : "outline"}
                className="h-8 shrink-0 gap-1.5"
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    Tutup
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </>
                )}
              </Button>
            )}
          </div>
        </SheetHeader>

        {!data ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : editing ? (
          // -------------------------------------------------------------- EDIT
          <div className="space-y-4 py-2">
            {isPerson ? (
              <>
                <EditField
                  label="Nama lengkap"
                  value={personForm.fullName}
                  onChange={(v) =>
                    setPersonForm((f) => ({ ...f, fullName: v }))
                  }
                />
                <EditField
                  label="Jabatan"
                  value={personForm.title}
                  onChange={(v) => setPersonForm((f) => ({ ...f, title: v }))}
                />
                <EditField
                  label="Departemen"
                  value={personForm.department}
                  onChange={(v) =>
                    setPersonForm((f) => ({ ...f, department: v }))
                  }
                />
                <EditField
                  label="Lokasi"
                  value={personForm.location}
                  onChange={(v) =>
                    setPersonForm((f) => ({ ...f, location: v }))
                  }
                />
              </>
            ) : (
              <>
                <EditField
                  label="Nama perusahaan"
                  value={companyForm.name}
                  onChange={(v) => setCompanyForm((f) => ({ ...f, name: v }))}
                />
                <EditField
                  label="Domain"
                  value={companyForm.domain}
                  onChange={(v) =>
                    setCompanyForm((f) => ({ ...f, domain: v }))
                  }
                  placeholder="contoh.com"
                />
                <EditField
                  label="Industri"
                  value={companyForm.industry}
                  onChange={(v) =>
                    setCompanyForm((f) => ({ ...f, industry: v }))
                  }
                />
                <EditField
                  label="Ukuran"
                  value={companyForm.size}
                  onChange={(v) => setCompanyForm((f) => ({ ...f, size: v }))}
                  placeholder="51-200"
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Ringkasan
                  </label>
                  <Textarea
                    value={companyForm.summary}
                    onChange={(e) =>
                      setCompanyForm((f) => ({ ...f, summary: e.target.value }))
                    }
                    rows={4}
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="gap-1.5"
              >
                {save.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Simpan
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={save.isPending}
              >
                Batal
              </Button>
            </div>
          </div>
        ) : isPerson && person ? (
          // ------------------------------------------------------ VIEW: PERSON
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jabatan" value={person.title} />
              <Field label="Departemen" value={person.department} />
              <Field
                label="Perusahaan"
                value={person.companyName}
              />
              <Field label="Lokasi" value={person.location} />
              <Field label="Gender" value={person.gender} />
              {person.honorific && (
                <Field label="Sapaan" value={`Sapaan: ${person.honorific}`} />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {person.leadType && (
                <Badge variant="secondary" className="capitalize">
                  {person.leadType}
                </Badge>
              )}
              {person.source && (
                <Badge variant="muted" className="capitalize">
                  {person.source}
                </Badge>
              )}
            </div>

            {person.leadReason && (
              <p className="text-xs italic text-muted-foreground">
                {person.leadReason}
              </p>
            )}

            {person.profileSummary && (
              <Card className="border-border/60 bg-card/40">
                <CardContent className="p-3">
                  <SectionLabel>Ringkasan</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {person.profileSummary}
                  </p>
                </CardContent>
              </Card>
            )}

            {person.linkedinUrl && (
              <a
                href={socialHref(person.linkedinUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-block"
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Linkedin className="h-4 w-4" />
                  LinkedIn
                </Button>
              </a>
            )}

            {person.socials && (
              <div className="space-y-2">
                <SectionLabel>Sosial</SectionLabel>
                <SocialsList socials={person.socials} />
              </div>
            )}

            {person.contacts?.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Kontak</SectionLabel>
                <div className="space-y-2">
                  {person.contacts.map((c) => (
                    <ContactRow key={c.id} contact={c} />
                  ))}
                </div>
              </div>
            )}

            {onEnrich && (
              <Button
                variant="secondary"
                className="w-full gap-2"
                disabled={enriching}
                onClick={() => onEnrich(person.id)}
              >
                {enriching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {enriching ? "Mencari kontak…" : "Enrich (cari kontak web)"}
              </Button>
            )}
          </div>
        ) : company ? (
          // ----------------------------------------------------- VIEW: COMPANY
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Industri" value={company.industry} />
              <Field label="Ukuran" value={company.size} />
              <Field label="Domain" value={company.domain} />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Jumlah orang
                </p>
                <p className="flex items-center gap-1 text-sm text-foreground">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {company.peopleCount}
                </p>
              </div>
            </div>

            {company.domain && (
              <a
                href={socialHref(company.domain)}
                target="_blank"
                rel="noreferrer"
                className="inline-block"
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Globe className="h-4 w-4" />
                  {company.domain}
                </Button>
              </a>
            )}

            {company.summary && (
              <Card className="border-border/60 bg-card/40">
                <CardContent className="p-3">
                  <SectionLabel>Ringkasan</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {company.summary}
                  </p>
                </CardContent>
              </Card>
            )}

            {company.contacts?.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Kontak</SectionLabel>
                <div className="space-y-2">
                  {company.contacts.map((c) => (
                    <ContactRow key={c.id} contact={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default ProfileDetailSheet;

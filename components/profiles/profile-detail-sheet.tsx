"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Pencil, Save, Sparkles, X } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  source?: string | null;
  leadType?: string | null;
  leadReason?: string | null;
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
  peopleCount: number;
  contacts: ContactPoint[];
}

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email", phone: "Telepon", whatsapp: "WhatsApp", wa: "WhatsApp", website: "Website",
  github: "GitHub", twitter: "X", linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok", address: "Alamat",
};
function toWaDigits(phone: string): string {
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (!d.startsWith("62")) d = "62" + d;
  return d;
}
function linkForChannel(channel: string, value: string): string | null {
  const c = channel.toLowerCase();
  if (c === "email") return `mailto:${value}`;
  if (c === "phone" || c === "tel") return `tel:${value}`;
  if (c === "wa" || c === "whatsapp") return `https://wa.me/${toWaDigits(value)}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (["website", "github", "twitter", "linkedin", "instagram", "tiktok"].includes(c)) return value.startsWith("http") ? value : `https://${value}`;
  return null;
}

interface Props {
  kind: "person" | "company" | null;
  data: PersonRow | CompanyRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEnrich?: (id: string) => void;
  enriching?: boolean;
}

export function ProfileDetailSheet({ kind, data, open, onOpenChange, onEnrich, enriching }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    setEditing(false);
    if (!data) return;
    if (kind === "person") {
      const p = data as PersonRow;
      setForm({ fullName: p.fullName ?? "", title: p.title ?? "", department: p.department ?? "", location: p.location ?? "" });
    } else {
      const c = data as CompanyRow;
      setForm({ name: c.name ?? "", domain: c.domain ?? "", industry: c.industry ?? "", size: c.size ?? "", summary: c.summary ?? "" });
    }
  }, [data, kind]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data || !kind) return;
      const patch = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]));
      const r = await fetch("/api/profiles/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: data.id, patch }) });
      if (!r.ok) throw new Error("gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Profil tersimpan");
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      setEditing(false);
    },
    onError: () => toast.error("Gagal menyimpan (cek hak akses & DB)"),
  });

  const person = kind === "person" && data ? (data as PersonRow) : null;
  const company = kind === "company" && data ? (data as CompanyRow) : null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const socials: { label: string; href: string }[] = [];
  if (person?.linkedinUrl) socials.push({ label: "LinkedIn", href: person.linkedinUrl });
  for (const [k, v] of Object.entries(person?.socials ?? {})) if (v) socials.push({ label: CHANNEL_LABEL[k] ?? k, href: v });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {data && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
              <div className="min-w-0">
                <SheetHeader className="space-y-0 text-left">
                  <SheetTitle className="truncate text-lg">{person?.fullName ?? company?.name}</SheetTitle>
                </SheetHeader>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {person ? [person.title, person.companyName].filter(Boolean).join(" · ") || "—" : [company?.industry, company?.domain].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {editing ? (
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5" /> Batal
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>

            <div className="flex-1 space-y-6 px-6 py-5">
              {editing ? (
                /* ── Edit form ─────────────────────────────────────────── */
                <div className="space-y-4">
                  {person ? (
                    <>
                      <LabeledInput label="Nama" value={form.fullName} onChange={set("fullName")} />
                      <LabeledInput label="Jabatan" value={form.title} onChange={set("title")} />
                      <LabeledInput label="Departemen" value={form.department} onChange={set("department")} />
                      <LabeledInput label="Lokasi" value={form.location} onChange={set("location")} />
                    </>
                  ) : (
                    <>
                      <LabeledInput label="Nama PT" value={form.name} onChange={set("name")} />
                      <LabeledInput label="Domain" value={form.domain} onChange={set("domain")} />
                      <LabeledInput label="Industri" value={form.industry} onChange={set("industry")} />
                      <LabeledInput label="Ukuran" value={form.size} onChange={set("size")} />
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Ringkasan</label>
                        <textarea value={form.summary} onChange={set("summary")} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                      </div>
                    </>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                      <Save className="h-4 w-4" /> {save.isPending ? "Menyimpan…" : "Simpan"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>Batal</Button>
                  </div>
                </div>
              ) : (
                /* ── View ──────────────────────────────────────────────── */
                <>
                  {(person?.leadType || person?.gender || person?.honorific) && (
                    <div className="flex flex-wrap gap-1.5">
                      {person?.leadType && <Chip className={leadCls(person.leadType)}>{leadLabel(person.leadType)}</Chip>}
                      {person?.honorific && <Chip>Sapaan: {person.honorific}</Chip>}
                      {person?.gender && <Chip>{person.gender === "male" ? "Pria" : person.gender === "female" ? "Wanita" : person.gender}</Chip>}
                    </div>
                  )}

                  <section className="divide-y rounded-lg border">
                    {person && (
                      <>
                        <Field label="Jabatan" value={person.title} />
                        <Field label="Perusahaan" value={person.companyName} />
                        <Field label="Departemen" value={person.department} />
                        <Field label="Lokasi" value={person.location} />
                      </>
                    )}
                    {company && (
                      <>
                        <Field label="Industri" value={company.industry} />
                        <Field label="Domain" value={company.domain} />
                        <Field label="Ukuran" value={company.size} />
                        <Field label="Jumlah orang" value={String(company.peopleCount)} />
                      </>
                    )}
                  </section>

                  {(person?.profileSummary || company?.summary) && (
                    <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
                      {person?.profileSummary ?? company?.summary}
                    </p>
                  )}

                  {socials.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {socials.map((s) => (
                        <a key={s.href} href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-primary transition hover:bg-accent">
                          {s.label} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}

                  {data.contacts.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontak</h4>
                      <div className="space-y-1.5">
                        {data.contacts.map((cp) => <ContactLine key={cp.id} cp={cp} />)}
                      </div>
                    </section>
                  )}

                  {onEnrich && (
                    <Button variant="secondary" className="w-full" onClick={() => onEnrich(data.id)} disabled={enriching}>
                      <Sparkles className="h-4 w-4" /> {enriching ? "Mencari di web…" : person ? "Enrich (cari email/HP/GitHub)" : "Enrich (cari domain, alamat, email, telepon)"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={onChange} />
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>{children}</span>;
}

function ContactLine({ cp }: { cp: ContactPoint }) {
  const href = linkForChannel(cp.channel, cp.value);
  const wa = cp.channel === "phone" ? `https://wa.me/${toWaDigits(cp.value)}` : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{CHANNEL_LABEL[cp.channel] ?? cp.channel}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-primary hover:underline">{cp.value}</a>
      ) : (
        <span className="min-w-0 flex-1 break-words font-mono">{cp.value}</span>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200">
          WhatsApp
        </a>
      )}
    </div>
  );
}

function leadLabel(t: string) {
  return t === "b2c_customer" ? "B2C Customer" : t === "b2b_partner" ? "B2B Partner" : t === "b2b_client" ? "B2B Client" : t;
}
function leadCls(t: string) {
  return t === "b2c_customer" ? "bg-emerald-100 text-emerald-700" : t === "b2b_partner" ? "bg-blue-100 text-blue-700" : t === "b2b_client" ? "bg-violet-100 text-violet-700" : "";
}

export default ProfileDetailSheet;

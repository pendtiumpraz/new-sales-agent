"use client";

// Mailbox settings — Module 8 FRONTEND (Settings cluster · Sainskerta Loop Phase
// 04). The tenant's connected SENDING IDENTITIES (SMTP app-password / Gmail · MS
// 365 OAuth / platform ESP) with connect + disconnect.
//
// Wired to the NEW M8 facade for the READ (no mock data):
//   - GET /api/settings/mailboxes → { ok, data: MailboxConfig } — sending accounts
//     (NO secrets) each with emails-sent-today (Asia/Jakarta day, matching the cap
//     processSendJobs enforces) + the lib/mail "is configured" provider flags
//     (google / microsoft / esp) that drive the quick-connect buttons.
//
// Connect / disconnect REUSE the existing infra routes (the facade is read-only; it
// does NOT rebuild connect, per modules/settings/service.getMailboxes):
//   - POST   /api/tenant/mailboxes        { fromEmail, fromName?, host, port, secure,
//                                           user, pass } → connect SMTP (config_enc)
//   - POST   /api/tenant/mailboxes/esp    { fromEmail, fromName? } → platform ESP
//   - DELETE /api/tenant/mailboxes        { id } → disconnect (hard) a mailbox
//   - GET    /api/mailboxes/oauth/google|microsoft/start (redirect) → OAuth connect;
//     lands back here as ?connect=success|error|norefresh.
// These reuse the LEGACY envelope ({ ok } / { error } / { data }), so they get their
// own reader, separate from the M8 { ok, data } facade.
//
// Matches the established design system (Coral Sunset, the (app) shell, PageHeader +
// stat strip + cards + shared Error/Empty states) and renders inside the shared
// Settings sub-nav (app/(app)/settings/layout.tsx). Every band has loading + empty +
// error states. Connect/disconnect controls gate on mailbox.connect (the same
// permission the infra routes enforce); read needs data.read.

import { useEffect, useId, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Check,
  Gauge,
  Inbox,
  Loader2,
  Mail,
  Plug,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { withFieldId } from "@/components/shared/field-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { can, mapDemoRole, type Role } from "@/lib/rbac/permissions";

// ── NEW M8 envelope ({ ok, data }) + row shapes ─────────────────────────────
interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

/** A sending identity from GET /api/settings/mailboxes (lib/db · sending_account).
 *  type ∈ smtp | gmail_oauth | ms_oauth | platform_esp. NO secrets are returned. */
interface MailboxRow {
  id: string;
  type: string;
  fromEmail: string;
  fromName: string | null;
  status: string; // active | disabled | error …
  dailyLimit: number;
  sentToday: number;
}

/** lib/mail "is configured" flags — which quick-connect paths are wired in env. */
interface ProviderFlags {
  google: boolean;
  microsoft: boolean;
  esp: boolean;
}

interface MailboxConfig {
  mailboxes: MailboxRow[];
  providers: ProviderFlags;
}

// ── display metadata per sending-account type ────────────────────────────────
const TYPE_META: Record<
  string,
  { label: string; dot: string; icon: typeof Mail }
> = {
  smtp: { label: "SMTP", dot: "#6366F1", icon: Mail },
  gmail_oauth: { label: "Gmail (OAuth)", dot: "#EA4335", icon: Mail },
  ms_oauth: { label: "Outlook (OAuth)", dot: "#0078D4", icon: Mail },
  platform_esp: { label: "Platform ESP", dot: "#25D366", icon: Building2 },
};

function typeMeta(type: string): { label: string; dot: string; icon: typeof Mail } {
  return TYPE_META[type] ?? { label: type.toUpperCase(), dot: "#6B7280", icon: Mail };
}

const STATUS_CLS: Record<string, string> = {
  active: "bg-success/12 text-success",
  disabled: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read the NEW M8 facade envelope. 403 → "forbidden" sentinel for the access state. */
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

/** The existing-infra connect/disconnect routes use the LEGACY envelope
 *  ({ ok } / { error }), not { ok, data } — so they get their own reader. */
async function readLegacy(r: Response): Promise<void> {
  const j = (await r.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error(j?.error || "Permintaan gagal");
  }
}

function fmtInt(n: number): string {
  return Number(n).toLocaleString("id-ID");
}

function pctOf(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ── SMTP connect draft ───────────────────────────────────────────────────────
interface SmtpDraft {
  fromEmail: string;
  fromName: string;
  host: string;
  port: number;
  user: string;
  pass: string;
}
const EMPTY_SMTP: SmtpDraft = {
  fromEmail: "",
  fromName: "",
  host: "smtp.gmail.com",
  port: 465,
  user: "",
  pass: "",
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function MailboxesSettingsPage() {
  const { data: session } = useSession();
  // Session role may be the canonical RBAC role (real auth) or a demo display role;
  // map either onto a canonical Role before gating.
  const role: Role = useMemo(() => {
    const raw = session?.user?.role;
    if (!raw) return "member";
    if ((["superadmin", "tenant_owner", "tenant_admin", "member"] as const).includes(raw as Role)) {
      return raw as Role;
    }
    return mapDemoRole(raw);
  }, [session?.user?.role]);
  // Connect/disconnect gate on the SAME permission the infra routes enforce.
  const canManage = can(role, "mailbox.connect");

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings", "mailboxes"] });

  const configQ = useQuery({
    queryKey: ["settings", "mailboxes"],
    queryFn: async () => readJson<MailboxConfig>(await fetch("/api/settings/mailboxes")),
    retry: false,
  });

  const data = configQ.data;
  const mailboxes = useMemo(() => data?.mailboxes ?? [], [data]);
  const providers = data?.providers ?? { google: false, microsoft: false, esp: false };
  const forbidden = configQ.error instanceof Error && configQ.error.message === "forbidden";

  const stats = useMemo(() => {
    let sentToday = 0;
    let capacity = 0;
    let active = 0;
    for (const m of mailboxes) {
      sentToday += m.sentToday;
      capacity += m.dailyLimit;
      if (m.status === "active") active++;
    }
    return { count: mailboxes.length, active, sentToday, capacity };
  }, [mailboxes]);

  // OAuth connect result lands back here as ?connect=success|error|norefresh.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("connect");
    if (!c) return;
    if (c === "success") toast.success("Mailbox OAuth terhubung");
    else if (c === "norefresh")
      toast.error("Tidak dapat refresh token — coba lagi & izinkan akses penuh");
    else toast.error("Gagal menghubungkan mailbox OAuth");
    window.history.replaceState({}, "", window.location.pathname);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── connect drawer + drafts ──────────────────────────────────────────────
  const [connectOpen, setConnectOpen] = useState(false);
  const [smtp, setSmtp] = useState<SmtpDraft>(EMPTY_SMTP);
  const [esp, setEsp] = useState({ fromEmail: "", fromName: "" });

  // ── disconnect confirm ───────────────────────────────────────────────────
  const [disconnectTarget, setDisconnectTarget] = useState<MailboxRow | null>(null);

  // ── mutations (REUSE existing infra · legacy envelope) ────────────────────
  const connectSmtp = useMutation({
    mutationFn: async (d: SmtpDraft) =>
      readLegacy(
        await fetch("/api/tenant/mailboxes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromEmail: d.fromEmail,
            fromName: d.fromName || undefined,
            host: d.host,
            port: d.port,
            secure: d.port === 465,
            user: d.user || d.fromEmail,
            pass: d.pass,
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Mailbox SMTP terhubung");
      setSmtp(EMPTY_SMTP);
      setConnectOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghubungkan SMTP"),
  });

  const connectEsp = useMutation({
    mutationFn: async (d: { fromEmail: string; fromName: string }) =>
      readLegacy(
        await fetch("/api/tenant/mailboxes/esp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromEmail: d.fromEmail, fromName: d.fromName || undefined }),
        }),
      ),
    onSuccess: () => {
      toast.success("Mailbox platform (ESP) terhubung");
      setEsp({ fromEmail: "", fromName: "" });
      setConnectOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghubungkan ESP"),
  });

  const disconnect = useMutation({
    mutationFn: async (m: MailboxRow) =>
      readLegacy(
        await fetch("/api/tenant/mailboxes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id }),
        }),
      ),
    onSuccess: (_res, m) => {
      toast.success(`"${m.fromEmail}" diputuskan`);
      setDisconnectTarget(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memutus mailbox");
      setDisconnectTarget(null);
    },
  });

  const anyQuickConnect = providers.google || providers.microsoft || providers.esp;

  return (
    <div>
      <PageHeader
        title="Mailbox"
        description="Identitas pengirim email yang terhubung — SMTP app-password, Gmail / Microsoft 365 (OAuth), atau platform ESP. Cadence & blast email dikirim atas nama akun ini, dengan suppression + unsubscribe."
      >
        {data && (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Inbox className="h-3 w-3" />
            </span>
            <span className="font-medium text-foreground/80">{stats.count}</span> mailbox
          </span>
        )}
        {canManage && data && (
          <Button size="sm" onClick={() => setConnectOpen(true)}>
            <Plug className="h-4 w-4" /> Hubungkan mailbox
          </Button>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Mailbox terhubung"
            value={configQ.isLoading ? null : stats.count}
            hint={`${stats.active} aktif`}
            icon={<Mail className="h-[18px] w-[18px]" />}
            iconClass="bg-primary/[0.12] text-primary"
          />
          <StatCard
            label="Terkirim hari ini"
            value={configQ.isLoading ? null : stats.sentToday}
            hint="Asia/Jakarta · reset tiap hari"
            icon={<Send className="h-[18px] w-[18px]" />}
            iconClass="bg-tertiary/[0.12] text-tertiary"
          />
          <StatCard
            label="Kapasitas harian"
            value={configQ.isLoading ? null : stats.capacity}
            hint="total limit semua mailbox"
            icon={<Gauge className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(38 92% 50% / .15)", color: "#d97706" }}
          />
          <StatCard
            label="Sisa kuota"
            value={configQ.isLoading ? null : Math.max(0, stats.capacity - stats.sentToday)}
            hint="bisa dikirim hari ini"
            icon={<ShieldCheck className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "#25D36618", color: "#1faa52" }}
          />
        </section>

        {/* ============ MAILBOX LIST ============ */}
        {configQ.isLoading ? (
          <ListLoading />
        ) : configQ.isError ? (
          <ErrorState
            title={forbidden ? "Tidak punya akses" : "Gagal memuat mailbox"}
            description={
              forbidden
                ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin tenant."
                : "Tidak bisa mengambil daftar mailbox. Pastikan kamu login & database tersedia."
            }
            onRetry={() => configQ.refetch()}
          />
        ) : mailboxes.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Belum ada mailbox terhubung"
            description="Hubungkan identitas pengirim — Gmail / Outlook (OAuth), SMTP app-password, atau platform ESP — supaya cadence & blast email bisa terkirim atas namamu."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setConnectOpen(true)}>
                  <Plug className="h-4 w-4" /> Hubungkan mailbox
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card className="overflow-hidden shadow-soft">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-primary" /> Identitas pengirim
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {fmtInt(stats.sentToday)} / {fmtInt(stats.capacity)} hari ini
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {mailboxes.map((m) => (
                  <MailboxItem
                    key={m.id}
                    mailbox={m}
                    canManage={canManage}
                    onDisconnect={() => setDisconnectTarget(m)}
                    disconnecting={disconnect.isPending && disconnect.variables?.id === m.id}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ============ PROVIDER WIRING NOTE ============ */}
        {data && !anyQuickConnect && (
          <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            Connect cepat (Gmail/Outlook OAuth atau platform ESP) belum aktif — isi{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-foreground">
              GOOGLE_OAUTH_*
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-foreground">
              MICROSOFT_OAUTH_*
            </code>
            , atau{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-foreground">
              RESEND_API_KEY
            </code>{" "}
            di <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-foreground">.env.local</code>.
            SMTP app-password tetap bisa dipakai.
          </p>
        )}

        {!canManage && data && (
          <p className="text-[11px] text-muted-foreground">
            Kamu bisa melihat mailbox tenant, tapi hanya Owner/Admin/anggota dengan izin
            yang bisa menghubungkan atau memutus mailbox.
          </p>
        )}

        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Grain: <b>mailbox = per-tenant</b>. &quot;Terkirim hari ini&quot; dihitung dari log kirim
          (hari Asia/Jakarta) agar cocok dengan batas yang ditegakkan worker pengiriman. Memutus
          mailbox menghentikan pengiriman lewat akun itu — job terjadwal yang memakainya akan gagal.
        </p>
      </div>

      {/* ===================== CONNECT DRAWER ===================== */}
      <Sheet open={connectOpen} onOpenChange={(o) => !connectSmtp.isPending && !connectEsp.isPending && setConnectOpen(o)}>
        <SheetContent side="right" className="flex w-[440px] max-w-full flex-col p-0">
          <SheetHeader className="flex-row items-center gap-3 border-b border-border p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <Plug className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm font-bold">Hubungkan mailbox</SheetTitle>
              <p className="truncate text-[11px] text-muted-foreground">
                OAuth cepat, SMTP app-password, atau platform ESP
              </p>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {/* (1) Quick OAuth / ESP — only the wired paths show a button */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-tertiary" /> Connect cepat
              </h3>
              {providers.google || providers.microsoft ? (
                <div className="flex flex-wrap gap-2">
                  {providers.google && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.location.href = "/api/mailboxes/oauth/google/start";
                      }}
                    >
                      <Mail className="h-4 w-4" style={{ color: "#EA4335" }} /> Connect Gmail
                    </Button>
                  )}
                  {providers.microsoft && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.location.href = "/api/mailboxes/oauth/microsoft/start";
                      }}
                    >
                      <Mail className="h-4 w-4" style={{ color: "#0078D4" }} /> Connect Outlook
                    </Button>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                  OAuth Gmail/Outlook belum aktif (isi{" "}
                  <code className="rounded bg-muted px-1 text-[10px] font-semibold text-foreground">
                    GOOGLE_OAUTH_*
                  </code>{" "}
                  /{" "}
                  <code className="rounded bg-muted px-1 text-[10px] font-semibold text-foreground">
                    MICROSOFT_OAUTH_*
                  </code>
                  ). Pakai SMTP di bawah.
                </p>
              )}
            </div>

            {/* (2) Platform ESP */}
            {providers.esp && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-tertiary" /> Email platform (ESP)
                </h3>
                <div className="space-y-2">
                  <Field label="From email">
                    <Input
                      type="email"
                      value={esp.fromEmail}
                      onChange={(e) => setEsp({ ...esp, fromEmail: e.target.value })}
                      placeholder="nama@domain-terverifikasi.co.id"
                    />
                  </Field>
                  <Field label="From name (opsional)">
                    <Input
                      value={esp.fromName}
                      onChange={(e) => setEsp({ ...esp, fromName: e.target.value })}
                      placeholder="Tim Sales"
                    />
                  </Field>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!esp.fromEmail.trim() || connectEsp.isPending}
                    onClick={() => connectEsp.mutate(esp)}
                  >
                    {connectEsp.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Menghubungkan…
                      </>
                    ) : (
                      "Pakai email platform"
                    )}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    From email harus berada di domain yang terverifikasi di ESP.
                  </p>
                </div>
              </div>
            )}

            {/* (3) SMTP app-password — always available */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Mail className="h-3.5 w-3.5 text-primary" /> SMTP (app-password)
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="From email" className="col-span-2">
                  <Input
                    type="email"
                    value={smtp.fromEmail}
                    onChange={(e) =>
                      setSmtp((s) => ({
                        ...s,
                        fromEmail: e.target.value,
                        user: s.user || e.target.value,
                      }))
                    }
                    placeholder="nama@gmail.com"
                  />
                </Field>
                <Field label="From name (opsional)" className="col-span-2">
                  <Input
                    value={smtp.fromName}
                    onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })}
                    placeholder="Tim Sales"
                  />
                </Field>
                <Field label="SMTP host">
                  <Input
                    value={smtp.host}
                    onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  />
                </Field>
                <Field label="Port">
                  <Input
                    type="number"
                    value={smtp.port}
                    onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="SMTP user">
                  <Input
                    value={smtp.user}
                    onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                    placeholder="nama@gmail.com"
                  />
                </Field>
                <Field label="App password">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={smtp.pass}
                    onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
                  />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Port 465 = SSL, 587 = STARTTLS. Password disimpan terenkripsi (AES-256-GCM) di
                server.
              </p>
            </div>
          </div>

          <SheetFooter className="flex-row gap-2.5 border-t border-border p-5">
            <button
              type="button"
              disabled={connectSmtp.isPending || connectEsp.isPending}
              onClick={() => setConnectOpen(false)}
              className="h-9 flex-1 rounded-lg border border-border bg-card text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-60"
            >
              Batal
            </button>
            <Button
              className="flex-1"
              disabled={
                !smtp.fromEmail.trim() ||
                !smtp.host.trim() ||
                !smtp.pass.trim() ||
                connectSmtp.isPending
              }
              onClick={() => connectSmtp.mutate(smtp)}
            >
              {connectSmtp.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Menghubungkan…
                </>
              ) : (
                <>
                  <Plug className="h-4 w-4" /> Connect SMTP
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ===================== DISCONNECT CONFIRM ===================== */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget && !disconnect.isPending) setDisconnectTarget(null);
        }}
        className={cn(
          "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
          disconnectTarget ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          className={cn(
            "w-full max-w-sm rounded-lg border border-destructive/30 bg-card p-5 shadow-soft transition-all duration-200",
            disconnectTarget ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-destructive">Putuskan mailbox ini?</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {disconnectTarget?.fromName ? `${disconnectTarget.fromName} · ` : ""}
                  {disconnectTarget?.fromEmail}
                </span>{" "}
                akan dilepas. Pengiriman email lewat akun ini berhenti, dan job terjadwal yang
                memakainya akan gagal.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={disconnect.isPending}
              onClick={() => setDisconnectTarget(null)}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={disconnect.isPending}
              onClick={() => disconnectTarget && disconnect.mutate(disconnectTarget)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disconnect.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Memutus…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Ya, putuskan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  icon,
  iconClass,
  iconStyle,
}: {
  label: string;
  value: number | null;
  hint: string;
  icon: React.ReactNode;
  iconClass?: string;
  iconStyle?: React.CSSProperties;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {value == null ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="mt-1 truncate text-2xl font-bold tabular-nums">{fmtInt(value)}</p>
          )}
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconClass,
          )}
          style={iconStyle}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function MailboxItem({
  mailbox,
  canManage,
  onDisconnect,
  disconnecting,
}: {
  mailbox: MailboxRow;
  canManage: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const meta = typeMeta(mailbox.type);
  const Icon = meta.icon;
  const used = pctOf(mailbox.sentToday, mailbox.dailyLimit);
  const near = used >= 80;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${meta.dot}1f`, color: meta.dot }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {mailbox.fromName ? `${mailbox.fromName} · ` : ""}
            {mailbox.fromEmail}
          </p>
          <Badge
            className={cn(
              "gap-1",
              STATUS_CLS[mailbox.status] ?? "bg-muted text-muted-foreground",
            )}
          >
            {mailbox.status === "active" && <Check className="h-3 w-3" />}
            {mailbox.status}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
            {meta.label}
          </span>
          <span className="text-[11px] text-muted-foreground">·</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${used}%`,
                  background: near ? "var(--warning, #F59E0B)" : meta.dot,
                }}
              />
            </div>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                near ? "font-medium text-warning" : "text-muted-foreground",
              )}
            >
              {fmtInt(mailbox.sentToday)}/{fmtInt(mailbox.dailyLimit)} hari ini
            </span>
          </div>
        </div>
      </div>
      {canManage && (
        <Button
          variant="ghost"
          size="icon"
          disabled={disconnecting}
          onClick={onDisconnect}
          aria-label="Putuskan mailbox"
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          {disconnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      )}
    </li>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {withFieldId(children, id)}
    </div>
  );
}

function ListLoading() {
  return (
    <Card className="overflow-hidden shadow-soft">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

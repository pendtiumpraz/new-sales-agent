"use client";

// Kepatuhan UU PDP — Module 8 FRONTEND (Settings cluster · Sainskerta Loop Phase
// 04). Wired to the NEW M8 settings backend (no mock data):
//   - GET   /api/settings/compliance → the tenant's compliance flags/values,
//     stored in `tenant_settings` under the `compliance.` namespace (key/value).
//     data.read.
//   - PATCH /api/settings/compliance → bulk-set { settings: { key: value } } (or a
//     single { key, value }). tenant.settings.manage.
//
// The compliance SCORE is NOT stored server-side and is NOT fabricated: it is
// derived deterministically from the saved settings (each control carries a weight;
// boolean controls score when on, value controls score when filled). So the gauge
// always reflects the real `tenant_settings` state for this tenant.
//
// Matches the established design system (Coral Sunset, the (app) shell, PageHeader +
// cards + shared Error states) and renders inside the shared Settings sub-nav
// (app/(app)/settings/layout.tsx). Every band has loading + empty + error states.
// Page-level guard mirrors the nav (DPO roles); the write controls are additionally
// gated to tenant.settings.manage.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { RequireRole } from "@/components/auth/require-role";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { can, mapDemoRole, type Role } from "@/lib/rbac/permissions";

// ── NEW M8 envelope ({ ok, data }) ──────────────────────────────────────────
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

/** The compliance settings come back as a flat key→value map (the `compliance.`
 *  prefix already stripped by the service). Values are JSON blobs — for our
 *  controls they're booleans or short strings. */
type ComplianceSettings = Record<string, unknown>;

/** Read the NEW M8 envelope. 403 → "forbidden" sentinel for the access state. */
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

// ── control catalog — each maps to ONE key in `tenant_settings` (compliance.*) ──
// `weight` feeds the derived score; the sum of all weights is normalised to 100.
interface ToggleControl {
  kind: "toggle";
  key: string;
  label: string;
  desc: string;
  weight: number;
}
interface SelectControl {
  kind: "select";
  key: string;
  label: string;
  desc: string;
  weight: number;
  options: { value: string; label: string }[];
  /** A select "scores" when its value is non-empty (a deliberate choice made). */
}
interface TextControl {
  kind: "text";
  key: string;
  label: string;
  desc: string;
  weight: number;
  placeholder: string;
}
type Control = ToggleControl | SelectControl | TextControl;

interface ControlGroup {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: "primary" | "tertiary" | "info";
  controls: Control[];
}

const GROUPS: ControlGroup[] = [
  {
    id: "consent",
    title: "Persetujuan & legalitas pemrosesan",
    desc: "Dasar hukum pemrosesan data pribadi (UU PDP No. 27/2022 Pasal 20).",
    icon: ShieldCheck,
    tone: "primary",
    controls: [
      {
        kind: "toggle",
        key: "consent_required",
        label: "Wajib persetujuan eksplisit",
        desc: "Kontak baru tidak bisa di-outreach sebelum ada persetujuan tercatat.",
        weight: 14,
      },
      {
        kind: "toggle",
        key: "double_optin",
        label: "Double opt-in",
        desc: "Konfirmasi ganda (mis. tautan verifikasi) sebelum persetujuan dianggap sah.",
        weight: 8,
      },
      {
        kind: "toggle",
        key: "consent_log_immutable",
        label: "Jejak persetujuan immutable",
        desc: "Setiap opt-in mencatat timestamp + sumber dan tidak bisa diubah.",
        weight: 10,
      },
    ],
  },
  {
    id: "rights",
    title: "Hak subjek data",
    desc: "Hak akses, koreksi, dan penghapusan (right-to-be-forgotten).",
    icon: UserCog,
    tone: "tertiary",
    controls: [
      {
        kind: "toggle",
        key: "dsar_enabled",
        label: "Layani permintaan subjek data (DSAR)",
        desc: "Aktifkan alur ekspor & hapus data atas permintaan subjek.",
        weight: 12,
      },
      {
        kind: "toggle",
        key: "dsar_auto_ack",
        label: "Auto-acknowledge DSAR",
        desc: "Kirim tanda terima otomatis saat permintaan masuk (SLA 3×24 jam).",
        weight: 6,
      },
      {
        kind: "select",
        key: "retention_window",
        label: "Periode retensi data",
        desc: "Data pribadi non-aktif dihapus otomatis setelah periode ini.",
        weight: 10,
        options: [
          { value: "", label: "Belum ditentukan" },
          { value: "12m", label: "12 bulan" },
          { value: "24m", label: "24 bulan" },
          { value: "36m", label: "36 bulan" },
          { value: "forever", label: "Tanpa batas (tidak disarankan)" },
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Keamanan & residensi data",
    desc: "Kontrol teknis & organisasi yang melindungi data pribadi.",
    icon: Lock,
    tone: "info",
    controls: [
      {
        kind: "toggle",
        key: "encryption_at_rest",
        label: "Enkripsi at-rest (AES-256)",
        desc: "Data pelanggan terenkripsi saat disimpan. Konfirmasikan kontrol aktif.",
        weight: 12,
      },
      {
        kind: "toggle",
        key: "breach_notification",
        label: "Prosedur notifikasi pelanggaran",
        desc: "Ada SOP lapor 3×24 jam ke Lembaga PDP + subjek bila terjadi kebocoran.",
        weight: 8,
      },
      {
        kind: "select",
        key: "data_residency",
        label: "Residensi data",
        desc: "Lokasi penyimpanan utama data pelanggan.",
        weight: 8,
        options: [
          { value: "", label: "Belum ditentukan" },
          { value: "id-jakarta", label: "Indonesia — AWS Jakarta (ap-southeast-3)" },
          { value: "sg", label: "Singapura (ap-southeast-1)" },
          { value: "other", label: "Lainnya / multi-region" },
        ],
      },
    ],
  },
  {
    id: "governance",
    title: "Tata kelola",
    desc: "Akuntabilitas pengendali data (data controller).",
    icon: FileText,
    tone: "primary",
    controls: [
      {
        kind: "text",
        key: "dpo_name",
        label: "Petugas Pelindungan Data (DPO)",
        desc: "Nama/kontak DPO yang ditunjuk — wajib bila memproses data skala besar.",
        weight: 4,
        placeholder: "mis. Andi Hidayat — dpo@perusahaan.id",
      },
      {
        kind: "text",
        key: "policy_version",
        label: "Versi kebijakan privasi",
        desc: "Versi kebijakan yang berlaku saat ini (ditautkan ke jejak persetujuan).",
        weight: 4,
        placeholder: "mis. v2.1",
      },
    ],
  },
];

const ALL_CONTROLS: Control[] = GROUPS.flatMap((g) => g.controls);
const TOTAL_WEIGHT = ALL_CONTROLS.reduce((s, c) => s + c.weight, 0);

// ── draft model (string-friendly so toggles, selects & text share one store) ──
type Draft = Record<string, boolean | string>;

/** Seed a draft from the server map, coercing each control to its kind. */
function settingsToDraft(s: ComplianceSettings): Draft {
  const d: Draft = {};
  for (const c of ALL_CONTROLS) {
    const raw = s[c.key];
    if (c.kind === "toggle") d[c.key] = raw === true || raw === "true";
    else d[c.key] = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
  return d;
}

/** Whether a single control "counts" toward the score. */
function controlMet(c: Control, d: Draft): boolean {
  if (c.kind === "toggle") return d[c.key] === true;
  const v = d[c.key];
  // a select/text scores when a real, non-empty choice is made (and not "forever")
  return typeof v === "string" && v.trim() !== "" && v !== "forever";
}

/** Derived compliance score 0..100 — sum of met-control weights, normalised. */
function scoreOf(d: Draft): number {
  const got = ALL_CONTROLS.reduce((s, c) => s + (controlMet(c, d) ? c.weight : 0), 0);
  return TOTAL_WEIGHT === 0 ? 0 : Math.round((got / TOTAL_WEIGHT) * 100);
}

function scoreTone(score: number): { label: string; text: string; stroke: string } {
  if (score >= 85) return { label: "Sangat baik", text: "text-success", stroke: "#10B981" };
  if (score >= 60) return { label: "Cukup", text: "text-warning", stroke: "#F59E0B" };
  return { label: "Perlu perbaikan", text: "text-danger", stroke: "#EF4444" };
}

// ── page (guard wrapper) ─────────────────────────────────────────────────────
export default function CompliancePage() {
  // Compliance is a per-controller obligation → open to the DPO roles
  // (Owner / Admin / Manager), mirroring the Settings sub-nav gate.
  return (
    <RequireRole
      allow={["Superadmin", "Admin", "Sales Manager"]}
      message="Halaman kepatuhan untuk DPO (Owner / Admin / Manajer)."
    >
      <CompliancePageInner />
    </RequireRole>
  );
}

function CompliancePageInner() {
  const qc = useQueryClient();
  const { data: session } = useSession();

  // Session role may be the canonical RBAC role (real auth) or a demo display role;
  // map either onto a canonical Role before gating the write controls.
  const role: Role = useMemo(() => {
    const raw = session?.user?.role;
    if (!raw) return "member";
    if ((["superadmin", "tenant_owner", "tenant_admin", "member"] as const).includes(raw as Role)) {
      return raw as Role;
    }
    return mapDemoRole(raw);
  }, [session?.user?.role]);
  const canManage = can(role, "tenant.settings.manage");

  const settingsQ = useQuery({
    queryKey: ["settings", "compliance"],
    queryFn: async () => readJson<ComplianceSettings>(await fetch("/api/settings/compliance")),
    retry: false,
  });

  const forbidden =
    settingsQ.error instanceof Error && settingsQ.error.message === "forbidden";

  // Local editable draft, seeded once the server map arrives.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);

  // Re-seed whenever a fresh server snapshot lands (initial load + post-save), but
  // never clobber an in-progress edit.
  useEffect(() => {
    if (settingsQ.data && (!draft || !dirty)) {
      setDraft(settingsToDraft(settingsQ.data));
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQ.data]);

  function set(key: string, value: boolean | string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setDirty(true);
  }

  // Bulk-save the whole draft (idempotent upsert per key, server-side).
  const save = useMutation({
    mutationFn: async (d: Draft) =>
      readJson<ComplianceSettings>(
        await fetch("/api/settings/compliance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: d }),
        }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(["settings", "compliance"], data);
      setDraft(settingsToDraft(data));
      setDirty(false);
      toast.success("Pengaturan kepatuhan tersimpan");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan pengaturan"),
  });

  // Reset = discard local edits back to the last saved server snapshot.
  function discard() {
    if (settingsQ.data) {
      setDraft(settingsToDraft(settingsQ.data));
      setDirty(false);
      toast.success("Perubahan dibatalkan");
    }
  }

  const score = useMemo(() => (draft ? scoreOf(draft) : 0), [draft]);
  const savedScore = useMemo(
    () => (settingsQ.data ? scoreOf(settingsToDraft(settingsQ.data)) : 0),
    [settingsQ.data],
  );
  const metCount = useMemo(
    () => (draft ? ALL_CONTROLS.filter((c) => controlMet(c, draft)).length : 0),
    [draft],
  );

  return (
    <div>
      <PageHeader
        title="Kepatuhan UU PDP"
        description="Atur kontrol kepatuhan UU PDP No. 27/2022 — persetujuan, hak subjek data, keamanan, & tata kelola. Pengaturan tersimpan per-tenant; skor dihitung dari kontrol yang aktif."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/compliance/dsar">
            <Download className="h-4 w-4" /> Export data (DSAR)
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {settingsQ.isError ? (
          <ErrorState
            title={forbidden ? "Tidak punya akses" : "Gagal memuat kepatuhan"}
            description={
              forbidden
                ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin tenant."
                : "Tidak bisa mengambil pengaturan kepatuhan. Pastikan kamu login & database tersedia."
            }
            onRetry={() => settingsQ.refetch()}
          />
        ) : settingsQ.isLoading || !draft ? (
          <ComplianceSkeleton />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-3">
            {/* ============ CONTROL GROUPS (2/3) ============ */}
            <div className="space-y-5 lg:col-span-2">
              {!canManage && (
                <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/[0.08] px-4 py-3 text-[13px]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span className="text-muted-foreground">
                    Akun kamu hanya bisa <b className="text-foreground">melihat</b> kontrol kepatuhan.
                    Untuk mengubah, butuh izin <b>tenant.settings.manage</b> (Owner / Admin).
                  </span>
                </div>
              )}

              {GROUPS.map((group) => (
                <ControlGroupCard
                  key={group.id}
                  group={group}
                  draft={draft}
                  disabled={!canManage}
                  onSet={set}
                />
              ))}

              <p className="text-[11px] text-muted-foreground">
                Setiap kontrol tersimpan sebagai satu baris di{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">tenant_settings</code>{" "}
                (namespace <code className="rounded bg-muted px-1 py-0.5 text-[10px]">compliance.*</code>),
                grain = tenant. Skor di panel kanan dihitung langsung dari kontrol yang aktif —
                bukan angka statis.
              </p>
            </div>

            {/* ============ SCORE + ACTIONS (1/3, sticky) ============ */}
            <div className="space-y-5 lg:sticky lg:top-[88px]">
              <ScoreCard
                score={score}
                savedScore={savedScore}
                metCount={metCount}
                totalCount={ALL_CONTROLS.length}
                dirty={dirty}
              />

              {/* Trust facts — static platform context, clearly labelled */}
              <section className="space-y-2.5 rounded-lg border border-border bg-card p-4 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Konteks platform
                </p>
                <TrustRow icon={Lock} label="Enkripsi" value="AES-256 at-rest & in-transit" />
                <TrustRow icon={Server} label="Region default" value="ap-southeast-3 (Jakarta)" />
                <TrustRow icon={Database} label="Immutable log" value="Jejak persetujuan & audit" />
              </section>

              {/* Save / discard */}
              {canManage && (
                <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
                  {dirty && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Ada perubahan belum disimpan.
                    </div>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!dirty || save.isPending}
                    onClick={() => draft && save.mutate(draft)}
                  >
                    {save.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Simpan perubahan
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={!dirty || save.isPending}
                    onClick={discard}
                  >
                    <RotateCcw className="h-4 w-4" /> Batalkan perubahan
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Perubahan berlaku se-tenant. Setiap simpan tercatat di jejak audit.
                  </p>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function ControlGroupCard({
  group,
  draft,
  disabled,
  onSet,
}: {
  group: ControlGroup;
  draft: Draft;
  disabled: boolean;
  onSet: (key: string, value: boolean | string) => void;
}) {
  const Icon = group.icon;
  const tonePalette =
    group.tone === "primary"
      ? "bg-primary/[0.12] text-primary"
      : group.tone === "tertiary"
        ? "bg-tertiary/[0.12] text-tertiary"
        : "bg-info/[0.12] text-info";
  const met = group.controls.filter((c) => controlMet(c, draft)).length;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tonePalette)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{group.title}</h2>
          <p className="text-[11px] text-muted-foreground">{group.desc}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {met}/{group.controls.length}
        </span>
      </div>

      <div className="divide-y divide-border">
        {group.controls.map((c) => (
          <ControlRow key={c.key} control={c} draft={draft} disabled={disabled} onSet={onSet} />
        ))}
      </div>
    </section>
  );
}

function ControlRow({
  control,
  draft,
  disabled,
  onSet,
}: {
  control: Control;
  draft: Draft;
  disabled: boolean;
  onSet: (key: string, value: boolean | string) => void;
}) {
  const met = controlMet(control, draft);
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors",
          met ? "text-success" : "text-muted-foreground/40",
        )}
        aria-hidden
      >
        <CheckCircle2 className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{control.label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{control.desc}</p>

        {control.kind === "select" && (
          <div className="relative mt-2 w-full max-w-xs">
            <select
              value={String(draft[control.key] ?? "")}
              disabled={disabled}
              onChange={(e) => onSet(control.key, e.target.value)}
              className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {control.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}

        {control.kind === "text" && (
          <input
            type="text"
            value={String(draft[control.key] ?? "")}
            disabled={disabled}
            onChange={(e) => onSet(control.key, e.target.value)}
            placeholder={control.placeholder}
            className="mt-2 h-9 w-full max-w-sm rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
        )}
      </div>

      {control.kind === "toggle" && (
        <Switch
          checked={draft[control.key] === true}
          disabled={disabled}
          onCheckedChange={(v) => onSet(control.key, v)}
          aria-label={control.label}
          className="mt-0.5 shrink-0"
        />
      )}
    </div>
  );
}

function ScoreCard({
  score,
  savedScore,
  metCount,
  totalCount,
  dirty,
}: {
  score: number;
  savedScore: number;
  metCount: number;
  totalCount: number;
  dirty: boolean;
}) {
  const tone = scoreTone(score);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <div className="border-b border-border bg-gradient-to-r from-success/12 via-tertiary/8 to-primary/8 px-5 py-3.5">
        <p className="text-sm font-semibold">Skor kepatuhan</p>
        <p className="text-[11px] text-muted-foreground">UU PDP No. 27/2022</p>
      </div>
      <div className="flex flex-col items-center px-5 py-6">
        <ScoreGauge score={score} stroke={tone.stroke} />
        <p className={cn("mt-3 flex items-center gap-1.5 text-sm font-medium", tone.text)}>
          <ShieldCheck className="h-4 w-4" />
          {tone.label}
        </p>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          <b className="text-foreground">{metCount}</b> dari {totalCount} kontrol aktif
        </p>
        {dirty && score !== savedScore && (
          <p className="mt-2 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Tersimpan: {savedScore} · belum disimpan
          </p>
        )}
      </div>
    </section>
  );
}

function ScoreGauge({ score, stroke }: { score: number; stroke: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative h-36 w-36">
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-success/15 via-tertiary/8 to-primary/10 blur-xl" />
      <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(20 80% 95%)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color: stroke }}>
          {score}
        </span>
        <span className="text-[11px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function TrustRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <p className="truncate text-[12px] font-medium text-foreground/80">{value}</p>
      </div>
    </div>
  );
}

function ComplianceSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-lg" />
        ))}
      </div>
      <div className="space-y-5">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Inline chevron (avoids pulling another icon import for one caret). */
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

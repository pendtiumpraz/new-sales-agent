"use client";

// AI provider settings — Module 8 FRONTEND (Settings cluster · Sainskerta Loop
// Phase 04). Wired to the NEW M8 backend (no mock data):
//   - GET   /api/settings/ai   → { ok, data: AiConfig } — global model/provider
//     catalog (the SAME tables lib/ai/registry resolves), this tenant's ONE active
//     model, per-provider BYOK key status (hasTenantKey / hasPlatformKey), and the
//     current-month usage rollup (tokens in/out · cost · calls).
//   - PATCH /api/settings/ai   → set the tenant active model. Body { modelId }.
// BYOK key entry reuses the existing infra route that writes `ai_credential`
// (encrypted, AES-256-GCM via lib/ai/crypto) — the new config read already surfaces
// the resulting hasTenantKey, so the two compose cleanly:
//   - POST   /api/tenant/ai/credentials  { providerId, apiKey } → save/replace
//   - DELETE /api/tenant/ai/credentials  { providerId }         → remove
//
// Matches the established design system (Coral Sunset, the (app) shell, PageHeader +
// cards + shared Error/Empty states) and renders inside the shared Settings sub-nav
// (app/(app)/settings/layout.tsx). Every band has loading + empty + error states.
// Manage controls (set-active + BYOK) are gated to tenant.settings.manage.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  Check,
  Coins,
  Cpu,
  Gauge,
  KeyRound,
  Loader2,
  Server,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Row from GET /api/settings/ai · models (lib/db · ai_model). */
interface ModelRow {
  id: string;
  providerId: string;
  modelId: string; // API string, e.g. deepseek-chat
  displayName: string;
  contextWindow: number | null;
  priceInPer1m: number | null;
  priceOutPer1m: number | null;
  capabilities: string[];
  isAvailable: boolean;
}

/** Row from GET /api/settings/ai · providers (composed: catalog + key status). */
interface ProviderRow {
  id: string;
  key: string;
  displayName: string;
  hasPlatformKey: boolean;
  hasTenantKey: boolean;
}

interface UsageRollup {
  tokensIn: number;
  tokensOut: number;
  cost: number;
  calls: number;
}

type AiMode = "platform" | "byoa";

interface AiConfig {
  models: ModelRow[];
  providers: ProviderRow[];
  activeModelId: string | null;
  usage: UsageRollup | null;
  aiMode: AiMode;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read the NEW M8 envelope. 403 → "forbidden" sentinel for the access state. */
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

/** The existing-infra credentials route uses the LEGACY envelope ({ ok } / { error }),
 *  not { ok, data } — so it gets its own reader. */
async function readLegacy(r: Response): Promise<void> {
  const j = (await r.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error(j?.error || "Permintaan gagal");
  }
}

const fmtCtx = (n: number | null): string =>
  n == null ? "—" : n >= 1_000_000 ? `${n / 1_000_000}M ctx` : `${Math.round(n / 1000)}K ctx`;

const fmtPrice = (pin: number | null, pout: number | null): string =>
  pin == null || pout == null ? "harga belum diisi" : `$${pin} / $${pout} per 1M`;

function fmtInt(n: number): string {
  return Number(n).toLocaleString("id-ID");
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AiSettingsPage() {
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
  const canManage = can(role, "tenant.settings.manage");

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings", "ai"] });

  const configQ = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: async () => readJson<AiConfig>(await fetch("/api/settings/ai")),
    retry: false,
  });

  const data = configQ.data;
  const usage = data?.usage ?? null;
  const forbidden = configQ.error instanceof Error && configQ.error.message === "forbidden";

  // BYOK key drafts, keyed by providerId.
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  // ── mutations ──────────────────────────────────────────────────────────────
  const setActive = useMutation({
    mutationFn: async (modelId: string) =>
      readJson<{ activeModelId: string }>(
        await fetch("/api/settings/ai", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId }),
        }),
      ),
    onSuccess: () => {
      toast.success("Model aktif diperbarui — berlaku untuk seluruh tenant");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah model aktif"),
  });

  // Source-of-AI mode (BYOA, Fase 2): platform DeepSeek vs the tenant's own agent.
  const setMode = useMutation({
    mutationFn: async (aiMode: AiMode) =>
      readJson<{ aiMode: AiMode }>(
        await fetch("/api/settings/ai", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiMode }),
        }),
      ),
    onSuccess: (res) => {
      toast.success(
        res.aiMode === "byoa"
          ? "Sumber AI: Agent saya (BYOA) — generasi dialihkan ke agent tenant"
          : "Sumber AI: Platform DeepSeek",
      );
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah sumber AI"),
  });

  // BYOK save → existing infra route that writes the encrypted ai_credential row.
  const saveKey = useMutation({
    mutationFn: async (providerId: string) => {
      const apiKey = (keyDrafts[providerId] ?? "").trim();
      if (!apiKey) throw new Error("API key kosong");
      await readLegacy(
        await fetch("/api/tenant/ai/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, apiKey }),
        }),
      );
    },
    onSuccess: (_res, providerId) => {
      toast.success("API key tersimpan (terenkripsi di server)");
      setKeyDrafts((s) => ({ ...s, [providerId]: "" }));
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan API key"),
  });

  const deleteKey = useMutation({
    mutationFn: async (providerId: string) =>
      readLegacy(
        await fetch("/api/tenant/ai/credentials", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId }),
        }),
      ),
    onSuccess: () => {
      toast.success("API key dihapus — kembali ke platform key (jika ada)");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus API key"),
  });

  const activeModel = useMemo(
    () => data?.models.find((m) => m.id === data.activeModelId) ?? null,
    [data],
  );
  const activeProvider = useMemo(
    () => (activeModel ? data?.providers.find((p) => p.id === activeModel.providerId) ?? null : null),
    [data, activeModel],
  );

  return (
    <div>
      <PageHeader
        title="AI & Model"
        description="Pilih 1 model aktif untuk seluruh tenant (semua workspace memakai model yang sama), bawa API key sendiri (BYOK), dan pantau pemakaian bulan ini."
      >
        {activeModel && (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-3 w-3" />
            </span>
            Aktif:{" "}
            <span className="font-medium text-foreground/80">{activeModel.displayName}</span>
          </span>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ USAGE / CREDIT SUMMARY ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <UsageCard
            label="Panggilan AI"
            value={configQ.isLoading ? null : (usage?.calls ?? 0)}
            hint="bulan ini (Asia/Jakarta)"
            icon={<Gauge className="h-[18px] w-[18px]" />}
            iconClass="bg-primary/[0.12] text-primary"
          />
          <UsageCard
            label="Total token"
            value={configQ.isLoading ? null : ((usage?.tokensIn ?? 0) + (usage?.tokensOut ?? 0))}
            hint={
              usage
                ? `${fmtInt(usage.tokensIn)} in · ${fmtInt(usage.tokensOut)} out`
                : "in + out"
            }
            icon={<Coins className="h-[18px] w-[18px]" />}
            iconClass="bg-tertiary/[0.12] text-tertiary"
          />
          <UsageCard
            label="Estimasi biaya"
            value={configQ.isLoading ? null : usage?.cost ?? 0}
            render={(v) => `$${v.toFixed(4)}`}
            hint="USD · dihitung saat panggilan"
            icon={<Wallet className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "#25D36618", color: "#1faa52" }}
          />
          <UsageCard
            label="Model aktif"
            value={configQ.isLoading ? null : data?.activeModelId ? 1 : 0}
            render={() =>
              activeModel ? activeModel.displayName : data ? "Belum dipilih" : "—"
            }
            hint={
              activeProvider
                ? `${activeProvider.displayName}${activeProvider.hasTenantKey ? " · BYOK" : activeProvider.hasPlatformKey ? " · platform" : " · tanpa key"}`
                : "pilih 1 model di bawah"
            }
            icon={<Bot className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(38 92% 50% / .15)", color: "#d97706" }}
            valueClass={cn(!activeModel && "text-warning")}
          />
        </section>

        {/* ============ SUMBER AI (platform vs BYOA) ============ */}
        {data && (
          <AiModeCard
            mode={data.aiMode}
            canManage={canManage}
            pending={setMode.isPending}
            onSelect={(m) => {
              if (m !== data.aiMode) setMode.mutate(m);
            }}
          />
        )}

        {/* ============ PROVIDERS + MODELS ============ */}
        {configQ.isLoading ? (
          <ProvidersLoading />
        ) : configQ.isError ? (
          <ErrorState
            title={forbidden ? "Tidak punya akses" : "Gagal memuat konfigurasi AI"}
            description={
              forbidden
                ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin tenant."
                : "Tidak bisa mengambil katalog model & status key. Pastikan kamu login & database tersedia."
            }
            onRetry={() => configQ.refetch()}
          />
        ) : !data || data.providers.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Belum ada provider AI"
            description="Katalog provider & model diisi superadmin dari docs resmi tiap provider. Setelah itu kamu bisa memilih model aktif & menyetel BYOK di sini."
          />
        ) : (
          <div className="space-y-4">
            {data.providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                models={data.models.filter((m) => m.providerId === p.id && m.isAvailable)}
                activeModelId={data.activeModelId}
                canManage={canManage}
                keyDraft={keyDrafts[p.id] ?? ""}
                onKeyDraft={(v) => setKeyDrafts((s) => ({ ...s, [p.id]: v }))}
                onSaveKey={() => saveKey.mutate(p.id)}
                onDeleteKey={() => deleteKey.mutate(p.id)}
                onSetActive={(modelId) => setActive.mutate(modelId)}
                saving={saveKey.isPending && saveKey.variables === p.id}
                deleting={deleteKey.isPending && deleteKey.variables === p.id}
                settingActiveId={setActive.isPending ? (setActive.variables ?? null) : null}
              />
            ))}
          </div>
        )}

        {!canManage && data && (
          <p className="text-[11px] text-muted-foreground">
            Hanya Owner/Admin tenant yang bisa mengubah model aktif & API key (BYOK). Kamu tetap bisa
            melihat konfigurasi & pemakaian.
          </p>
        )}

        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Grain: <b>model aktif & BYOK = per-tenant</b> (semua workspace memakai model yang sama).
          API key BYOK disimpan terenkripsi (AES-256-GCM) di server — saat dipasang, key tenant
          dipakai menggantikan platform key. Pemakaian dirinci di Billing &amp; Kuota.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

/** Source-of-AI toggle (BYOA, Fase 2): platform DeepSeek vs the tenant's own agent. */
function AiModeCard({
  mode,
  canManage,
  pending,
  onSelect,
}: {
  mode: AiMode;
  canManage: boolean;
  pending: boolean;
  onSelect: (m: AiMode) => void;
}) {
  const options: {
    value: AiMode;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: "platform",
      title: "Platform DeepSeek",
      desc: "Balasan & analisis digenerate oleh model platform (DeepSeek) memakai kuota/BYOK tenant. Default.",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      value: "byoa",
      title: "Agent saya (BYOA)",
      desc: "Platform mengantre task; agent milikmu (pakai API key write-scope) menariknya, generate dengan modelmu sendiri, lalu kirim balik hasilnya.",
      icon: <Cpu className="h-4 w-4" />,
    },
  ];
  return (
    <Card className="overflow-hidden shadow-soft">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tertiary/[0.12] text-tertiary">
            <Server className="h-4 w-4" />
          </span>
          Sumber AI
        </CardTitle>
        <Badge variant="muted" className="gap-1">
          {mode === "byoa" ? "Agent saya (BYOA)" : "Platform DeepSeek"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const active = o.value === mode;
            return (
              <button
                key={o.value}
                type="button"
                disabled={!canManage || pending}
                onClick={() => onSelect(o.value)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition",
                  active
                    ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40"
                    : "border-border bg-card hover:border-primary/40",
                  (!canManage || pending) && "cursor-not-allowed opacity-70",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md",
                      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {o.icon}
                  </span>
                  <span className="text-sm font-medium text-foreground">{o.title}</span>
                  {active && (
                    <Badge className="ml-auto gap-1 bg-primary/15 text-primary">
                      <Check className="h-3 w-3" /> Aktif
                    </Badge>
                  )}
                </span>
                <span className="text-[11px] leading-relaxed text-muted-foreground">{o.desc}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {mode === "byoa" ? (
            <>
              Mode BYOA aktif untuk fitur async (mulai dari Autopilot). Agentmu butuh API key{" "}
              <b>write-scope</b> — buat &amp; kelola di{" "}
              <Link href="/settings/api-keys" className="font-medium text-primary hover:underline">
                Settings → API Keys
              </Link>
              . Poll <code className="rounded bg-muted px-1">POST /api/agent/tasks/claim</code>, generate,
              lalu <code className="rounded bg-muted px-1">POST /api/agent/tasks/&#123;id&#125;/result</code>.
            </>
          ) : (
            <>
              Ingin agent sendiri yang membalas? Pilih <b>Agent saya (BYOA)</b>, lalu siapkan API key
              write-scope di{" "}
              <Link href="/settings/api-keys" className="font-medium text-primary hover:underline">
                Settings → API Keys
              </Link>
              .
            </>
          )}
        </p>
        {!canManage && (
          <p className="text-[11px] text-warning">Hanya Owner/Admin tenant yang bisa mengubah sumber AI.</p>
        )}
      </CardContent>
    </Card>
  );
}

function UsageCard({
  label,
  value,
  hint,
  icon,
  iconClass,
  iconStyle,
  valueClass,
  render,
}: {
  label: string;
  value: number | null;
  hint: string;
  icon: React.ReactNode;
  iconClass?: string;
  iconStyle?: React.CSSProperties;
  valueClass?: string;
  /** Custom value formatter — defaults to id-ID integer. */
  render?: (v: number) => string;
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
            <p
              className={cn(
                "mt-1 truncate text-2xl font-bold tabular-nums",
                valueClass,
              )}
              title={render ? render(value) : fmtInt(value)}
            >
              {render ? render(value) : fmtInt(value)}
            </p>
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

function ProviderCard({
  provider,
  models,
  activeModelId,
  canManage,
  keyDraft,
  onKeyDraft,
  onSaveKey,
  onDeleteKey,
  onSetActive,
  saving,
  deleting,
  settingActiveId,
}: {
  provider: ProviderRow;
  models: ModelRow[];
  activeModelId: string | null;
  canManage: boolean;
  keyDraft: string;
  onKeyDraft: (v: string) => void;
  onSaveKey: () => void;
  onDeleteKey: () => void;
  onSetActive: (modelId: string) => void;
  saving: boolean;
  deleting: boolean;
  settingActiveId: string | null;
}) {
  const keyOk = provider.hasPlatformKey || provider.hasTenantKey;
  return (
    <Card className="overflow-hidden shadow-soft">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
            <Bot className="h-4 w-4" />
          </span>
          {provider.displayName}
        </CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {provider.hasTenantKey && (
            <Badge variant="muted" className="gap-1 text-emerald-700">
              <KeyRound className="h-3 w-3" /> BYOK
            </Badge>
          )}
          {provider.hasPlatformKey && (
            <Badge variant="muted" className="gap-1">
              <Sparkles className="h-3 w-3" /> Platform key
            </Badge>
          )}
          {!keyOk && (
            <Badge variant="muted" className="gap-1 text-warning">
              tanpa key
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {/* BYOK control — gated to manage */}
        {canManage ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-foreground/80">
              <KeyRound className="h-3.5 w-3.5 text-tertiary" />
              API key {provider.displayName} (BYOK)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                placeholder={
                  provider.hasTenantKey
                    ? "•••••••• tersimpan — isi untuk ganti"
                    : "Tempel API key (mis. sk-…)"
                }
                value={keyDraft}
                onChange={(e) => onKeyDraft(e.target.value)}
                className="h-9 min-w-[200px] flex-1 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!keyDraft.trim() || saving}
                onClick={onSaveKey}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}
              </Button>
              {provider.hasTenantKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={onDeleteKey}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Disimpan terenkripsi di server. Saat dipasang, key tenant ini menggantikan platform key
              untuk {provider.displayName}.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            Status key:{" "}
            <span className="font-medium text-foreground/70">
              {provider.hasTenantKey
                ? "BYOK (key tenant terpasang)"
                : provider.hasPlatformKey
                  ? "platform key"
                  : "belum ada key"}
            </span>
            . Hanya Owner/Admin yang bisa mengubahnya.
          </div>
        )}

        {/* Models */}
        {models.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
            Belum ada model tersedia untuk provider ini. Superadmin menambahkannya dari docs resmi
            provider.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {models.map((m) => {
              const active = m.id === activeModelId;
              const isSettingThis = settingActiveId === m.id;
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{m.displayName}</p>
                      {active && (
                        <Badge className="gap-1 bg-primary/15 text-primary">
                          <Check className="h-3 w-3" /> Aktif
                        </Badge>
                      )}
                      {m.capabilities.slice(0, 2).map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {m.modelId} · {fmtCtx(m.contextWindow)} ·{" "}
                      {fmtPrice(m.priceInPer1m, m.priceOutPer1m)}
                    </p>
                  </div>
                  {!active && canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={settingActiveId !== null}
                      onClick={() => onSetActive(m.id)}
                    >
                      {isSettingThis ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Mengaktifkan…
                        </>
                      ) : (
                        "Jadikan aktif"
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProvidersLoading() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="overflow-hidden shadow-soft">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((__, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

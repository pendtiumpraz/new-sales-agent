"use client";

// System Diagnostics page — accessible from Settings.
//
// Three cards:
//   1. "Status sistem"   — GET /api/diagnostics on mount; surfaces AI Gateway
//      credential / flag status, DB credential status (with detected env-var
//      KEY NAMES so the user can see exactly what Vercel injected), runtime
//      info, and the model identifiers actually wired in lib/ai/provider.ts.
//   2. "Tes AI langsung" — POST /api/diagnostics/ai-ping with one click;
//      renders latency, raw Deepseek response, and inline errors (status code +
//      message) when the Gateway throws. Always renders inline — the API
//      returns HTTP 200 even on error.
//   3. "Tes endpoint AI lainnya" — one-click probes against /api/chat,
//      /api/auto-reply, /api/kb-test, /api/autopilot/text. Surfaces the
//      `source` discriminator each route emits ("real" / "mock") so the user
//      can pinpoint which surface is mocking.
//
// All copy in Bahasa Indonesia. Semantic colors: green = ok, red = error,
// amber = warning, coral = primary.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  PlayCircle,
  Server,
  Sparkles,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { seedKnowledgeBase } from "@/lib/api-mock/kb";

// ── Types ─────────────────────────────────────────────────────────────────

interface DiagnosticsStatus {
  ai: {
    gatewayCredentialPresent: boolean;
    realAiFlagOn: boolean;
    modelChat: string;
    modelFast: string;
    ready: boolean;
  };
  db: {
    credentialPresent: boolean;
    detectedKeys: string[];
  };
  runtime: {
    node: string;
    env: string;
    region: string;
  };
}

interface AiPingResultOk {
  ok: true;
  source: "real";
  latencyMs: number;
  response: string;
  usage: unknown;
}

interface AiPingResultMock {
  ok: false;
  source: "mock";
  reason: string;
}

interface AiPingResultError {
  ok: false;
  source: "error";
  latencyMs: number;
  error: {
    message: string;
    statusCode?: number;
    causeMessage?: string;
  };
}

type AiPingResult = AiPingResultOk | AiPingResultMock | AiPingResultError;

type RouteSource = "real" | "mock" | "error";

interface RouteProbeResult {
  source: RouteSource;
  status: number;
  detail?: string;
  latencyMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: RouteSource }) {
  if (source === "real") {
    return (
      <Badge variant="default" className="bg-primary text-primary-foreground">
        real
      </Badge>
    );
  }
  if (source === "mock") {
    return <Badge variant="muted">mock</Badge>;
  }
  return (
    <Badge variant="destructive">
      error
    </Badge>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/diagnostics", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as DiagnosticsStatus;
        if (!cancelled) setStatus(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatusError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Status sistem"
        description="Verifikasi koneksi AI Gateway, database, dan endpoint runtime di lingkungan terdeploy."
      >
        <Button variant="outline" onClick={() => router.push("/settings")}>
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Pengaturan
        </Button>
      </PageHeader>

      <div className="space-y-6 p-6">
        <SystemStatusCard status={status} error={statusError} />
        <LiveAiPingCard />
        <EndpointProbesCard />
      </div>
    </div>
  );
}

// ── Card 1: System status ─────────────────────────────────────────────────

function SystemStatusCard({
  status,
  error,
}: {
  status: DiagnosticsStatus | null;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-info" />
          Status sistem
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Gagal memuat status: {error}
          </div>
        ) : !status ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <>
            <StatusRow
              icon={Sparkles}
              tone="primary"
              title="Deepseek AI Gateway"
              subtitle={
                status.ai.ready
                  ? "Kredensial Gateway terdeteksi dan flag aktif — panggilan AI berjalan secara real."
                  : !status.ai.gatewayCredentialPresent && !status.ai.realAiFlagOn
                    ? "Kredensial Gateway tidak ditemukan dan NEXT_PUBLIC_AI_PROVIDER ≠ 'deepseek'."
                    : !status.ai.gatewayCredentialPresent
                      ? "Kredensial Gateway (AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN) tidak tersedia di runtime."
                      : "Flag NEXT_PUBLIC_AI_PROVIDER ≠ 'deepseek' — semua route menggunakan mock."
              }
              right={
                status.ai.ready ? (
                  <OkPill label="Aktif (real)" />
                ) : (
                  <ErrorPill
                    label={
                      !status.ai.gatewayCredentialPresent
                        ? "Kredensial hilang"
                        : "Flag mati"
                    }
                  />
                )
              }
            />

            <StatusRow
              icon={Database}
              tone="tertiary"
              title="Database Postgres"
              subtitle={
                status.db.credentialPresent
                  ? "Connection string Postgres terdeteksi di environment."
                  : "Tidak ada connection string Postgres yang terdeteksi."
              }
              right={
                status.db.credentialPresent ? (
                  <OkPill label="Terhubung" />
                ) : (
                  <ErrorPill label="Tidak ada" />
                )
              }
            >
              {!status.db.credentialPresent && (
                <div className="mt-2 rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Variabel POSTGRES_* yang terdeteksi
                  </p>
                  {status.db.detectedKeys.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tidak ada variabel berakhiran <span className="font-mono">_POSTGRES_*</span>{" "}
                      yang ditemukan. Hubungkan database via Vercel Marketplace.
                    </p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {status.db.detectedKeys.map((k) => (
                        <li
                          key={k}
                          className="rounded-md border bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {k}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </StatusRow>

            <StatusRow
              icon={Server}
              tone="muted"
              title="Runtime"
              subtitle={
                <span className="tnum">
                  Node {status.runtime.node} · env: {status.runtime.env} · region:{" "}
                  {status.runtime.region}
                </span>
              }
              right={<Badge variant="secondary">{status.runtime.env}</Badge>}
            />

            <StatusRow
              icon={Cpu}
              tone="warning"
              title="Model"
              subtitle={
                <span className="font-mono text-[12px]">
                  Chat: {status.ai.modelChat} · Fast: {status.ai.modelFast}
                </span>
              }
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Card 2: Live AI ping ──────────────────────────────────────────────────

function LiveAiPingCard() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<AiPingResult | null>(null);

  const run = useCallback(async () => {
    setState("loading");
    setResult(null);
    try {
      const res = await fetch("/api/diagnostics/ai-ping", {
        method: "POST",
        cache: "no-store",
      });
      const data = (await res.json()) as AiPingResult;
      setResult(data);
    } catch (err: unknown) {
      // Network-level failure (route handler unreachable) — surface as error.
      setResult({
        ok: false,
        source: "error",
        latencyMs: 0,
        error: {
          message: err instanceof Error ? err.message : String(err),
        },
      });
    } finally {
      setState("done");
    }
  }, []);

  const sourceFor = (r: AiPingResult): RouteSource => r.source;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Tes AI langsung
        </CardTitle>
        <Button onClick={run} disabled={state === "loading"}>
          {state === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memanggil Deepseek...
            </>
          ) : (
            <>
              <PlayCircle className="h-4 w-4" />
              Jalankan tes Deepseek
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Mengirim prompt singkat ke{" "}
          <span className="font-mono text-[12px]">deepseek/deepseek-v4-flash</span>{" "}
          via Vercel AI Gateway dan menampilkan respons mentahnya. Bila gagal,
          status code dan pesan error ditampilkan inline.
        </p>

        {state === "idle" && (
          <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Klik tombol di atas untuk memulai tes.
          </div>
        )}

        {state === "loading" && (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Menunggu respons dari AI Gateway...
          </div>
        )}

        {state === "done" && result && (
          <div className="space-y-3">
            {/* Header strip: status / latency / source */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">
                      Sukses
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      Gagal
                    </span>
                  </>
                )}
              </div>
              <Separator orientation="vertical" className="h-5" />
              <div className="text-sm">
                <span className="text-muted-foreground">Latency: </span>
                <span className="font-medium tnum">
                  {"latencyMs" in result ? `${result.latencyMs} ms` : "—"}
                </span>
              </div>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Source:</span>
                <SourceBadge source={sourceFor(result)} />
              </div>
            </div>

            {/* Body: response or error detail */}
            {result.ok ? (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Respons Deepseek
                </p>
                <pre className="scrollbar-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/50 p-3 font-mono text-[12px] leading-relaxed text-foreground">
                  {result.response}
                </pre>
              </div>
            ) : result.source === "mock" ? (
              <div className="rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Mode mock aktif</p>
                <p className="mt-1 text-xs">{result.reason}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  AI Gateway error
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-muted-foreground">Pesan</dt>
                    <dd className="font-mono text-foreground">
                      {result.error.message}
                    </dd>
                  </div>
                  {result.error.statusCode !== undefined && (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted-foreground">
                        Status code
                      </dt>
                      <dd className="font-mono tnum text-foreground">
                        {result.error.statusCode}
                      </dd>
                    </div>
                  )}
                  {result.error.causeMessage && (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted-foreground">Cause</dt>
                      <dd className="font-mono text-foreground">
                        {result.error.causeMessage}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Card 3: Endpoint probes ───────────────────────────────────────────────

interface EndpointProbe {
  id: string;
  label: string;
  path: string;
  build: () => { body: unknown };
  /** Extract a `source` value from the response object (after JSON parse). */
  extractSource: (resBody: unknown, headers: Headers) => RouteSource;
  /** Optional human-friendly detail extracted from the response. */
  extractDetail?: (resBody: unknown) => string | undefined;
}

const PROBES: EndpointProbe[] = [
  {
    id: "chat",
    label: "Tes chat",
    path: "/api/chat",
    build: () => ({
      body: {
        messages: [
          {
            id: "1",
            role: "user",
            parts: [{ type: "text", text: "Test" }],
          },
        ],
        kbSnapshot: seedKnowledgeBase,
      },
    }),
    // Chat is a streaming UI-message response — we read x-ai-source from headers.
    extractSource: (_body, headers) => {
      const h = headers.get("x-ai-source");
      if (h === "real") return "real";
      if (h === "mock") return "mock";
      return "error";
    },
    extractDetail: (_body) => undefined,
  },
  {
    id: "auto-reply",
    label: "Tes auto-reply",
    path: "/api/auto-reply",
    build: () => ({
      body: {
        conversationContext:
          "Pelanggan: Halo, saya ingin tanya soal paket Growth.",
        contactName: "Diagnostics Tester",
        company: "Diagnostics Co",
        kbSnapshot: seedKnowledgeBase,
      },
    }),
    extractSource: (body) => readSourceField(body),
    extractDetail: (body) => readStringField(body, "draft"),
  },
  {
    id: "kb-test",
    label: "Tes KB test",
    path: "/api/kb-test",
    build: () => ({
      body: {
        prompt: "Sebutkan satu fitur utama Paket Growth.",
        kbSnapshot: seedKnowledgeBase,
      },
    }),
    extractSource: (body) => readSourceField(body),
    extractDetail: (body) => readStringField(body, "answer"),
  },
  {
    id: "autopilot-text",
    label: "Tes autopilot text",
    path: "/api/autopilot/text",
    build: () => ({
      body: {
        kind: "linkedin-note",
        prospect: {
          name: "Diagnostics Tester",
          company: "Diagnostics Co",
          title: "Head of Sales",
          segment: "Menengah",
          industry: "SaaS",
        },
        kbSnapshot: seedKnowledgeBase,
      },
    }),
    extractSource: (body) => readSourceField(body),
    extractDetail: (body) => readStringField(body, "text"),
  },
];

function readSourceField(body: unknown): RouteSource {
  if (body && typeof body === "object" && "source" in body) {
    const v = (body as { source: unknown }).source;
    if (v === "real") return "real";
    if (v === "mock") return "mock";
  }
  return "error";
}

function readStringField(body: unknown, key: string): string | undefined {
  if (body && typeof body === "object" && key in body) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function EndpointProbesCard() {
  const [results, setResults] = useState<Record<string, RouteProbeResult | "loading">>(
    {},
  );

  const probe = useCallback(async (p: EndpointProbe) => {
    setResults((prev) => ({ ...prev, [p.id]: "loading" }));
    const t0 = Date.now();
    try {
      const { body } = p.build();
      const res = await fetch(p.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const latencyMs = Date.now() - t0;

      // chat is a streaming response — text() will collect the full stream.
      let parsedBody: unknown = null;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          parsedBody = await res.json();
        } catch {
          parsedBody = null;
        }
      } else {
        // Drain the stream so the request completes cleanly. We don't display it.
        try {
          await res.text();
        } catch {
          /* ignore */
        }
      }

      const source = res.ok ? p.extractSource(parsedBody, res.headers) : "error";
      const detail = p.extractDetail?.(parsedBody);

      setResults((prev) => ({
        ...prev,
        [p.id]: {
          source,
          status: res.status,
          detail,
          latencyMs,
        },
      }));
    } catch (err: unknown) {
      setResults((prev) => ({
        ...prev,
        [p.id]: {
          source: "error",
          status: 0,
          detail: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - t0,
        },
      }));
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-tertiary" />
          Tes endpoint AI lainnya
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Kirim payload minimal ke setiap route AI dan tampilkan nilai{" "}
          <span className="font-mono text-[12px]">source</span> yang
          dikembalikan. Berguna untuk mengetahui surface mana yang sedang
          fallback ke mock.
        </p>

        <ul className="divide-y rounded-lg border">
          {PROBES.map((p) => {
            const r = results[p.id];
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    POST {p.path}
                  </p>
                </div>

                {r === "loading" ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    memuat...
                  </span>
                ) : r ? (
                  <div className="flex items-center gap-2">
                    <span className="tnum text-xs text-muted-foreground">
                      {r.latencyMs} ms · HTTP {r.status}
                    </span>
                    <SourceBadge source={r.source} />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">belum diuji</span>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => probe(p)}
                  disabled={r === "loading"}
                >
                  Jalankan
                </Button>
              </li>
            );
          })}
        </ul>

        {/* Inline details / errors per probe */}
        <div className="space-y-2">
          {PROBES.map((p) => {
            const r = results[p.id];
            if (!r || r === "loading") return null;
            if (r.source !== "error" && !r.detail) return null;
            return (
              <div
                key={p.id}
                className={
                  r.source === "error"
                    ? "rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                    : "rounded-lg border bg-muted/30 p-3"
                }
              >
                <p className="text-xs font-medium">
                  <span className="font-mono">{p.path}</span>
                  {r.source === "error" && (
                    <span className="ml-2 text-destructive">— error</span>
                  )}
                </p>
                {r.detail && (
                  <pre className="scrollbar-thin mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {r.detail}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Shared UI bits ────────────────────────────────────────────────────────

function StatusRow({
  icon: Icon,
  tone,
  title,
  subtitle,
  right,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "tertiary" | "warning" | "muted";
  title: string;
  subtitle: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const iconClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "tertiary"
        ? "bg-tertiary/10 text-tertiary"
        : tone === "warning"
          ? "bg-warning/15 text-amber-700"
          : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
}

function OkPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function ErrorPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

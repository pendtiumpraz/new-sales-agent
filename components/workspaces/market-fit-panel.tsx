"use client";

// Workspace setup stepper: Produk → Market-Fit → Discovery. Runs + persists the
// Market-Fit Analyzer for this workspace's product, and shows which closing
// techniques the resulting B2B/B2C type unlocks.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Package, Radar, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKbStore, PRODUCT_CATEGORIES } from "@/lib/stores/kb-store";
import { cn } from "@/lib/utils";
import type { MarketFitResult } from "@/lib/types/market-fit";

interface AllowedTech {
  id: string;
  nama: string;
}
interface MfResponse {
  result: MarketFitResult | null;
  allowedTechniques: AllowedTech[];
}

const MARKET_CLS: Record<string, string> = {
  B2B: "bg-blue-100 text-blue-700",
  B2C: "bg-emerald-100 text-emerald-700",
  mix: "bg-violet-100 text-violet-700",
};

export function MarketFitPanel({
  workspaceId,
  productId,
  onSetupChange,
}: {
  workspaceId: string;
  productId: string | null;
  /** Reports whether setup is complete (market-fit result exists) to the hub. */
  onSetupChange?: (done: boolean) => void;
}) {
  const kb = useKbStore((s) => s.kb);
  const addProduct = useKbStore((s) => s.addProduct);
  const qc = useQueryClient();

  const product = useMemo(
    () => kb.products.find((p) => p.id === productId) ?? null,
    [kb.products, productId],
  );
  const segments = useMemo(
    () =>
      kb.segments.map((s) => ({
        label: s.label,
        description: s.description,
        headcountBand: s.headcountBand,
        revenueBand: s.revenueBand,
      })),
    [kb.segments],
  );

  const q = useQuery({
    queryKey: ["market-fit", workspaceId],
    queryFn: async () => {
      const r = await fetch(`/api/workspaces/${workspaceId}/market-fit`);
      if (!r.ok) return { result: null, allowedTechniques: [] } as MfResponse;
      return (await r.json()) as MfResponse;
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Produk belum terhubung ke workspace ini");
      const r = await fetch(`/api/workspaces/${workspaceId}/market-fit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: product.name,
          productDescription: product.description,
          segments,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return (await r.json()) as MfResponse;
    },
    onSuccess: () => {
      toast.success("Market-fit dianalisis");
      qc.invalidateQueries({ queryKey: ["market-fit", workspaceId] });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  // Step 1 — connect a product to this workspace (1 workspace = 1 produk).
  const [pickProduct, setPickProduct] = useState("");
  const connect = useMutation({
    mutationFn: async (pid: string) => {
      const r = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: pid }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("Produk terhubung");
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  // Inline "buat produk baru" from the dropdown — equivalent to adding in the KB
  // (persists via /api/db/kb), then connects the new product to this workspace.
  const [creating, setCreating] = useState(false);
  const [npName, setNpName] = useState("");
  const [npDesc, setNpDesc] = useState("");
  const [npCat, setNpCat] = useState<(typeof PRODUCT_CATEGORIES)[number]>("Inti");
  function createAndConnect() {
    const name = npName.trim();
    if (!name) return;
    const id = addProduct({ name, description: npDesc.trim(), category: npCat, active: true });
    connect.mutate(id, {
      onSuccess: () => {
        setCreating(false);
        setNpName("");
        setNpDesc("");
        setNpCat("Inti");
      },
    });
  }

  const result = q.data?.result ?? null;
  const allowed = q.data?.allowedTechniques ?? [];
  const step1Done = !!product;
  const step2Done = !!result;

  // Tell the hub whether setup is complete so it can unlock the rest.
  useEffect(() => {
    onSetupChange?.(step2Done);
  }, [step2Done, onSetupChange]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Setup workspace
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <StepDot n={1} label="Produk" done={step1Done} />
            <span className="text-muted-foreground/40">→</span>
            <StepDot n={2} label="Market-Fit" done={step2Done} />
            <span className="text-muted-foreground/40">→</span>
            <StepDot n={3} label="Discovery" done={false} />
          </div>
        </div>

        {/* Step 1 — pick & connect a product */}
        {!product ? (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-3">
            <p className="text-xs font-medium text-foreground">
              Langkah 1 — pilih produk untuk workspace ini (1 workspace = 1 produk):
            </p>
            {creating ? (
              <div className="space-y-2">
                <Input value={npName} onChange={(e) => setNpName(e.target.value)} placeholder="Nama produk baru" className="h-9" autoFocus />
                <Input value={npDesc} onChange={(e) => setNpDesc(e.target.value)} placeholder="Deskripsi singkat (opsional)" className="h-9" />
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={npCat} onValueChange={(v) => setNpCat(v as (typeof PRODUCT_CATEGORIES)[number])}>
                    <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!npName.trim() || connect.isPending} onClick={createAndConnect}>
                    {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buat & hubungkan"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNpName(""); setNpDesc(""); }}>
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={pickProduct} onValueChange={(v) => (v === "__new__" ? setCreating(true) : setPickProduct(v))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pilih produk…" /></SelectTrigger>
                  <SelectContent>
                    {kb.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                    {/* Buat baru — selalu di paling bawah dropdown */}
                    <SelectItem value="__new__" className="font-medium text-primary">+ Buat produk baru</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!pickProduct || connect.isPending}
                  onClick={() => connect.mutate(pickProduct)}
                >
                  {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hubungkan"}
                </Button>
              </div>
            )}
            {kb.products.length === 0 && !creating && (
              <p className="text-[11px] text-muted-foreground">
                Belum ada produk — pilih “+ Buat produk baru” di dropdown untuk menambahkan.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-primary" />
            <span className="font-medium">{product.name}</span>
            <span className="truncate text-xs text-muted-foreground">{product.description}</span>
          </div>
        )}

        {/* Step 2 — analyzer */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Market-Fit Analyzer (B2B / B2C)</p>
            <Button
              size="sm"
              variant={result ? "outline" : "default"}
              disabled={!product || run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {result ? "Analisis ulang" : "Analisis"}
            </Button>
          </div>

          {result && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={MARKET_CLS[result.marketType] ?? MARKET_CLS.mix}>
                  {result.marketType}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  keyakinan {Math.round(result.confidence)}% ·{" "}
                  {result.source === "ai" ? "AI" : "heuristik"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{result.rationale}</p>

              <div className="text-xs">
                <p className="font-medium">ICP</p>
                <p className="text-muted-foreground">
                  {[
                    result.icp.ukuran,
                    result.icp.jabatanPIC.length ? result.icp.jabatanPIC.join(", ") : "",
                    result.icp.demografi,
                    result.icp.industri.length ? result.icp.industri.join(", ") : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>

              {result.segmentFit.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Fit per segmen</p>
                  {result.segmentFit.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 truncate" title={s.reason}>
                        {s.label}
                      </span>
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums">{s.score}</span>
                    </div>
                  ))}
                </div>
              )}

              {allowed.length > 0 && (
                <div>
                  <p className="text-xs font-medium">
                    Teknik closing yang cocok ({allowed.length})
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {allowed.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t.nama}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3 — discovery (unlocked after market-fit) */}
        {step2Done ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/contacts/discovery?workspace=${workspaceId}`}>
              <Radar className="h-4 w-4" /> Lanjut ke Discovery
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled title="Analisis market-fit dulu">
            <Radar className="h-4 w-4" /> Lanjut ke Discovery
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StepDot({ n, label, done }: { n: number; label: string; done: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : n}
      </span>
      {label}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { can, type Role } from "@/lib/rbac/permissions";

interface ModelRow {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  contextWindow: number | null;
  priceInPer1m: number | null;
  priceOutPer1m: number | null;
  capabilities: string[];
  isAvailable: boolean;
}
interface ProviderRow {
  id: string;
  key: string;
  displayName: string;
  hasPlatformKey: boolean;
  hasTenantKey: boolean;
}
interface AiData {
  models: ModelRow[];
  providers: ProviderRow[];
  activeModelId: string | null;
  usage: { tokensIn: number; tokensOut: number; cost: number; calls: number } | null;
}

const fmtCtx = (n: number | null) =>
  n == null ? "—" : n >= 1_000_000 ? `${n / 1_000_000}M ctx` : `${Math.round(n / 1000)}K ctx`;
const fmtPrice = (pin: number | null, pout: number | null) =>
  pin == null || pout == null ? "harga belum diisi" : `$${pin} / $${pout} per 1M`;

export default function AiSettingsPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "member") as Role;
  const canManage = can(role, "tenant.settings.manage");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai"] });

  const { data, isLoading } = useQuery({
    queryKey: ["ai"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/ai");
      if (!r.ok) throw new Error("Gagal memuat");
      return (await r.json()) as AiData;
    },
  });

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const setActive = useMutation({
    mutationFn: async (modelId: string) => {
      const r = await fetch("/api/tenant/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => {
      toast.success("Model aktif diperbarui");
      invalidate();
    },
    onError: () => toast.error("Gagal mengubah model aktif"),
  });

  const saveKey = useMutation({
    mutationFn: async (providerId: string) => {
      const apiKey = keyInputs[providerId];
      const r = await fetch("/api/tenant/ai/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, apiKey }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: (_d, providerId) => {
      toast.success("API key tersimpan (terenkripsi)");
      setKeyInputs((s) => ({ ...s, [providerId]: "" }));
      invalidate();
    },
    onError: () => toast.error("Gagal menyimpan key"),
  });

  const deleteKey = useMutation({
    mutationFn: async (providerId: string) => {
      const r = await fetch("/api/tenant/ai/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => {
      toast.success("API key dihapus");
      invalidate();
    },
    onError: () => toast.error("Gagal menghapus key"),
  });

  const usage = data?.usage;

  return (
    <div>
      <PageHeader
        title="AI"
        description="Pilih 1 model aktif untuk seluruh tim (berlaku per tenant — semua workspace memakai model yang sama), kelola API key sendiri (BYOK), dan pantau pemakaian."
      />
      <div className="space-y-4 p-6">
        {/* Usage rollup — current month (Asia/Jakarta), not lifetime */}
        <Card>
          <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pemakaian bulan ini
          </div>
          <CardContent className="grid grid-cols-3 gap-4 p-4 text-center">
            <div>
              <p className="text-2xl font-semibold">{usage?.calls ?? 0}</p>
              <p className="text-xs text-muted-foreground">Panggilan AI</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {((usage?.tokensIn ?? 0) + (usage?.tokensOut ?? 0)).toLocaleString("id-ID")}
              </p>
              <p className="text-xs text-muted-foreground">Total token</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">${(usage?.cost ?? 0).toFixed(4)}</p>
              <p className="text-xs text-muted-foreground">Estimasi biaya (USD)</p>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <ListSkeleton rows={4} avatar={false} />
        ) : (
          data?.providers.map((p) => {
            const models = (data.models ?? []).filter((m) => m.providerId === p.id && m.isAvailable);
            const keyOk = p.hasPlatformKey || p.hasTenantKey;
            return (
              <Card key={p.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
                  <CardTitle className="text-base">{p.displayName}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {p.hasPlatformKey && (
                      <Badge variant="muted" className="gap-1">
                        <Sparkles className="h-3 w-3" /> Platform key
                      </Badge>
                    )}
                    {p.hasTenantKey && (
                      <Badge variant="muted" className="gap-1 text-emerald-700">
                        <KeyRound className="h-3 w-3" /> BYOK
                      </Badge>
                    )}
                    {!keyOk && <Badge variant="muted">tanpa key</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  {/* BYOK control */}
                  {canManage && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">API key {p.displayName} (BYOK)</label>
                        <Input
                          type="password"
                          placeholder={p.hasTenantKey ? "•••••••• tersimpan — isi untuk ganti" : "sk-…"}
                          value={keyInputs[p.id] ?? ""}
                          onChange={(e) => setKeyInputs((s) => ({ ...s, [p.id]: e.target.value }))}
                        />
                      </div>
                      <Button
                        variant="outline"
                        disabled={!keyInputs[p.id] || saveKey.isPending}
                        onClick={() => saveKey.mutate(p.id)}
                      >
                        Simpan
                      </Button>
                      {p.hasTenantKey && (
                        <Button variant="ghost" onClick={() => deleteKey.mutate(p.id)}>
                          Hapus
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Models */}
                  <ul className="divide-y">
                    {models.map((m) => {
                      const active = m.id === data.activeModelId;
                      return (
                        <li key={m.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{m.displayName}</p>
                              {active && (
                                <Badge className="gap-1 bg-primary/15 text-primary">
                                  <Check className="h-3 w-3" /> Aktif
                                </Badge>
                              )}
                            </div>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {m.modelId} · {fmtCtx(m.contextWindow)} · {fmtPrice(m.priceInPer1m, m.priceOutPer1m)}
                            </p>
                          </div>
                          {!active && canManage && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={setActive.isPending}
                              onClick={() => setActive.mutate(m.id)}
                            >
                              {setActive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Jadikan aktif"}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                    {models.length === 0 && (
                      <li className="py-2.5 text-xs text-muted-foreground">
                        Belum ada model. Superadmin menambahkannya dari docs resmi provider.
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            );
          })
        )}
        {!canManage && (
          <p className={cn("text-xs text-muted-foreground")}>
            Hanya Owner/Admin yang bisa mengubah model aktif & API key.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Grid3x3 } from "lucide-react";

interface ModuleDef { key: string; label: string }
interface Matrix {
  tenants: { id: string; name: string }[];
  modules: ModuleDef[];
  disabled: Record<string, string[]>;
}

// Superadmin module entitlement matrix (doc 44): tenants × modules, toggle to
// show/hide a module for a tenant. Checked = enabled.
export function EntitlementMatrix() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["entitlements"],
    queryFn: async () => {
      const r = await fetch("/api/admin/entitlements");
      if (!r.ok) return { tenants: [], modules: [], disabled: {} } as Matrix;
      return (await r.json()) as Matrix;
    },
  });
  const set = useMutation({
    mutationFn: async (v: { tenantId: string; moduleKey: string; enabled: boolean }) => {
      const r = await fetch("/api/admin/entitlements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onMutate: async (v) => {
      // optimistic
      await qc.cancelQueries({ queryKey: ["entitlements"] });
      const prev = qc.getQueryData<Matrix>(["entitlements"]);
      if (prev) {
        const dis = { ...prev.disabled };
        const list = new Set(dis[v.tenantId] ?? []);
        if (v.enabled) list.delete(v.moduleKey);
        else list.add(v.moduleKey);
        dis[v.tenantId] = [...list];
        qc.setQueryData(["entitlements"], { ...prev, disabled: dis });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["entitlements"], ctx.prev);
      toast.error("Gagal mengubah entitlement");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["entitlements"] }),
  });

  const data = q.data;
  const isDisabled = useMemo(
    () => (t: string, m: string) => (data?.disabled[t] ?? []).includes(m),
    [data],
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Grid3x3 className="h-4 w-4" /> Entitlement — modul per tenant
        </p>
        <p className="text-[11px] text-muted-foreground">Centang = modul aktif buat tenant itu. Hilangkan centang untuk sembunyikan.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="sticky left-0 bg-card px-4 py-2 font-medium">Tenant</th>
              {(data?.modules ?? []).map((m) => (
                <th key={m.key} className="px-2 py-2 text-center font-medium" title={m.key}>
                  <span className="block w-20 truncate">{m.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.tenants ?? []).map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="sticky left-0 bg-card px-4 py-2 font-medium">{t.name}</td>
                {(data?.modules ?? []).map((m) => {
                  const enabled = !isDisabled(t.id, m.key);
                  return (
                    <td key={m.key} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={set.isPending}
                        onChange={() => set.mutate({ tenantId: t.id, moduleKey: m.key, enabled: !enabled })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {(data?.tenants?.length ?? 0) === 0 && !q.isLoading && (
              <tr>
                <td colSpan={(data?.modules?.length ?? 0) + 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Belum ada tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

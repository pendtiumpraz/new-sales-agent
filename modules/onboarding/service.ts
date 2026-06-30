import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { productService } from "@/modules/product/service";
import { workspaceService } from "@/modules/workspace/service";
import { onboardingRepo } from "./repo";
import type {
  VerticalRow,
  ModuleCatalogRow,
  TenantEntitlementRow,
  OnboardingStateRow,
} from "./schema";

/**
 * onboarding + entitlements domain service. Holds ALL business logic + the
 * cross-module audit side effect. Routes stay thin: parse → call a method →
 * wrap with the {ok,error} envelope.
 *
 * Entitlement grain = TENANT. Semantics EXTEND lib/entitlements.ts: an absent
 * `tenant_entitlement_v2` row = ENABLED by default. A tenant's enabled set is
 *   core (always-on module_catalog rows)
 *   ∪ the vertical bundle (vertical.default_modules)
 *   minus modules explicitly turned off (`enabled = false` rows).
 * Selecting a vertical seeds the bundle as explicit `enabled = true` rows so the
 * resolved set is deterministic and visible in the entitlement matrix.
 */

const ONBOARDING_STEPS = ["vertical", "branding", "product", "invite_team", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface ResolvedEntitlements {
  vertical: VerticalRow | null;
  /** module_key list the tenant currently has access to. */
  enabledModules: string[];
  /** Full per-module view: every catalog module + its resolved on/off + source. */
  modules: {
    moduleKey: string;
    label: string;
    isCore: boolean;
    enabled: boolean;
    inBundle: boolean;
  }[];
  /** Per-module quota overrides merged from the tenant_entitlement_v2 rows. */
  quotaOverrides: Record<string, Record<string, number>>;
}

export interface AdvanceOnboardingInput {
  step?: OnboardingStep;
  verticalKey?: string;
  selectedModules?: string[];
  data?: Record<string, unknown>;
  complete?: boolean;
}

export interface CreateVerticalInput {
  key: string;
  name: string;
  description?: string | null;
  defaultModules?: string[];
  icon?: string | null;
  sort?: number;
}

export interface CreateModuleInput {
  moduleKey: string;
  label: string;
  domain?: string | null;
  isCore?: boolean;
  sidebarColor?: string | null;
  sort?: number;
}

function isStep(value: string | undefined): value is OnboardingStep {
  return !!value && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export const onboardingService = {
  // ── vertical catalog (GLOBAL — superadmin-managed) ───────────────
  async listVerticals(): Promise<VerticalRow[]> {
    return onboardingRepo.listVerticals();
  },

  async listTrashedVerticals(): Promise<VerticalRow[]> {
    return onboardingRepo.listTrashedVerticals();
  },

  async getVertical(id: string): Promise<VerticalRow> {
    const row = await onboardingRepo.getVertical(id);
    if (!row) throw new ServiceError("Vertical tidak ditemukan", 404, "not_found");
    return row;
  },

  async createVertical(input: CreateVerticalInput, actorUserId?: string): Promise<VerticalRow> {
    const key = input.key?.trim().toLowerCase();
    const name = input.name?.trim();
    if (!key) throw new ServiceError("Key vertical wajib diisi", 400, "validation");
    if (!name) throw new ServiceError("Nama vertical wajib diisi", 400, "validation");

    const existing = await onboardingRepo.getVerticalByKey(key);
    if (existing) throw new ServiceError("Key vertical sudah dipakai", 409, "key_taken");

    const row = await onboardingRepo.insertVertical({
      id: "vrt_" + crypto.randomUUID(),
      key,
      name,
      description: input.description ?? null,
      defaultModules: input.defaultModules ?? [],
      icon: input.icon ?? null,
      sort: input.sort ?? 0,
    });
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.vertical.create",
      targetType: "vertical",
      targetId: row.id,
      meta: { key, defaultModules: row.defaultModules },
    });
    return row;
  },

  async softDeleteVertical(id: string, actorUserId?: string): Promise<void> {
    const ok = await onboardingRepo.softDeleteVertical(id);
    if (!ok) throw new ServiceError("Vertical tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.vertical.delete",
      targetType: "vertical",
      targetId: id,
    });
  },

  async restoreVertical(id: string, actorUserId?: string): Promise<VerticalRow> {
    const ok = await onboardingRepo.restoreVertical(id);
    if (!ok) throw new ServiceError("Vertical tidak ada di trash", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.vertical.restore",
      targetType: "vertical",
      targetId: id,
    });
    return this.getVertical(id);
  },

  /** Permanently remove a vertical (real SQL DELETE). Irreversible. */
  async hardDeleteVertical(id: string, actorUserId?: string): Promise<void> {
    const ok = await onboardingRepo.hardDeleteVertical(id);
    if (!ok) throw new ServiceError("Vertical tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.vertical.purge",
      targetType: "vertical",
      targetId: id,
    });
  },

  // ── module catalog (GLOBAL — superadmin-managed) ─────────────────
  async listModules(): Promise<ModuleCatalogRow[]> {
    return onboardingRepo.listModules();
  },

  async listTrashedModules(): Promise<ModuleCatalogRow[]> {
    return onboardingRepo.listTrashedModules();
  },

  async getModule(id: string): Promise<ModuleCatalogRow> {
    const row = await onboardingRepo.getModule(id);
    if (!row) throw new ServiceError("Modul tidak ditemukan", 404, "not_found");
    return row;
  },

  async createModule(input: CreateModuleInput, actorUserId?: string): Promise<ModuleCatalogRow> {
    const moduleKey = input.moduleKey?.trim();
    const label = input.label?.trim();
    if (!moduleKey) throw new ServiceError("module_key wajib diisi", 400, "validation");
    if (!label) throw new ServiceError("Label modul wajib diisi", 400, "validation");

    const existing = await onboardingRepo.getModuleByKey(moduleKey);
    if (existing) throw new ServiceError("module_key sudah dipakai", 409, "key_taken");

    const row = await onboardingRepo.insertModule({
      id: "mdl_" + crypto.randomUUID(),
      moduleKey,
      label,
      domain: input.domain ?? null,
      isCore: input.isCore ?? false,
      sidebarColor: input.sidebarColor ?? null,
      sort: input.sort ?? 0,
    });
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.module.create",
      targetType: "module_catalog",
      targetId: row.id,
      meta: { moduleKey, isCore: row.isCore },
    });
    return row;
  },

  async softDeleteModule(id: string, actorUserId?: string): Promise<void> {
    const ok = await onboardingRepo.softDeleteModule(id);
    if (!ok) throw new ServiceError("Modul tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.module.delete",
      targetType: "module_catalog",
      targetId: id,
    });
  },

  async restoreModule(id: string, actorUserId?: string): Promise<ModuleCatalogRow> {
    const ok = await onboardingRepo.restoreModule(id);
    if (!ok) throw new ServiceError("Modul tidak ada di trash", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.module.restore",
      targetType: "module_catalog",
      targetId: id,
    });
    return this.getModule(id);
  },

  /** Permanently remove a catalog module (real SQL DELETE). Irreversible. */
  async hardDeleteModule(id: string, actorUserId?: string): Promise<void> {
    const ok = await onboardingRepo.hardDeleteModule(id);
    if (!ok) throw new ServiceError("Modul tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: null,
      actorUserId: actorUserId ?? null,
      action: "onboarding.module.purge",
      targetType: "module_catalog",
      targetId: id,
    });
  },

  // ── onboarding state machine (TENANT) ────────────────────────────
  /** Read the tenant's onboarding state, defaulting to a fresh `vertical` step. */
  async getState(ctx: TenantContext): Promise<OnboardingStateRow> {
    const row = await onboardingRepo.getState(ctx);
    if (row) return row;
    // No row yet → return a transient default (not persisted until first advance).
    return {
      tenantId: ctx.tenantId,
      step: "vertical",
      verticalKey: null,
      selectedModules: [],
      data: {},
      completedAt: null,
      updatedAt: new Date(),
    };
  },

  /**
   * Advance the onboarding state machine. Persists step / selectedModules / data.
   * Passing `verticalKey` ALSO sets the tenant vertical and seeds entitlements
   * (see setVertical). `complete: true` stamps completedAt + step='done'.
   */
  async advance(
    ctx: TenantContext,
    input: AdvanceOnboardingInput,
    actorUserId?: string,
  ): Promise<OnboardingStateRow> {
    if (input.step !== undefined && !isStep(input.step)) {
      throw new ServiceError("Step onboarding tidak valid", 400, "validation");
    }

    // Vertical selection has side effects (seeds entitlements) → delegate first.
    if (input.verticalKey !== undefined && input.verticalKey !== null) {
      await this.setVertical(ctx, input.verticalKey, actorUserId);
    }

    const patch: Parameters<typeof onboardingRepo.upsertState>[1] = {};
    if (input.step !== undefined) patch.step = input.step;
    if (input.verticalKey !== undefined) patch.verticalKey = input.verticalKey;
    if (input.selectedModules !== undefined) patch.selectedModules = input.selectedModules;
    if (input.data !== undefined) patch.data = input.data;
    if (input.complete) {
      patch.step = "done";
      patch.completedAt = new Date();
    }

    const row = await onboardingRepo.upsertState(ctx, patch);

    // Completing onboarding BOOTSTRAPS the tenant's first workspace (+ its one
    // product) so scoped features aren't gated on an empty tenant. Idempotent:
    // skipped when the tenant already owns ≥1 workspace. The product name is read
    // from the wizard's product step (state.data.productName), falling back to a
    // sensible default. Fail-soft — a bootstrap glitch must not block "done".
    if (input.complete) {
      try {
        await this.bootstrapWorkspace(ctx, row, actorUserId);
      } catch (err) {
        console.error("[onboarding.bootstrapWorkspace]", err);
      }
    }

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId ?? ctx.userId,
      action: "onboarding.advance",
      targetType: "onboarding_state",
      targetId: ctx.tenantId,
      meta: { step: row.step, verticalKey: row.verticalKey, complete: !!input.complete },
    });
    return row;
  },

  /**
   * Bootstrap the tenant's FIRST workspace + product on onboarding completion
   * (1 workspace = 1 product). Idempotent: returns null when a workspace already
   * exists. Reads the product name the user entered in the wizard's product step
   * (`onboarding_state.data.productName`), defaulting to the tenant's brand-ish
   * name or "Workspace utama". The workspace is named after the product so the
   * switcher/gate immediately have something meaningful to auto-select.
   */
  async bootstrapWorkspace(
    ctx: TenantContext,
    state: OnboardingStateRow,
    actorUserId?: string,
  ): Promise<{ workspaceId: string; productId: string } | null> {
    const existing = await workspaceService.list(ctx);
    if (existing.length > 0) return null;

    const data = (state.data ?? {}) as Record<string, unknown>;
    const rawName = typeof data.productName === "string" ? data.productName.trim() : "";
    const productName = rawName || "Produk utama";
    const category = state.verticalKey ?? null;
    const targetMarketRaw =
      typeof data.targetMarket === "string" ? data.targetMarket.trim() : "";

    const product = await productService.create(ctx, {
      name: productName,
      category,
      targetMarket: targetMarketRaw || null,
    });

    const workspace = await workspaceService.create(ctx, {
      name: productName,
      ownerUserId: actorUserId ?? ctx.userId,
      productId: product.id,
    });

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId ?? ctx.userId,
      action: "onboarding.bootstrap_workspace",
      targetType: "workspace",
      targetId: workspace.id,
      meta: { workspaceId: workspace.id, productId: product.id, productName },
    });
    return { workspaceId: workspace.id, productId: product.id };
  },

  // ── vertical → entitlements (the core onboarding action) ─────────
  /** All module_key values the vertical bundles (its default_modules). */
  async bundleForVertical(key: string): Promise<string[]> {
    const v = await onboardingRepo.getVerticalByKey(key);
    if (!v) throw new ServiceError("Vertical tidak ditemukan", 404, "not_found");
    return v.defaultModules ?? [];
  },

  /**
   * Set the tenant's vertical and SEED entitlements from its bundle. Each module
   * the vertical enables is written as an explicit `enabled = true` entitlement
   * row (idempotent upsert). Core modules are always-on and not written here.
   * The vertical_key is recorded on the onboarding_state row.
   */
  async setVertical(
    ctx: TenantContext,
    verticalKey: string,
    actorUserId?: string,
  ): Promise<{ vertical: VerticalRow; seeded: string[] }> {
    const vertical = await onboardingRepo.getVerticalByKey(verticalKey);
    if (!vertical) throw new ServiceError("Vertical tidak ditemukan", 404, "not_found");

    const bundle = vertical.defaultModules ?? [];
    for (const moduleKey of bundle) {
      await onboardingRepo.upsertEntitlement(ctx, moduleKey, { enabled: true });
    }

    await onboardingRepo.upsertState(ctx, { verticalKey });

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId ?? ctx.userId,
      action: "onboarding.vertical.set",
      targetType: "tenant",
      targetId: ctx.tenantId,
      meta: { verticalKey, seeded: bundle },
    });
    return { vertical, seeded: bundle };
  },

  // ── entitlement resolution + toggle (TENANT) ─────────────────────
  /**
   * Resolve the tenant's effective module access. Combines the global
   * module_catalog with the per-tenant overrides:
   *   - core modules: always enabled
   *   - bundle modules (from the tenant's vertical): enabled unless turned off
   *   - everything else: follows the explicit row (absent row = enabled default)
   */
  async resolveEntitlements(ctx: TenantContext): Promise<ResolvedEntitlements> {
    const [catalog, rows, state] = await Promise.all([
      onboardingRepo.listModules(),
      onboardingRepo.listEntitlements(ctx),
      onboardingRepo.getState(ctx),
    ]);

    const overrideMap = new Map<string, TenantEntitlementRow>();
    for (const r of rows) overrideMap.set(r.moduleKey, r);

    let vertical: VerticalRow | null = null;
    let bundle: Set<string> = new Set();
    if (state?.verticalKey) {
      vertical = (await onboardingRepo.getVerticalByKey(state.verticalKey)) ?? null;
      bundle = new Set(vertical?.defaultModules ?? []);
    }

    const modules = catalog.map((m) => {
      const override = overrideMap.get(m.moduleKey);
      // Absent row = enabled default (extends lib/entitlements.ts). Core is always on.
      const enabled = m.isCore ? true : override?.enabled ?? true;
      return {
        moduleKey: m.moduleKey,
        label: m.label,
        isCore: m.isCore,
        enabled,
        inBundle: bundle.has(m.moduleKey),
      };
    });

    const quotaOverrides: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (r.quotaOverrides && Object.keys(r.quotaOverrides).length > 0) {
        quotaOverrides[r.moduleKey] = r.quotaOverrides;
      }
    }

    return {
      vertical,
      enabledModules: modules.filter((m) => m.enabled).map((m) => m.moduleKey),
      modules,
      quotaOverrides,
    };
  },

  /**
   * Toggle a single module for the tenant (per-tenant on/off). Core modules
   * cannot be disabled. Returns the upserted entitlement row.
   */
  async setEntitlement(
    ctx: TenantContext,
    moduleKey: string,
    enabled: boolean,
    actorUserId?: string,
  ): Promise<TenantEntitlementRow> {
    const key = moduleKey?.trim();
    if (!key) throw new ServiceError("module_key wajib diisi", 400, "validation");

    const mod = await onboardingRepo.getModuleByKey(key);
    if (!mod) throw new ServiceError("Modul tidak ditemukan di katalog", 404, "not_found");
    if (mod.isCore && !enabled) {
      throw new ServiceError("Modul inti tidak dapat dinonaktifkan", 409, "core_module");
    }

    const row = await onboardingRepo.upsertEntitlement(ctx, key, { enabled });
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId ?? ctx.userId,
      action: "onboarding.entitlement.set",
      targetType: "tenant_entitlement_v2",
      targetId: row.id,
      meta: { moduleKey: key, enabled },
    });
    return row;
  },
};

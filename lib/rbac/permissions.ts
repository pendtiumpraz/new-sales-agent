// RBAC matrix (Fase 1, doc 19). Usable now (with the demo auth store) and by the
// real Auth.js session in slice 2 — both resolve to a canonical Role, then gate
// with `can()`. Enforcement is layered: DB (RLS), API (guards), UI (hide actions).

export type Role = "superadmin" | "tenant_owner" | "tenant_admin" | "member";

export type Permission =
  | "platform.manage"        // superadmin only: all tenants, infra, kill-switch (doc 26)
  | "tenant.billing"         // plans, invoices, payment (doc 27)
  | "tenant.members.manage"  // invite/remove members, set roles
  | "tenant.settings.manage" // integrations, mailboxes, AI keys/model (doc 23/24)
  | "data.read"              // contacts, companies, prospects
  | "data.write"             // create/edit/import contacts & companies
  | "data.export"            // export / DSAR (doc 25)
  | "campaign.manage"        // cadences/playbooks, outreach (doc 23/29)
  | "mailbox.connect"        // connect own sending account (doc 23)
  | "ai.use";                // run AI features (metered, doc 24)

const ALL: Permission[] = [
  "platform.manage",
  "tenant.billing",
  "tenant.members.manage",
  "tenant.settings.manage",
  "data.read",
  "data.write",
  "data.export",
  "campaign.manage",
  "mailbox.connect",
  "ai.use",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Platform operator — everything (RLS bypass handled separately, doc 26).
  superadmin: ALL,
  // Tenant owner — full tenant control incl. billing.
  tenant_owner: [
    "tenant.billing",
    "tenant.members.manage",
    "tenant.settings.manage",
    "data.read",
    "data.write",
    "data.export",
    "campaign.manage",
    "mailbox.connect",
    "ai.use",
  ],
  // Tenant admin — manage tenant, no billing.
  tenant_admin: [
    "tenant.members.manage",
    "tenant.settings.manage",
    "data.read",
    "data.write",
    "data.export",
    "campaign.manage",
    "mailbox.connect",
    "ai.use",
  ],
  // Member (rep/manager) — do the work, connect own mailbox.
  member: ["data.read", "data.write", "campaign.manage", "mailbox.connect", "ai.use"],
};

/** Does `role` have `permission`? */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** All permissions granted to a role (handy for UI gating). */
export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Map a `membership.role` value (`tenant_owner|tenant_admin|sales_manager|
 * sales_rep`) onto a canonical RBAC `Role`. `is_superadmin` on the user overrides
 * everything. Shared by the login `authorize()` (lib/auth/auth.ts) and the
 * per-request re-resolution in `getTenantContext()` (audit #7) so both derive the
 * effective role from the SAME source of truth — pure, no Node imports, edge-safe.
 */
export function membershipRole(role: string, isSuperadmin: boolean): Role {
  if (isSuperadmin) return "superadmin";
  switch (role) {
    case "tenant_owner":
      return "tenant_owner";
    case "tenant_admin":
      return "tenant_admin";
    case "sales_manager":
    case "sales_rep":
    default:
      return "member";
  }
}

/**
 * Map the prototype's display roles (lib/auth/demo-accounts.ts) onto canonical
 * RBAC roles so the demo can exercise all four. Replaced by membership.role once
 * Auth.js lands (slice 2).
 */
export function mapDemoRole(demoRole: string): Role {
  switch (demoRole) {
    case "Superadmin":
      return "superadmin";
    case "Admin":
      return "tenant_owner";
    case "Sales Manager":
      return "tenant_admin";
    case "Sales Rep":
    default:
      return "member";
  }
}

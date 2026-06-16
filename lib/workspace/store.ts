import { and, eq, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { workspaceTable, personTable } from "@/lib/db/schema";
import { isManager } from "@/lib/team/members";

// Sales workspace data layer (doc 44). A workspace is a rep's focused container:
// pick a product/purpose, target a segment, run the flow scoped to it. A rep has
// many; managers/superadmin see ALL the tenant's workspaces, a member sees only
// their own (per-rep isolation, doc 41). All queries run inside withTenant so RLS
// scopes to the tenant; the manager-vs-member split is an extra WHERE on
// ownerUserId for members.

export type WorkspaceType = "lead_gen" | "partner" | "offering" | "retention" | "custom";

export type Workspace = typeof workspaceTable.$inferSelect;

export interface CreateWorkspaceInput {
  name: string;
  type: WorkspaceType;
  productId?: string | null;
  targetSegment?: string | null;
}

export interface UpdateWorkspaceInput {
  name?: string;
  type?: WorkspaceType;
  productId?: string | null;
  targetSegment?: string | null;
  status?: string;
}

// List workspaces visible to ctx: managers (tenant_owner/tenant_admin/superadmin)
// get every workspace in the tenant; members are scoped to the ones they own.
export async function listWorkspaces(ctx: TenantContext): Promise<Workspace[]> {
  const scoped = !isManager(ctx.role);
  return withTenant(ctx, (tx) =>
    scoped
      ? tx
          .select()
          .from(workspaceTable)
          .where(eq(workspaceTable.ownerUserId, ctx.userId))
      : tx.select().from(workspaceTable),
  );
}

// One workspace by id. Returns null when missing OR when a member tries to read a
// workspace they don't own (managers may read any in the tenant).
export async function getWorkspace(ctx: TenantContext, id: string): Promise<Workspace | null> {
  const rows = await withTenant(ctx, (tx) =>
    tx.select().from(workspaceTable).where(eq(workspaceTable.id, id)).limit(1),
  );
  const ws = rows[0] ?? null;
  if (!ws) return null;
  if (!isManager(ctx.role) && ws.ownerUserId !== ctx.userId) return null;
  return ws;
}

export async function createWorkspace(ctx: TenantContext, input: CreateWorkspaceInput): Promise<Workspace> {
  const id = "ws_" + crypto.randomUUID();
  const rows = await withTenant(ctx, (tx) =>
    tx
      .insert(workspaceTable)
      .values({
        id,
        tenantId: ctx.tenantId,
        ownerUserId: ctx.userId,
        name: input.name,
        type: input.type,
        productId: input.productId ?? null,
        targetSegment: input.targetSegment ?? null,
        status: "active",
      })
      .returning(),
  );
  return rows[0];
}

// Update name/type/product/targetSegment/status. Members may only modify their
// own workspace; the caller (route) enforces the 403 before reaching here, but we
// re-check ownership in the WHERE so a member can never touch another rep's row.
export async function updateWorkspace(
  ctx: TenantContext,
  id: string,
  patch: UpdateWorkspaceInput,
): Promise<Workspace | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.productId !== undefined) set.productId = patch.productId;
  if (patch.targetSegment !== undefined) set.targetSegment = patch.targetSegment;
  if (patch.status !== undefined) set.status = patch.status;

  const where = isManager(ctx.role)
    ? eq(workspaceTable.id, id)
    : and(eq(workspaceTable.id, id), eq(workspaceTable.ownerUserId, ctx.userId));

  const rows = await withTenant(ctx, (tx) => tx.update(workspaceTable).set(set).where(where).returning());
  return rows[0] ?? null;
}

// Archive = soft delete (status → archived). Same ownership guard as update.
export async function archiveWorkspace(ctx: TenantContext, id: string): Promise<Workspace | null> {
  return updateWorkspace(ctx, id, { status: "archived" });
}

// Number of leads assigned to this workspace (person.workspaceId = id).
export async function workspaceLeadCount(ctx: TenantContext, id: string): Promise<number> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ count: sql<number>`count(*)::int` })
      .from(personTable)
      .where(eq(personTable.workspaceId, id)),
  );
  return rows[0]?.count ?? 0;
}

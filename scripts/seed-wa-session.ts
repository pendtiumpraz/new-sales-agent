/**
 * Seed a testable WhatsApp setup so the WA loop works end-to-end:
 *   - tenant `t_default` ACTIVE (the id every demo-account session uses, see
 *     lib/auth/auth.ts DEFAULT_TENANT_ID)
 *   - memberships for the 4 demo accounts → t_default (so Tim/admin lists populate)
 *   - a connected wa_session `rep:<repId>` owned by the Sales Rep
 *
 * Idempotent. Run: `npm run db:seed-wa` (after `db:push` + `db:seed`).
 * For real AI replies also run `db:seed-ai` and set an active model.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

import { db } from "../lib/db/client";
import { tenantsTable, membershipsTable, waSessionTable, usersTable, workspaceTable } from "../lib/db/schema";
import { DEMO_ACCOUNTS, type DemoRole } from "../lib/auth/demo-accounts";

const TENANT_ID = "t_default"; // must match auth.ts DEFAULT_TENANT_ID

const RBAC: Record<DemoRole, string> = {
  Superadmin: "superadmin",
  Admin: "tenant_owner",
  "Sales Manager": "tenant_admin",
  "Sales Rep": "member",
};

async function main() {
  // Active tenant the demo sessions point at.
  await db
    .insert(tenantsTable)
    .values({ id: TENANT_ID, name: "Maira Demo", plan: "growth", status: "active" })
    .onConflictDoUpdate({ target: tenantsTable.id, set: { status: "active", name: "Maira Demo" } });

  // Demo users + memberships (login bypasses membership, but Tim/admin need them).
  for (const a of DEMO_ACCOUNTS) {
    await db
      .insert(usersTable)
      .values({ id: a.id, name: a.name, email: a.email.toLowerCase(), password: a.password, role: a.role, avatarColor: a.avatarColor, scope: a.scope })
      .onConflictDoNothing();
    await db
      .insert(membershipsTable)
      .values({ id: `m_default_${a.id}`, tenantId: TENANT_ID, userId: a.id, role: RBAC[a.role], status: "active" })
      .onConflictDoNothing();
  }

  // Connected WA session owned by the Sales Rep.
  const rep = DEMO_ACCOUNTS.find((a) => a.role === "Sales Rep") ?? DEMO_ACCOUNTS[0];
  const sessionId = `rep:${rep.id}`;
  await db
    .insert(waSessionTable)
    .values({ id: sessionId, tenantId: TENANT_ID, ownerType: "rep", ownerId: rep.id, status: "connected", waNumber: "628100000000" })
    .onConflictDoUpdate({
      target: waSessionTable.id,
      set: { tenantId: TENANT_ID, ownerType: "rep", ownerId: rep.id, status: "connected", waNumber: "628100000000", updatedAt: new Date() },
    });

  // Demo workspace (no product yet → opening it shows the "pilih produk" step).
  await db
    .insert(workspaceTable)
    .values({
      id: "ws_demo",
      tenantId: TENANT_ID,
      ownerUserId: rep.id,
      name: "Demo — Closing Flow",
      type: "offering",
      productId: null,
      targetSegment: null,
      status: "active",
    })
    .onConflictDoNothing();

  console.log("WA test setup seeded:");
  console.log(`  tenant     : ${TENANT_ID} (active)`);
  console.log(`  memberships: ${DEMO_ACCOUNTS.length} (demo accounts)`);
  console.log(`  wa_session : ${sessionId} (connected, owner ${rep.name})`);
  console.log(`  workspace  : ws_demo (owner ${rep.name}, belum ada produk → buka /workspaces)`);
  console.log("\nTest inbound:");
  console.log(`  curl -X POST localhost:3100/api/wa/gateway/inbound \\`);
  console.log(`   -H "x-wa-gateway-token: $WA_GATEWAY_TOKEN" -H "Content-Type: application/json" \\`);
  console.log(`   -d '{"sessionId":"${sessionId}","from":"628123456789","body":"kak harganya berapa?","name":"Budi"}'`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    setTimeout(() => process.exit(0), 100).unref();
  });

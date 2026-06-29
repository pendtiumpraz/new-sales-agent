// Two-tenant DB-level isolation test (AUDIT #3 backstop).
//
// Proves that, with RLS applied (drizzle/rls/enable-rls.sql) and the app
// connecting as the NOBYPASSRLS `app_user` role (APP_POSTGRES_URL), a session
// scoped to tenant A CANNOT read — or write into — tenant B's rows, and that an
// unset tenant context is fail-closed (sees nothing).
//
// RUN (after creating the role + applying RLS — see drizzle/rls/README.md):
//   npx tsx scripts/test-tenant-isolation.mts
//
// REQUIRES:
//   • APP_POSTGRES_URL_NON_POOLING (or APP_POSTGRES_URL) — the NOBYPASSRLS role.
//     A SINGLE non-pooling connection is used so set_config(...) persists across
//     the statements of one logical session.
//   • POSTGRES_URL_NON_POOLING (or POSTGRES_URL) — the OWNER (BYPASSRLS) role,
//     used ONLY to seed + clean up the two tenants' fixture rows (writing into
//     both tenants requires bypassing the very policy under test).
//
// Exit 0 = isolation holds. Non-zero = a leak (or misconfig) — fail CI.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@vercel/postgres";

// ── Load .env.local (the @vercel/postgres CLI path doesn't auto-load it) ──────
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const eq = l.indexOf("=");
    if (eq === -1) continue;
    const k = l.slice(0, eq).trim();
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const appUrl = process.env.APP_POSTGRES_URL_NON_POOLING || process.env.APP_POSTGRES_URL;
const ownerUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!appUrl) {
  console.log("SKIP=no APP_POSTGRES_URL[_NON_POOLING] set — cannot test RLS without the NOBYPASSRLS app_user role.");
  console.log("     Create it (drizzle/rls/create-app-role.sql), apply enable-rls.sql, set APP_POSTGRES_URL, then re-run.");
  process.exit(1);
}
if (!ownerUrl) {
  console.log("SKIP=no POSTGRES_URL[_NON_POOLING] set — need the owner role to seed two-tenant fixtures.");
  process.exit(1);
}
if (appUrl === ownerUrl) {
  console.log("FAIL=APP_POSTGRES_URL equals the owner URL. The app role must be a SEPARATE NOBYPASSRLS role, or RLS is bypassed and this test is meaningless.");
  process.exit(1);
}

// Unique fixture tenants/rows so a failed run can't collide or leak into real data.
const run = randomUUID().slice(0, 8);
const tenantA = `tnt_isolA_${run}`;
const tenantB = `tnt_isolB_${run}`;
const rowA = `cmp_isolA_${run}`;
const rowB = `cmp_isolB_${run}`;

const owner = createClient({ connectionString: ownerUrl });
const app = createClient({ connectionString: appUrl });

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!pass) failures++;
}

async function setAppTenant(tenantId: string, role = "member") {
  // Mirror withTenant(): transaction-local context. We run each app-role
  // assertion inside its own BEGIN/COMMIT so set_config is scoped, exactly like
  // the app's per-request transaction.
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await app.query("SELECT set_config('app.user_id', $1, true)", ["usr_isol_test"]);
  await app.query("SELECT set_config('app.role', $1, true)", [role]);
}

try {
  await owner.connect();
  await app.connect();

  // Guard: the app role MUST NOT have BYPASSRLS, else the test proves nothing.
  const { rows: who } = await app.query("SELECT current_user AS u, current_setting('is_superuser') AS su");
  const { rows: byp } = await app.query(
    "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  const bypasses = byp[0]?.rolbypassrls === true || who[0]?.su === "on";
  check("app role does NOT bypass RLS", !bypasses, `current_user=${who[0]?.u}`);
  if (bypasses) throw new Error("app role bypasses RLS — fix APP_POSTGRES_URL to point at app_user.");

  // ── Seed one company per tenant, as the OWNER (bypasses RLS to write both) ──
  for (const [id, tid, name] of [
    [rowA, tenantA, "Isolation Co A"],
    [rowB, tenantB, "Isolation Co B"],
  ] as const) {
    await owner.query(
      `INSERT INTO company_v2 (id, tenant_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [id, tid, name],
    );
  }

  // ── 1. Tenant A context sees A's row, NOT B's ──
  await setAppTenant(tenantA);
  const { rows: aRows } = await app.query(
    "SELECT id, tenant_id FROM company_v2 WHERE id IN ($1, $2)",
    [rowA, rowB],
  );
  await app.query("COMMIT");
  const aIds = aRows.map((r: any) => r.id);
  check("tenant A reads its own row", aIds.includes(rowA), `got [${aIds.join(",")}]`);
  check("tenant A CANNOT read tenant B's row", !aIds.includes(rowB), `got [${aIds.join(",")}]`);

  // ── 2. Symmetric: tenant B sees B's row, NOT A's ──
  await setAppTenant(tenantB);
  const { rows: bRows } = await app.query(
    "SELECT id FROM company_v2 WHERE id IN ($1, $2)",
    [rowA, rowB],
  );
  await app.query("COMMIT");
  const bIds = bRows.map((r: any) => r.id);
  check("tenant B reads its own row", bIds.includes(rowB), `got [${bIds.join(",")}]`);
  check("tenant B CANNOT read tenant A's row", !bIds.includes(rowA), `got [${bIds.join(",")}]`);

  // ── 3. Fail-closed: NO tenant context sees nothing ──
  await app.query("BEGIN");
  const { rows: noneRows } = await app.query(
    "SELECT id FROM company_v2 WHERE id IN ($1, $2)",
    [rowA, rowB],
  );
  await app.query("COMMIT");
  check("unset tenant context is fail-closed (0 rows)", noneRows.length === 0, `got ${noneRows.length} rows`);

  // ── 4. WITH CHECK: tenant A cannot INSERT a row stamped with tenant B ──
  await setAppTenant(tenantA);
  let writeBlocked = false;
  try {
    await app.query(
      `INSERT INTO company_v2 (id, tenant_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [`cmp_isolX_${run}`, tenantB, "Cross-tenant write attempt"],
    );
  } catch {
    writeBlocked = true;
  }
  try { await app.query("ROLLBACK"); } catch {}
  check("tenant A CANNOT write a row stamped with tenant B (WITH CHECK)", writeBlocked);

  // ── 5. Superadmin context sees BOTH tenants' rows ──
  await setAppTenant("tnt_ignored", "superadmin");
  const { rows: superRows } = await app.query(
    "SELECT id FROM company_v2 WHERE id IN ($1, $2)",
    [rowA, rowB],
  );
  await app.query("COMMIT");
  const superIds = superRows.map((r: any) => r.id);
  check(
    "superadmin context sees BOTH tenants' rows",
    superIds.includes(rowA) && superIds.includes(rowB),
    `got [${superIds.join(",")}]`,
  );
} catch (e: any) {
  console.log("ERROR=" + (e?.message || String(e)));
  failures++;
} finally {
  // Cleanup as owner (hard-delete the fixtures regardless of outcome).
  try {
    await owner.query("DELETE FROM company_v2 WHERE id LIKE $1", [`cmp_isol%_${run}`]);
  } catch (e: any) {
    console.log("WARN=cleanup failed: " + (e?.message || String(e)));
  }
  try { await app.end(); } catch {}
  try { await owner.end(); } catch {}
}

if (failures > 0) {
  console.log(`RESULT=FAIL (${failures} check(s) failed) — tenant isolation is NOT holding at the DB layer.`);
  process.exit(1);
}
console.log("RESULT=PASS — two-tenant DB-level isolation holds (read + write + fail-closed + superadmin).");
process.exit(0);

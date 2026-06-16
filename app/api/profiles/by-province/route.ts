import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { personTable } from "@/lib/db/schema";
import { provinceFromLocation, centroidOf, UNKNOWN_PROVINCE } from "@/lib/geo/province";

export const runtime = "nodejs";

// GET /api/profiles/by-province (doc 40) — aggregate the tenant's people by
// province for the lead map. Optional filters:
//   ?source=import|crawl|hunter   (matched loosely against person.source)
//   ?leadType=b2c_customer|b2b_partner|unknown
//   ?skill=<text>                 (matches title/department contains)
function sourceBucket(source: string | null | undefined): "import" | "crawl" | "hunter" | "other" {
  const s = (source ?? "").toLowerCase();
  if (!s) return "other";
  if (s.includes("import") || s.includes("excel")) return "import";
  if (s.includes("hunter")) return "hunter";
  if (s.includes("crawl") || s.includes("linkedin") || s.includes("extension") || s.includes("web")) return "crawl";
  return "other";
}

export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx || !hasDb()) return NextResponse.json({ data: [], source: "mock" });

  const url = new URL(req.url);
  const fSource = url.searchParams.get("source");
  const fLead = url.searchParams.get("leadType");
  const fSkill = (url.searchParams.get("skill") || "").trim().toLowerCase();

  try {
    const persons = await withTenant(ctx, (tx) => tx.select().from(personTable));

    const counts = new Map<string, number>();
    for (const p of persons) {
      if (fSource && fSource !== "all" && sourceBucket(p.source) !== fSource) continue;
      if (fLead && fLead !== "all" && (p.leadType ?? "unknown") !== fLead) continue;
      if (fSkill) {
        const role = `${p.title ?? ""} ${p.department ?? ""}`.toLowerCase();
        if (!role.includes(fSkill)) continue;
      }
      const prov = provinceFromLocation(p.location);
      counts.set(prov, (counts.get(prov) ?? 0) + 1);
    }

    const data = [...counts.entries()]
      .filter(([prov]) => prov !== UNKNOWN_PROVINCE)
      .map(([province, people]) => {
        const c = centroidOf(province);
        return c ? { province, lat: c[0], lng: c[1], people } : null;
      })
      .filter((x): x is { province: string; lat: number; lng: number; people: number } => x !== null)
      .sort((a, b) => b.people - a.people);

    const unknown = counts.get(UNKNOWN_PROVINCE) ?? 0;
    return NextResponse.json({ data, unknown, source: "db" });
  } catch (err) {
    console.error("[api/profiles/by-province GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

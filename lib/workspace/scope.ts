// Workspace-first routing (doc 44). Scoped features live INSIDE a workspace and
// require an active one; global features (cross-workspace overview, monitoring,
// marketplace, reports, settings, docs, admin, the workspace picker itself) do not.

// Routes accessible WITHOUT an active workspace.
export const GLOBAL_PREFIXES = [
  "/dashboard",
  "/marketplace",
  "/reports",
  "/settings",
  "/documentation",
  "/content", // content store isn't workspace-aware — global (audit: was gated but showed global data)
  "/workspace", // the workspace hub (picker + per-product flow) — global, not gated on itself
  "/admin",
];

/** True when a route requires an active workspace (everything not global). */
export function isScopedRoute(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname === "/") return false;
  if (GLOBAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  // Scoped: /contacts, /pipeline, /inbox, /cadences, /escalations, /content,
  // /penawaran, /retention, /ecommerce, /field, /workspace/[id], …
  return true;
}

/** Append ?workspace=<id> to a scoped nav href so the page filters to it. */
export function withWorkspace(href: string, workspaceId: string | null | undefined): string {
  if (!workspaceId || !isScopedRoute(href.split("?")[0])) return href;
  return href + (href.includes("?") ? "&" : "?") + "workspace=" + encodeURIComponent(workspaceId);
}

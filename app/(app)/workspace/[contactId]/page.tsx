import { redirect } from "next/navigation";

// RETIRED. The per-contact unified workbench (/workspace/[contactId], doc wave-3)
// is replaced by the workspace closing-flow at /workspaces (doc 44). Any old
// deep-link now lands on the workspace list. The `[contactId]` segment is kept so
// existing URLs resolve to this redirect instead of 404-ing.
export default function LegacyWorkspaceRedirect() {
  redirect("/workspaces");
}

import { redirect } from "next/navigation";

// `/workspaces` was renamed to the singular `/workspace` in the rebuild. This
// server-side redirect preserves any external deep-links / bookmarks into the
// old plural route so they resolve instead of 404-ing.
export default function WorkspacesRedirect() {
  redirect("/workspace");
}

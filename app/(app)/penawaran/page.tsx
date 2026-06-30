import { redirect } from "next/navigation";

// `/penawaran` (offers) was merged into the unified pipeline view in the
// rebuild. This server-side redirect preserves any external deep-links /
// bookmarks into the old route so they resolve instead of 404-ing.
export default function PenawaranRedirect() {
  redirect("/pipeline");
}

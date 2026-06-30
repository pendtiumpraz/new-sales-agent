import { redirect } from "next/navigation";

// `/team` moved under settings as `/settings/team` in the rebuild. This
// server-side redirect preserves any external deep-links / bookmarks into the
// old top-level route so they resolve instead of 404-ing.
export default function TeamRedirect() {
  redirect("/settings/team");
}

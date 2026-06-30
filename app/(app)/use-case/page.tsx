import { redirect } from "next/navigation";

// The old `/use-case` picker was folded into the onboarding flow in the rebuild.
// This server-side redirect preserves any external deep-links / bookmarks into
// the legacy route so they resolve instead of 404-ing.
export default function UseCaseRedirect() {
  redirect("/onboarding");
}

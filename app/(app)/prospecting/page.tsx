import { redirect } from "next/navigation";

// Prospek (lead discovery) was folded into Contacts as the "Penemuan Lead" tab
// per feature-revisions.md §1+§2 (Contacts and Pipeline merged into one view).
// This redirect preserves any external deep-links into /prospecting.
export default function ProspectingPage() {
  redirect("/contacts?tab=discovery");
}

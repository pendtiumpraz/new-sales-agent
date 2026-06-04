import { redirect } from "next/navigation";

// Marketing landing page disabled — visiting `/` now goes straight to /login.
// The /login page itself bounces authenticated users to /dashboard, so there
// is no UX flash for returning users.
export default function Home() {
  redirect("/login");
}

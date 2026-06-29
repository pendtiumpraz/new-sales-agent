// Demo credentials for the prototype. The hardcoded LOGIN set
// (`DEMO_ACCOUNTS`) is ONLY ever reachable behind the demo/non-prod gate
// (`isDemoMode()` in lib/auth/auth.ts) and deliberately contains NO
// "Superadmin" account, so a hardcoded record can never mint platform access
// (audit #1). A real platform operator must be a scrypt-hashed `app_user` row
// with `is_superadmin = true` (seed via `db:seed`).
//
// `DemoRole` still includes "Superadmin" because it doubles as the sidebar
// DISPLAY label for a genuine superadmin session resolved from the DB (see
// components/auth/auth-sync.tsx) — that is a label, not a credential.
export type DemoRole = "Superadmin" | "Admin" | "Sales Manager" | "Sales Rep";

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: DemoRole;
  avatarColor: string;
  /** Short Indonesian sentence describing what this account sees. */
  scope: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "u_admin",
    name: "Andi Hidayat",
    email: "admin@mairasales.com",
    password: "admin1234",
    role: "Admin",
    avatarColor: "#14B8A6",
    scope:
      "Mengelola tim, integrasi, dan Basis Pengetahuan AI. Tidak melihat tagihan.",
  },
  {
    id: "u_manager",
    name: "Rina Permata",
    email: "rina@mairasales.com",
    password: "rina1234",
    role: "Sales Manager",
    avatarColor: "#F59E0B",
    scope:
      "Pipeline, retensi, dan laporan tim. Bisa menyetujui handoff & cadence.",
  },
  {
    id: "u_rep",
    name: "Teguh Saputra",
    email: "teguh@mairasales.com",
    password: "teguh1234",
    role: "Sales Rep",
    avatarColor: "#3B82F6",
    scope: "Inbox WhatsApp, kontak yang ditugaskan, dan workspace prospek.",
  },
];

/** The default account for "open the demo without logging in" flows. This is a
 *  non-privileged Admin (NOT a superadmin — see the audit #1 note above). */
export const DEFAULT_DEMO_ACCOUNT = DEMO_ACCOUNTS[0]; // Admin

/** Validate credentials against the demo set. */
export function findAccount(
  email: string,
  password: string,
): DemoAccount | null {
  const e = email.trim().toLowerCase();
  return (
    DEMO_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === e && a.password === password,
    ) ?? null
  );
}

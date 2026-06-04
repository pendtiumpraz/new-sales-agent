// Demo credentials for the prototype. Roles are display-only for now — no
// feature gating beyond the profile badge — but the structure is ready for
// per-role access checks later.

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
    id: "u_superadmin",
    name: "Almira Rana",
    email: "superadmin@agentic.co.id",
    password: "super1234",
    role: "Superadmin",
    avatarColor: "#FB5E3B",
    scope:
      "Akses penuh — semua modul, semua tim, pengaturan workspace, dan kepatuhan UU PDP.",
  },
  {
    id: "u_admin",
    name: "Andi Hidayat",
    email: "admin@agentic.co.id",
    password: "admin1234",
    role: "Admin",
    avatarColor: "#14B8A6",
    scope:
      "Mengelola tim, integrasi, dan Basis Pengetahuan AI. Tidak melihat tagihan.",
  },
  {
    id: "u_manager",
    name: "Rina Permata",
    email: "rina@agentic.co.id",
    password: "rina1234",
    role: "Sales Manager",
    avatarColor: "#F59E0B",
    scope:
      "Pipeline, retensi, dan laporan tim. Bisa menyetujui handoff & cadence.",
  },
  {
    id: "u_rep",
    name: "Teguh Saputra",
    email: "teguh@agentic.co.id",
    password: "teguh1234",
    role: "Sales Rep",
    avatarColor: "#3B82F6",
    scope: "Inbox WhatsApp, kontak yang ditugaskan, dan workspace prospek.",
  },
];

/** The default account for "open the demo without logging in" flows. */
export const DEFAULT_DEMO_ACCOUNT = DEMO_ACCOUNTS[0]; // Superadmin

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

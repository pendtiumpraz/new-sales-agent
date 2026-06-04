import { create } from "zustand";

import {
  DEFAULT_DEMO_ACCOUNT,
  findAccount,
  type DemoAccount,
} from "@/lib/auth/demo-accounts";

interface AuthState {
  currentUser: DemoAccount;
  // Whether the user explicitly logged in this session (vs. defaulted to Superadmin).
  authenticated: boolean;
  login: (email: string, password: string) => DemoAccount | null;
  logout: () => void;
  setUser: (user: DemoAccount) => void;
}

// In-memory only (build.md hard rule: no localStorage in the prototype).
// Defaults to Superadmin so /dashboard works on cold-load without a login.
export const useAuthStore = create<AuthState>((set) => ({
  currentUser: DEFAULT_DEMO_ACCOUNT,
  authenticated: false,
  login: (email, password) => {
    const account = findAccount(email, password);
    if (!account) return null;
    set({ currentUser: account, authenticated: true });
    return account;
  },
  logout: () =>
    set({ currentUser: DEFAULT_DEMO_ACCOUNT, authenticated: false }),
  setUser: (currentUser) => set({ currentUser, authenticated: true }),
}));

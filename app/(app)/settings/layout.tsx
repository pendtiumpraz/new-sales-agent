import { SettingsNav } from "@/components/settings/settings-nav";

// Unified Settings shell (redesign IA §3): every /settings/* route renders in
// the right pane next to the shared SettingsNav, so the 11 sections read as one
// surface instead of separate sidebar destinations. Pages are unchanged.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Settings sub-nav is a TOP tab bar (not a 2nd sidebar) → stack, don't flex.
  return (
    <div>
      <SettingsNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

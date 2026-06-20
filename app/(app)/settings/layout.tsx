import { SettingsNav } from "@/components/settings/settings-nav";

// Unified Settings shell (redesign IA §3): every /settings/* route renders in
// the right pane next to the shared SettingsNav, so the 11 sections read as one
// surface instead of separate sidebar destinations. Pages are unchanged.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:flex">
      <SettingsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

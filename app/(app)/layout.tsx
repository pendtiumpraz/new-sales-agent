import { TopNav } from "@/components/layout/top-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="min-w-0">{children}</main>
    </div>
  );
}

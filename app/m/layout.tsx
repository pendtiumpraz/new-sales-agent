import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PhoneFrame } from "@/components/shared/phone-frame";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { BrandLogo } from "@/components/shared/brand-logo";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-100 p-6">
      <PhoneFrame>
        <div className="flex h-full flex-col bg-background">
          <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
          <MobileTabBar />
        </div>
      </PhoneFrame>
      <Link
        href="/field"
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke dasbor desktop
      </Link>
      <div className="flex items-center gap-2 opacity-60">
        <BrandLogo size="sm" showWord={false} />
        <span className="text-xs text-muted-foreground">
          Aplikasi Sales Lapangan
        </span>
      </div>
    </div>
  );
}

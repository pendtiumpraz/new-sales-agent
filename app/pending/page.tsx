"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Clock, LogOut, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardGridSkeleton } from "@/components/shared/skeletons";

interface Status {
  active?: boolean;
  status?: string;
  activeUntil?: string | null;
  reason?: string;
}

const MESSAGES: Record<string, string> = {
  pending: "Akun Anda sudah dibuat dan sedang menunggu aktivasi oleh superadmin. Anda akan bisa masuk setelah diaktifkan.",
  expired: "Masa aktif akun Anda telah berakhir. Hubungi superadmin untuk perpanjangan.",
  suspended: "Akun Anda saat ini di-suspend. Hubungi superadmin untuk informasi lebih lanjut.",
};

export default function PendingPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [info, setInfo] = useState<Status | null>(null);

  async function check() {
    try {
      const r = await fetch("/api/tenant/status");
      const j = (await r.json()) as Status;
      setInfo(j);
      if (j.active) router.replace("/dashboard");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (sessionStatus === "authenticated") void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  const reason = info?.reason ?? "pending";

  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <CardGridSkeleton count={1} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Clock className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-semibold">Menunggu aktivasi</h1>
          <p className="text-sm text-muted-foreground">
            {MESSAGES[reason] ?? MESSAGES.pending}
          </p>
          {info?.activeUntil && (
            <p className="text-xs text-muted-foreground">
              Masa aktif s/d{" "}
              <span className="font-medium text-foreground">
                {new Date(info.activeUntil).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </p>
          )}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={check}>
              <RefreshCw className="h-4 w-4" /> Periksa lagi
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="h-4 w-4" /> Keluar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

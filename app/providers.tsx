"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { SessionProvider } from "next-auth/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthSync } from "@/components/auth/auth-sync";
import { useUiStore } from "@/lib/stores/ui-store";
import idMessages from "@/messages/id.json";
import enMessages from "@/messages/en.json";

const MESSAGES = { id: idMessages, en: enMessages } as const;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
  );
  const locale = useUiStore((s) => s.locale);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider
          locale={locale}
          messages={MESSAGES[locale]}
          timeZone="Asia/Jakarta"
        >
          <TooltipProvider delayDuration={200}>
            <AuthSync />
            {children}
            <Toaster />
          </TooltipProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

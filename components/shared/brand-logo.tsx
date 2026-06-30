"use client";

import { Radar } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEFAULT_BRAND_NAME, useUserBrand } from "@/components/layout/user-theme-provider";

/**
 * Brand mark + wordmark for the live app chrome. Per-USER white-label: renders the
 * signed-in user's logo image + brand name when set (via {@link useUserBrand}, which
 * shares the `["user-theme"]` query so it re-themes the instant branding is saved),
 * falling back to the canonical Radar mark + "Maira Sales". Teal/primary used
 * sparingly as a brand moment (build.md §3.1).
 */
export function BrandLogo({
  className,
  showWord = true,
  size = "default",
}: {
  className?: string;
  showWord?: boolean;
  size?: "default" | "sm";
}) {
  const { logoUrl, brandName } = useUserBrand();
  const box = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const icon = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  const word = brandName ?? DEFAULT_BRAND_NAME;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
          logoUrl ? "bg-transparent" : "bg-primary text-primary-foreground",
          box,
        )}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={word} className="h-full w-full object-contain" />
        ) : (
          <Radar className={icon} />
        )}
      </span>
      {showWord && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {brandName ? (
            word
          ) : (
            <>
              Maira<span className="text-muted-foreground"> Sales</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

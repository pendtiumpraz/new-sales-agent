"use client";

import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

/** ID / EN segmented toggle. Switches next-intl locale in-memory (build.md §3.5). */
export function LanguageToggle({ className }: { className?: string }) {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border bg-card p-0.5 text-xs font-medium",
        className,
      )}
    >
      {(["id", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={cn(
            "rounded px-2 py-1 uppercase transition-colors",
            locale === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

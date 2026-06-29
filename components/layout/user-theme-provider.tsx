"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

/**
 * Per-USER white-label theme (Sainskerta Loop Phase 04 · branding domain).
 *
 * Reads the signed-in user's resolved theme from GET /api/branding/theme — which
 * returns `{ theme, vars }` where `vars` is a map of CSS custom properties already
 * derived by `brandingService.resolveThemeVars` (hex→HSL channels, foreground,
 * hover, sidebar). We apply those vars to the document root so EVERY shadcn token
 * (`--primary`, `--ring`, `--accent`, …) and the raw brand tokens flip live, and
 * we inject the sanitized `custom_css` into a single managed <style> tag.
 *
 * Grain = user: each operator sees their own brand. Defaults are Coral Sunset, so
 * when there's no row (or no DB) the app keeps the canonical palette untouched.
 */

interface ThemeResponse {
  ok: boolean;
  data?: {
    theme: { customCss: string | null; faviconUrl: string | null; isDefault: boolean };
    vars: Record<string, string>;
  };
}

const STYLE_ID = "user-theme-custom-css";

export function UserThemeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  const { data } = useQuery<ThemeResponse | null>({
    queryKey: ["user-theme"],
    enabled: status === "authenticated",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/branding/theme");
      if (!r.ok) return null; // 401/503 → keep defaults; never throw the shell down
      return (await r.json()) as ThemeResponse;
    },
  });

  useEffect(() => {
    const payload = data?.data;
    const root = document.documentElement;
    // Track which vars we set so we can cleanly revert on logout / unmount.
    const applied: string[] = [];

    if (payload?.vars) {
      for (const [name, value] of Object.entries(payload.vars)) {
        const prop = name.startsWith("--") ? name : `--${name}`;
        root.style.setProperty(prop, value);
        applied.push(prop);
      }
    }

    // Sanitized per-user custom CSS → one managed <style> tag (replace, not stack).
    const css = payload?.theme.customCss ?? "";
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (css) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = STYLE_ID;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    } else if (styleEl) {
      styleEl.remove();
    }

    // Per-user favicon swap (white-label).
    const favicon = payload?.theme.faviconUrl;
    let link: HTMLLinkElement | null = null;
    let previousHref: string | null = null;
    if (favicon) {
      link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) {
        previousHref = link.href;
        link.href = favicon;
      }
    }

    return () => {
      for (const prop of applied) root.style.removeProperty(prop);
      if (link && previousHref !== null) link.href = previousHref;
    };
  }, [data]);

  return <>{children}</>;
}

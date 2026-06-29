import type { ThemePatch } from "@/modules/branding/service";

/**
 * Branding editor token model (Module 1 · per-user white-label).
 *
 * The mockup edits 11 named tokens. The backend (`ThemePatch`) has a fixed set of
 * hex columns PLUS a free-form `themeTokens` escape-hatch map. Some editor tokens
 * map onto a dedicated column (`primary→primaryColor`, `background→backgroundColor`,
 * …); the rest (`tertiary`, `highlight`, `card`) have no column and round-trip
 * through `themeTokens` under their shell CSS-var name, which the service's
 * `resolveThemeVars` applies last as overrides.
 *
 * This module is the single source of truth for: the token list + Coral-Sunset
 * defaults, and the two pure mappers (editor state ⇄ ThemePatch / resolved theme).
 */

export type TokenKey =
  | "primary"
  | "brand"
  | "tertiary"
  | "highlight"
  | "background"
  | "foreground"
  | "card"
  | "border"
  | "success"
  | "warning"
  | "danger";

export type TokenGroup = "core" | "surface" | "status";

export interface TokenDef {
  key: TokenKey;
  /** Preview CSS var on the self-contained `#prevScope` surface. */
  previewVar: string;
  /** Coral-Sunset default hex (mirrors app/globals.css `:root`). */
  hex: string;
  label: string;
  desc: string;
  group: TokenGroup;
  /** Dedicated `ThemePatch` column, or null when it round-trips via themeTokens. */
  patchField: keyof ThemePatch | null;
  /** Shell CSS-var name used when stored under `themeTokens` (escape hatch). */
  themeTokenVar?: string;
}

/** Coral-Sunset defaults — order = render order within each group. */
export const TOKEN_DEFS: TokenDef[] = [
  // ── Inti — brand & aksen ──
  {
    key: "primary",
    previewVar: "--p-primary",
    hex: "#FD7A5C",
    label: "Primary",
    desc: "Tombol utama, link, active",
    group: "core",
    patchField: "primaryColor",
  },
  {
    key: "brand",
    previewVar: "--p-brand",
    hex: "#0D9488",
    label: "Brand (teal)",
    desc: "Aksen brand sekunder",
    group: "core",
    patchField: "accentColor",
  },
  {
    key: "tertiary",
    previewVar: "--p-tertiary",
    hex: "#14B8A6",
    label: "Tertiary",
    desc: "Aksen ketiga — teal terang",
    group: "core",
    patchField: null,
    themeTokenVar: "--tertiary-hex",
  },
  {
    key: "highlight",
    previewVar: "--p-highlight",
    hex: "#F59E0B",
    label: "Highlight (amber)",
    desc: "Sorotan / badge perhatian",
    group: "core",
    patchField: null,
    themeTokenVar: "--highlight-hex",
  },
  // ── Permukaan & teks ──
  {
    key: "background",
    previewVar: "--p-bg",
    hex: "#FFF8F5",
    label: "Background",
    desc: "Kanvas halaman — warm-white",
    group: "surface",
    patchField: "backgroundColor",
  },
  {
    key: "foreground",
    previewVar: "--p-fg",
    hex: "#1B1A19",
    label: "Foreground",
    desc: "Warna teks utama",
    group: "surface",
    patchField: "foregroundColor",
  },
  {
    key: "card",
    previewVar: "--p-card",
    hex: "#FFFFFF",
    label: "Card",
    desc: "Permukaan card / modal / form",
    group: "surface",
    patchField: null,
    themeTokenVar: "--card-hex",
  },
  {
    key: "border",
    previewVar: "--p-border",
    hex: "#EFE2DA",
    label: "Border",
    desc: "Garis / divider / input border",
    group: "surface",
    patchField: "borderColor",
  },
  // ── Status ──
  {
    key: "success",
    previewVar: "--p-success",
    hex: "#10B981",
    label: "Success",
    desc: "Sukses · restore · approval",
    group: "status",
    patchField: "successColor",
  },
  {
    key: "warning",
    previewVar: "--p-warning",
    hex: "#F59E0B",
    label: "Warning",
    desc: "Peringatan",
    group: "status",
    patchField: "warningColor",
  },
  {
    key: "danger",
    previewVar: "--p-danger",
    hex: "#EF4444",
    label: "Danger",
    desc: "Delete · error · destruktif",
    group: "status",
    patchField: "dangerColor",
  },
];

export const TOKEN_BY_KEY: Record<TokenKey, TokenDef> = TOKEN_DEFS.reduce(
  (acc, def) => {
    acc[def.key] = def;
    return acc;
  },
  {} as Record<TokenKey, TokenDef>,
);

/** Full editor draft: every token hex + identity + advanced CSS. */
export interface BrandingDraft {
  tokens: Record<TokenKey, string>;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  customCss: string;
}

/** The Coral-Sunset default draft (used for the initial paint + reset preview). */
export function defaultDraft(): BrandingDraft {
  const tokens = {} as Record<TokenKey, string>;
  for (const def of TOKEN_DEFS) tokens[def.key] = def.hex;
  return { tokens, brandName: "", logoUrl: null, faviconUrl: null, customCss: "" };
}

/** Shape of the resolved theme the GET route returns under `data.theme`. */
export interface ResolvedThemeDto {
  brandName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
  borderColor: string | null;
  successColor: string | null;
  warningColor: string | null;
  dangerColor: string | null;
  themeTokens: Record<string, string>;
  customCss: string | null;
  isDefault: boolean;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function pickHex(value: string | null | undefined, fallback: string): string {
  return value && HEX_RE.test(value.trim()) ? value.trim().toUpperCase() : fallback;
}

/** Resolved theme → editor draft (column first, then themeTokens, then default). */
export function themeToDraft(theme: ResolvedThemeDto): BrandingDraft {
  const tokens = {} as Record<TokenKey, string>;
  for (const def of TOKEN_DEFS) {
    let raw: string | null | undefined;
    if (def.patchField) {
      raw = theme[def.patchField as keyof ResolvedThemeDto] as string | null | undefined;
    } else if (def.themeTokenVar) {
      raw = theme.themeTokens?.[def.themeTokenVar];
    }
    tokens[def.key] = pickHex(raw, def.hex);
  }
  return {
    tokens,
    brandName: theme.brandName ?? "",
    logoUrl: theme.logoUrl,
    faviconUrl: theme.faviconUrl,
    customCss: theme.customCss ?? "",
  };
}

/**
 * Editor draft → ThemePatch for PUT. Dedicated columns carry their token; the
 * column-less tokens (tertiary/highlight/card) ride in `themeTokens`. Empty
 * identity fields are sent as null so clearing them persists.
 */
export function draftToPatch(draft: BrandingDraft): ThemePatch {
  const patch: ThemePatch = {};
  const themeTokens: Record<string, string> = {};

  for (const def of TOKEN_DEFS) {
    const hex = draft.tokens[def.key];
    if (def.patchField) {
      (patch[def.patchField] as string) = hex;
    } else if (def.themeTokenVar) {
      themeTokens[def.themeTokenVar] = hex;
    }
  }

  patch.themeTokens = themeTokens;
  patch.brandName = draft.brandName.trim() || null;
  patch.logoUrl = draft.logoUrl || null;
  patch.faviconUrl = draft.faviconUrl || null;
  patch.customCss = draft.customCss.trim() || null;
  return patch;
}

export { HEX_RE };

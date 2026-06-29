import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { brandingRepo } from "./repo";
import type { UserThemeInsert, UserThemeRow } from "./schema";

/**
 * branding domain service — per-USER theming. Holds ALL business logic for a
 * single user's theme: defaults, validation, hex→CSS-var resolution, custom-CSS
 * sanitization, and the cross-module audit side effect. Routes stay thin:
 * resolve the current user → call a service method → wrap with {ok,error}.
 *
 * GRAIN = USER (docs/rebuild/06 §2 delta): the theme is keyed by `user_id`, NOT
 * tenant. "Reset to default" clears the satellite row (repo.clear) and the read
 * synthesizes the canonical Coral-Sunset palette — there is no soft-delete/trash
 * for this satellite.
 */

/** Canonical default palette (Coral Sunset). Mirrors app/globals.css `:root`. */
const DEFAULT_PRIMARY = "#FD7A5C";
const DEFAULT_SIDEBAR_BG = "#1E293B";

/**
 * A fully-resolved theme: every column with the stored value OR its default.
 * `getTheme` always returns one of these so the client never has to know whether
 * the user has a row yet.
 */
export interface ResolvedTheme {
  userId: string;
  brandName: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  loginBgUrl: string | null;
  primaryColor: string;
  primaryDark: string | null;
  primaryForeground: string | null;
  accentColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
  mutedColor: string | null;
  borderColor: string | null;
  sidebarBg: string | null;
  sidebarActive: string | null;
  successColor: string | null;
  warningColor: string | null;
  dangerColor: string | null;
  themeTokens: Record<string, string>;
  customCss: string | null;
  updatedAt: string | null;
  /** True when the user has no stored row (these are pure defaults). */
  isDefault: boolean;
}

/** Mutable theme fields a PUT may patch (PK + updatedAt excluded). */
export interface ThemePatch {
  brandName?: string | null;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  faviconUrl?: string | null;
  loginBgUrl?: string | null;
  primaryColor?: string;
  primaryDark?: string | null;
  primaryForeground?: string | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  foregroundColor?: string | null;
  mutedColor?: string | null;
  borderColor?: string | null;
  sidebarBg?: string | null;
  sidebarActive?: string | null;
  successColor?: string | null;
  warningColor?: string | null;
  dangerColor?: string | null;
  themeTokens?: Record<string, string> | null;
  customCss?: string | null;
}

// ── color helpers ────────────────────────────────────────────────────

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Validate + normalize a hex color to `#rrggbb` (lowercase). Throws on junk. */
function normalizeHex(value: string, field: string): string {
  const v = value.trim();
  if (!HEX_RE.test(v)) {
    throw new ServiceError(`Warna ${field} tidak valid (harus hex, mis. #FD7A5C)`, 400, "validation");
  }
  const hex = v.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  return `#${full.toLowerCase()}`;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** hex → `"H S% L%"` channel string, matching shadcn's HSL token format. */
function hexToHslChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG-ish relative luminance → pick black/white foreground for a bg hex. */
function readableForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return lum > 0.45 ? "#1b1a19" : "#ffffff";
}

/** Darken a hex by `amount` (0..1) for a default hover/active shade. */
function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number): string =>
    Math.max(0, Math.min(255, Math.round(c * (1 - amount))))
      .toString(16)
      .padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

// ── custom-CSS sanitizer ─────────────────────────────────────────────

/**
 * Strip the obvious injection vectors from user-supplied CSS before it's echoed
 * into a <style> tag on the shell. This is a defense-in-depth scrub, not a full
 * CSS parser: drop `</style>`/tag breakouts, `@import`, `javascript:`/`expression()`,
 * and `behavior:`/`-moz-binding`. Caps the length too.
 */
export function sanitizeCustomCss(css: string): string {
  let out = css.slice(0, 20_000);
  out = out
    .replace(/<\/?\s*style[^>]*>/gi, "")
    .replace(/<\/?\s*script[^>]*>/gi, "")
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/behaviou?r\s*:/gi, "")
    .replace(/-moz-binding\s*:/gi, "");
  return out.trim();
}

// ── url validation ───────────────────────────────────────────────────

/** Allow http(s) and data: URLs for assets; reject anything else (e.g. js:). */
function normalizeAssetUrl(value: string, field: string): string {
  const v = value.trim();
  if (v === "") return v;
  if (!/^(https?:\/\/|data:image\/|\/)/i.test(v)) {
    throw new ServiceError(`URL ${field} tidak valid`, 400, "validation");
  }
  return v;
}

// ── patch coercion ───────────────────────────────────────────────────

const HEX_FIELDS: (keyof ThemePatch)[] = [
  "primaryColor",
  "primaryDark",
  "primaryForeground",
  "accentColor",
  "secondaryColor",
  "backgroundColor",
  "foregroundColor",
  "mutedColor",
  "borderColor",
  "sidebarBg",
  "sidebarActive",
  "successColor",
  "warningColor",
  "dangerColor",
];

const URL_FIELDS: (keyof ThemePatch)[] = [
  "logoUrl",
  "logoDarkUrl",
  "faviconUrl",
  "loginBgUrl",
];

/**
 * Validate + normalize a raw PUT body into a column patch. Only known keys are
 * kept; hex fields are normalized; asset URLs are scheme-checked; custom CSS is
 * sanitized; `theme_tokens` values are coerced to strings. Unknown keys ignored.
 */
function coercePatch(input: ThemePatch): Partial<UserThemeInsert> {
  const patch: Partial<UserThemeInsert> = {};

  for (const field of HEX_FIELDS) {
    if (!(field in input)) continue;
    const raw = input[field] as string | null | undefined;
    if (raw === null || raw === "") {
      // primaryColor is NOT NULL — only allow clearing the optional tokens.
      if (field === "primaryColor") {
        throw new ServiceError("Warna primary wajib diisi", 400, "validation");
      }
      patch[field as keyof UserThemeInsert] = null as never;
    } else if (typeof raw === "string") {
      patch[field as keyof UserThemeInsert] = normalizeHex(raw, field) as never;
    }
  }

  for (const field of URL_FIELDS) {
    if (!(field in input)) continue;
    const raw = input[field] as string | null | undefined;
    patch[field as keyof UserThemeInsert] =
      raw == null || raw === "" ? (null as never) : (normalizeAssetUrl(raw, field) as never);
  }

  if ("brandName" in input) {
    const v = input.brandName;
    patch.brandName = v == null ? null : String(v).trim().slice(0, 80) || null;
  }

  if ("customCss" in input) {
    patch.customCss = input.customCss == null ? null : sanitizeCustomCss(String(input.customCss)) || null;
  }

  if ("themeTokens" in input) {
    const tokens = input.themeTokens;
    if (tokens == null) {
      patch.themeTokens = {};
    } else if (typeof tokens === "object" && !Array.isArray(tokens)) {
      const clean: Record<string, string> = {};
      for (const [k, val] of Object.entries(tokens)) {
        // CSS custom-prop names only; stringify values.
        if (/^--?[a-z0-9-]+$/i.test(k)) clean[k.startsWith("--") ? k : `--${k}`] = String(val);
      }
      patch.themeTokens = clean;
    } else {
      throw new ServiceError("theme_tokens harus berupa objek", 400, "validation");
    }
  }

  return patch;
}

// ── resolution to defaults ───────────────────────────────────────────

function resolve(userId: string, row: UserThemeRow | undefined): ResolvedTheme {
  if (!row) {
    return {
      userId,
      brandName: null,
      logoUrl: null,
      logoDarkUrl: null,
      faviconUrl: null,
      loginBgUrl: null,
      primaryColor: DEFAULT_PRIMARY,
      primaryDark: null,
      primaryForeground: null,
      accentColor: null,
      secondaryColor: null,
      backgroundColor: null,
      foregroundColor: null,
      mutedColor: null,
      borderColor: null,
      sidebarBg: DEFAULT_SIDEBAR_BG,
      sidebarActive: null,
      successColor: null,
      warningColor: null,
      dangerColor: null,
      themeTokens: {},
      customCss: null,
      updatedAt: null,
      isDefault: true,
    };
  }
  return {
    userId: row.userId,
    brandName: row.brandName,
    logoUrl: row.logoUrl,
    logoDarkUrl: row.logoDarkUrl,
    faviconUrl: row.faviconUrl,
    loginBgUrl: row.loginBgUrl,
    primaryColor: row.primaryColor,
    primaryDark: row.primaryDark,
    primaryForeground: row.primaryForeground,
    accentColor: row.accentColor,
    secondaryColor: row.secondaryColor,
    backgroundColor: row.backgroundColor,
    foregroundColor: row.foregroundColor,
    mutedColor: row.mutedColor,
    borderColor: row.borderColor,
    sidebarBg: row.sidebarBg,
    sidebarActive: row.sidebarActive,
    successColor: row.successColor,
    warningColor: row.warningColor,
    dangerColor: row.dangerColor,
    themeTokens: row.themeTokens ?? {},
    customCss: row.customCss,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    isDefault: false,
  };
}

export const brandingService = {
  /** The current user's theme, with every default filled in (never null row). */
  async getTheme(userId: string): Promise<ResolvedTheme> {
    if (!userId) throw new ServiceError("User tidak dikenali", 401, "unauthorized");
    const row = await brandingRepo.getByUserId(userId);
    return resolve(userId, row);
  },

  /**
   * Validate + persist a partial theme patch for the current user (upsert).
   * Returns the freshly resolved theme. Writes a `branding.theme.update` audit.
   */
  async saveTheme(userId: string, input: ThemePatch, tenantId?: string | null): Promise<ResolvedTheme> {
    if (!userId) throw new ServiceError("User tidak dikenali", 401, "unauthorized");
    const patch = coercePatch(input ?? {});
    if (Object.keys(patch).length === 0) {
      throw new ServiceError("Tidak ada perubahan tema yang dikenali", 400, "no_op");
    }
    const row = await brandingRepo.upsert(userId, patch);
    await platformRepo.insertAudit({
      tenantId: tenantId ?? null,
      actorUserId: userId,
      action: "branding.theme.update",
      targetType: "user_theme",
      targetId: userId,
      meta: { fields: Object.keys(patch) },
    });
    return resolve(userId, row);
  },

  /**
   * Reset the current user's theme back to Coral-Sunset defaults by clearing the
   * satellite row. Idempotent: a no-op when there was nothing stored. Returns the
   * resolved (default) theme.
   */
  async resetTheme(userId: string, tenantId?: string | null): Promise<ResolvedTheme> {
    if (!userId) throw new ServiceError("User tidak dikenali", 401, "unauthorized");
    const had = await brandingRepo.clear(userId);
    if (had) {
      await platformRepo.insertAudit({
        tenantId: tenantId ?? null,
        actorUserId: userId,
        action: "branding.theme.reset",
        targetType: "user_theme",
        targetId: userId,
      });
    }
    return resolve(userId, undefined);
  },

  /**
   * Map a resolved theme to the CSS custom properties the shell applies on
   * `#app-shell`. Emits BOTH the shadcn HSL-channel tokens (so existing
   * components react) and the raw-hex brand tokens named in the schema comments.
   * Derives `--primary-foreground` (WCAG) and `--primary-hover`/`--sidebar-active`
   * (darken) when the user left them blank. `theme_tokens` overrides win last.
   */
  resolveThemeVars(theme: ResolvedTheme): Record<string, string> {
    const vars: Record<string, string> = {};

    // primary (shadcn channel tokens + brand hex)
    vars["--primary"] = hexToHslChannels(theme.primaryColor);
    vars["--ring"] = vars["--primary"];
    vars["--brand-primary"] = theme.primaryColor;
    vars["--primary-foreground"] = theme.primaryForeground
      ? hexToHslChannels(theme.primaryForeground)
      : hexToHslChannels(readableForeground(theme.primaryColor));
    vars["--primary-hover"] = theme.primaryDark ?? darken(theme.primaryColor, 0.12);

    const map: [keyof ResolvedTheme, string, string | undefined][] = [
      ["accentColor", "--accent", "--brand-accent"],
      ["secondaryColor", "--secondary", undefined],
      ["backgroundColor", "--background", undefined],
      ["foregroundColor", "--foreground", undefined],
      ["mutedColor", "--muted", undefined],
      ["borderColor", "--border", undefined],
      ["dangerColor", "--destructive", "--brand-danger"],
    ];
    for (const [key, hslVar, hexVar] of map) {
      const val = theme[key] as string | null;
      if (val) {
        vars[hslVar] = hexToHslChannels(val);
        if (hexVar) vars[hexVar] = val;
      }
    }

    // sidebar (raw hex — the sidebar isn't shadcn-tokenized)
    const sidebarBg = theme.sidebarBg ?? DEFAULT_SIDEBAR_BG;
    vars["--sidebar-bg"] = sidebarBg;
    vars["--sidebar-active"] = theme.sidebarActive ?? theme.primaryColor;

    // status colors (raw hex passthrough)
    if (theme.successColor) vars["--success"] = theme.successColor;
    if (theme.warningColor) vars["--warning"] = theme.warningColor;

    // explicit escape-hatch overrides win.
    for (const [k, v] of Object.entries(theme.themeTokens)) vars[k] = v;
    return vars;
  },

  /** Re-export the sanitizer so callers (e.g. SSR head injection) can reuse it. */
  sanitizeCustomCss,

  /**
   * App-level cascade hook: hard-delete a user's theme satellite when the owning
   * user is removed (no FK cascade exists). Called by the identity/auth service
   * on user soft-delete. Safe/idempotent.
   */
  async onUserDeleted(userId: string): Promise<void> {
    await brandingRepo.clear(userId);
  },
};

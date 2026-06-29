import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Module 1 · branding domain schema (rebuild).
 *
 * GRAIN = USER (per the M1 task — overrides the per-tenant `tenant_theme` in
 * docs/rebuild/01 & 03). Each user owns ONE theme row: full design-token set +
 * logo + favicon + custom CSS. Default = Coral Sunset (#FD7A5C).
 *
 * `user_id` is the PK (1:1 with user). No separate `id`, no FK. Reverting to
 * default = clear columns, not delete the row. No `deleted_at` — the theme is a
 * satellite of the user and cascades in the service when the user is soft-deleted.
 */
export const userThemeTable = pgTable("user_theme", {
  userId: text("user_id").primaryKey(), // soft ref → app_user.id (PK = the user)

  // ── Brand identity ──
  brandName: text("brand_name"), // overrides tenant/app name in chrome
  logoUrl: text("logo_url"),
  logoDarkUrl: text("logo_dark_url"),
  faviconUrl: text("favicon_url"),
  loginBgUrl: text("login_bg_url"),

  // ── Full color-token set (hex; applied as CSS vars on #app-shell) ──
  primaryColor: text("primary_color").notNull().default("#FD7A5C"), // --primary, --ring
  primaryDark: text("primary_dark"), // --primary-hover (auto-derived if null)
  primaryForeground: text("primary_foreground"), // --primary-foreground (auto WCAG if null)
  accentColor: text("accent_color"), // --brand-accent
  secondaryColor: text("secondary_color"), // --secondary
  backgroundColor: text("background_color"), // --background
  foregroundColor: text("foreground_color"), // --foreground
  mutedColor: text("muted_color"), // --muted
  borderColor: text("border_color"), // --border
  sidebarBg: text("sidebar_bg").default("#1E293B"), // --sidebar-bg
  sidebarActive: text("sidebar_active"), // --sidebar-active
  successColor: text("success_color"),
  warningColor: text("warning_color"),
  dangerColor: text("danger_color"),

  // ── Escape hatch + raw CSS ──
  themeTokens: jsonb("theme_tokens").$type<Record<string, string>>().notNull().default({}), // extra --var overrides
  customCss: text("custom_css"), // raw CSS injected on the shell (sanitized in service)

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserThemeRow = typeof userThemeTable.$inferSelect;
export type UserThemeInsert = typeof userThemeTable.$inferInsert;

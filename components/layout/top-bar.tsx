"use client";

// TopBar lives alongside SideNav in `side-nav.tsx` (they share the NAV_GROUPS IA
// so the mobile sheet stays in sync with the desktop sidebar). This module is the
// canonical import path for the top bar; it re-exports the implementation so both
// `@/components/layout/top-bar` and the existing `@/components/layout/side-nav`
// import resolve to the same component.
export { TopBar } from "@/components/layout/side-nav";

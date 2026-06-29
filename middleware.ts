import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

// Middleware runs on the EDGE runtime, so it must use the edge-safe config only
// (no Credentials authorize → no scrypt/Postgres). It only reads the JWT to gate
// routes; the full provider lives in lib/auth/auth.ts (Node runtime).
const { auth } = NextAuth(authConfig);

// Server-side route protection (doc 19). Redirect unauthenticated users to
// /login for page routes. Public: marketing landing (/), the login page, and
// /api (API routes handle their own auth — guarded in slice 2b).
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/unsubscribe") ||
    pathname.startsWith("/api");

  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname);
    return Response.redirect(url);
  }
});

export const config = {
  // Skip Next internals and any path with a file extension (static assets).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

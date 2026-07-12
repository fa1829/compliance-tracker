import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Middleware runs at the edge before a request reaches a page. It provides a
// second layer of route protection alongside the per-page checks: even if a new
// protected page forgets its own auth() call, this catches it.
export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const isProtected = req.nextUrl.pathname.startsWith("/dashboard");

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and the auth API routes themselves.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

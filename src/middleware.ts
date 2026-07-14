import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware runs on the Edge runtime, which has a hard ~1 MB bundle limit.
// Importing the full Auth.js config here would pull in the Prisma adapter and
// the Prisma client, which blows past that limit. Instead this does a cheap
// presence check on the session cookie — no database, no heavy imports.
//
// This is deliberately only a first-pass filter. The authoritative check happens
// server-side in the protected page itself (dashboard/page.tsx calls auth(),
// which verifies the JWT signature against AUTH_SECRET and loads the session).
// A forged or expired cookie would pass this middleware and then be correctly
// rejected there, so security does not depend on this layer — it just avoids
// rendering work for obviously unauthenticated requests.
export function middleware(req: NextRequest) {
  const isProtected = req.nextUrl.pathname.startsWith("/dashboard");
  if (!isProtected) return NextResponse.next();

  // Auth.js names the session cookie differently over HTTPS (production) than
  // over HTTP (local development).
  const sessionCookie =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  // Only run on the protected paths — no need to intercept static assets.
  matcher: ["/dashboard/:path*"],
};

import { NextRequest, NextResponse } from "next/server";

// Runs before every request. The only gate needed: a wc_email cookie,
// which /join sets after verifying the invite code.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no cookie required.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/join") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (!request.cookies.has("wc_email")) {
    return NextResponse.redirect(new URL("/join", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};

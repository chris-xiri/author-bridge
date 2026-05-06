import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getEnv } from "./lib/env";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/webhooks/resend", "/api/unsubscribe"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const token = req.cookies.get("ab_admin_auth")?.value;
  const expected = getEnv().ADMIN_PASSWORD_HASH;
  if (!token || token !== expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

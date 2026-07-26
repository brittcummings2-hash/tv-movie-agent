import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPortalAuthEnabled, isValidSessionToken, PORTAL_SESSION_COOKIE } from "@/lib/portal-auth";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return true;
  // Cron-hit endpoints do their own auth (CRON_SECRET or portal session).
  if (
    pathname === "/api/health" ||
    pathname === "/api/backup" ||
    pathname === "/api/recommend/run" ||
    pathname === "/api/alerts/scan"
  ) {
    return true;
  }
  // PWA assets must load before login (install prompt, home-screen icon).
  if (pathname === "/manifest.webmanifest" || pathname.startsWith("/icons/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login gate is optional: set PORTAL_PASSWORD to require sign-in,
  // remove it to serve the app openly. Note that without it, anyone with
  // the URL can view the library and write to the sheet via the app.
  if (!isPortalAuthEnabled()) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (await isValidSessionToken(session)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

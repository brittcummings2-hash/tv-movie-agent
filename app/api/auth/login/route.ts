import { NextResponse } from "next/server";
import {
  createSessionToken,
  getPortalPassword,
  isPortalAuthEnabled,
  PORTAL_SESSION_COOKIE,
} from "@/lib/portal-auth";

export async function POST(request: Request) {
  if (!isPortalAuthEnabled()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = await request.json();
    const password = String(body.password ?? "");
    const expected = getPortalPassword();

    if (!expected || password !== expected) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(PORTAL_SESSION_COOKIE, await createSessionToken(expected), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

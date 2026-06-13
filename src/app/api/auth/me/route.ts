import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authEnabled = process.env.AUTH_ENABLED === "true";
  if (!authEnabled) {
    return NextResponse.json({ authenticated: true, username: "admin" });
  }

  const cookieName = process.env.AUTH_COOKIE_NAME || "geostorm_session";
  const sessionToken = request.cookies.get(cookieName)?.value;
  const secret = process.env.AUTH_COOKIE_SECRET || "default_fallback_secret_32_chars_long";

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = await verifySession(sessionToken, secret);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, username: session.username });
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const authEnabled = process.env.AUTH_ENABLED === "true";
  if (!authEnabled) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  
  // Define public paths
  const isPublicPath =
    path === "/login" ||
    path.startsWith("/api/auth/") ||
    path === "/api/health";

  if (isPublicPath) {
    return NextResponse.next();
  }

  const sessionCookieName = process.env.AUTH_COOKIE_NAME || "geostorm_session";
  const sessionToken = request.cookies.get(sessionCookieName)?.value;
  const secret = process.env.AUTH_COOKIE_SECRET || "default_fallback_secret_32_chars_long";

  let isSessionValid = false;
  if (sessionToken) {
    const session = await verifySession(sessionToken, secret);
    if (session) {
      isSessionValid = true;
    }
  }

  if (!isSessionValid) {
    // Return JSON error for unauthenticated API requests
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }
    // Redirect web requests to login page
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

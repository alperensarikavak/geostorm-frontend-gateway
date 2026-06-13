import { NextResponse } from "next/server";
import { signSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const expectedUsername = process.env.AUTH_USERNAME || "admin";
    const expectedPassword = process.env.AUTH_PASSWORD || "replace_me_strong_password";

    if (username !== expectedUsername || password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const secret = process.env.AUTH_COOKIE_SECRET || "default_fallback_secret_32_chars_long";
    const cookieName = process.env.AUTH_COOKIE_NAME || "geostorm_session";

    // 24 hours expiry
    const exp = Date.now() + 24 * 60 * 60 * 1000;
    const token = await signSession({ username, exp }, secret);

    const response = NextResponse.json({ success: true, message: "Login successful" });
    
    response.cookies.set({
      name: cookieName,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours in seconds
    });

    return response;
  } catch (error: any) {
    console.error("Login route error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during authentication" },
      { status: 500 }
    );
  }
}

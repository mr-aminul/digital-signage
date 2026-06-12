import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateSession } from "@/lib/supabase/middleware";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/auth/google/complete") {
    return NextResponse.next();
  }

  const authJsSession = await auth();
  const hasGoogleSession = !!authJsSession?.user?.googleSub;

  if ((pathname === "/login" || pathname === "/signup") && hasGoogleSession && !hasSupabaseAuthCookie(request)) {
    const completeUrl = new URL("/auth/google/complete", request.url);
    const next = request.nextUrl.searchParams.get("next");
    if (next) {
      completeUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(completeUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/devices/:path*",
    "/playlists/:path*",
    "/media/:path*",
    "/dashboard/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/account-suspended",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/google/complete",
  ],
};

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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
    "/trial-expired",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/accept-invite",
  ],
};

import { NextResponse, type NextRequest } from "next/server";

/**
 * Anonymous ownership is established here, before any render.
 *
 * Server Components cannot set cookies, so establishing the owner in a page
 * would silently fail and hand every request a fresh identity. Running in proxy
 * guarantees one stable owner per browser from the very first request, whether
 * it arrives at a page or at an API route.
 */

const OWNER_COOKIE = "shorwatch_owner";
const OWNER_PATTERN = /^[a-f0-9]{32}$/;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function newOwnerId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(OWNER_COOKIE)?.value;
  if (existing && OWNER_PATTERN.test(existing)) {
    return NextResponse.next();
  }

  const ownerId = newOwnerId();
  const response = NextResponse.next();
  response.cookies.set(OWNER_COOKIE, ownerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  // Skip static assets; everything else establishes or reuses the owner.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mcp.json|robots.txt|sitemap.xml|opengraph-image).*)"],
};

export { OWNER_COOKIE, OWNER_PATTERN };
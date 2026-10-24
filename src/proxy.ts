import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);
const SESSION_COOKIES = ["__Host-alivia_session", "alivia_session"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Optimistic gate only (cookie present?). Real verification happens in the data layer
  // (requireUser / requirePermission) on every page, action and route handler.
  if (!PUBLIC_PATHS.has(pathname) && !SESSION_COOKIES.some((c) => req.cookies.has(c))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  res.headers.set("cache-control", "no-store"); // authenticated pages must never be cached
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withSystem } from "@/db/client";
import { env } from "@/env";
import { can, resolveSession, type ResolvedSession } from "./session-core";
import type { PermissionKey } from "./permissions";

const prod = () => env().NODE_ENV === "production";
// `__Host-` prefix: Secure, Path=/, no Domain -> can't be overwritten by sibling subdomains.
export const cookieName = () => (prod() ? "__Host-alivia_session" : "alivia_session");

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: prod(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(cookieName());
}

/** Resolves the session for this request (memoized per request). Null if absent/invalid/expired. */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) return null;
  return withSystem((tx) => resolveSession(tx, token));
});

/** Where an authenticated-but-incomplete session must go next, or null if fully signed in. */
export function nextStep(s: ResolvedSession): string | null {
  if (s.user.mustChangePassword) return "/account/password";
  if (!s.user.totpEnabled) return "/account/mfa";
  if (!s.mfaVerified) return "/login/verify";
  return null;
}

/**
 * Gate for every protected page / server action / route handler. Never rely on proxy.ts alone.
 * Returns only for a fully authenticated session (password + 2FA + no forced change pending).
 */
export async function requireUser(): Promise<ResolvedSession> {
  const s = await getSession();
  if (!s) redirect("/login");
  const step = nextStep(s);
  if (step) redirect(step);
  return s;
}

export async function requirePermission(key: PermissionKey): Promise<ResolvedSession> {
  const s = await requireUser();
  if (!can(s, key)) redirect("/forbidden");
  return s;
}

import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { permissions, rolePermissions, roles, sessions, users } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/crypto";
import type { RequestInfo } from "./context";
import type { PermissionKey } from "./permissions";

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export type AuthUser = {
  id: string;
  firmId: string;
  email: string;
  name: string;
  roleKey: string;
  mustChangePassword: boolean;
  totpEnabled: boolean;
};
export type ResolvedSession = {
  sessionId: string;
  mfaVerified: boolean;
  user: AuthUser;
  permissions: Set<PermissionKey>;
};

export async function createSession(
  tx: Tx,
  p: { firmId: string; userId: string; req: RequestInfo; mfaVerifiedAt?: Date | null; expiresAt?: Date },
) {
  const token = randomToken(32); // 256 bits
  const expiresAt = p.expiresAt ?? new Date(Date.now() + ABSOLUTE_TIMEOUT_MS);
  await tx.insert(sessions).values({
    firmId: p.firmId,
    userId: p.userId,
    tokenHash: hashToken(token),
    ip: p.req.ip,
    userAgent: p.req.userAgent,
    expiresAt,
    mfaVerifiedAt: p.mfaVerifiedAt ?? null,
  });
  return { token, expiresAt };
}

export async function resolveSession(tx: Tx, token: string): Promise<ResolvedSession | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = new Date();
  const rows = await tx
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      mfaVerifiedAt: sessions.mfaVerifiedAt,
      id: users.id,
      firmId: users.firmId,
      email: users.email,
      name: users.name,
      roleId: users.roleId,
      roleKey: roles.key,
      mustChangePassword: users.mustChangePassword,
      totpEnabled: users.totpEnabled,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        gt(sessions.lastSeenAt, new Date(now.getTime() - IDLE_TIMEOUT_MS)),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  const r = rows[0];
  if (!r) return null;

  if (now.getTime() - r.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await tx.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, r.sessionId));
  }

  const perms = await tx
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, r.roleId));

  return {
    sessionId: r.sessionId,
    mfaVerified: r.mfaVerifiedAt !== null,
    user: {
      id: r.id,
      firmId: r.firmId,
      email: r.email,
      name: r.name,
      roleKey: r.roleKey,
      mustChangePassword: r.mustChangePassword,
      totpEnabled: r.totpEnabled,
    },
    permissions: new Set(perms.map((p) => p.key as PermissionKey)),
  };
}

export async function revokeSession(tx: Tx, sessionId: string) {
  await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeOtherSessions(tx: Tx, userId: string, keepSessionId: string) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.id} <> ${keepSessionId}`));
}

/**
 * Swap the current session for a fresh one (new token) after a privilege change
 * (password OK -> MFA proven, password changed). Prevents session fixation.
 */
export async function rotateSession(
  tx: Tx,
  old: { sessionId: string; firmId: string; userId: string },
  req: RequestInfo,
  mfaVerified: boolean,
) {
  const prev = await tx.select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.id, old.sessionId)).limit(1);
  await revokeSession(tx, old.sessionId);
  return createSession(tx, {
    firmId: old.firmId,
    userId: old.userId,
    req,
    mfaVerifiedAt: mfaVerified ? new Date() : null,
    expiresAt: prev[0]?.expiresAt, // keep the absolute lifetime; rotation doesn't extend it
  });
}

export function can(s: Pick<ResolvedSession, "permissions">, key: PermissionKey): boolean {
  return s.permissions.has(key);
}

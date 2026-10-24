import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { recoveryCodes, users } from "@/db/schema";
import { decryptField, encryptField, hashToken } from "@/lib/crypto";
import { hashPassword, burnPasswordCheck, verifyPassword } from "./password";
import { generateTotpSecret, verifyTotp } from "./totp";

export const MAX_FAILED_BEFORE_LOCK = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

export const normalizeEmail = (email: string) => email.normalize("NFKC").trim().toLowerCase();

export type LoginResult =
  | { ok: true; user: { id: string; firmId: string; mustChangePassword: boolean; totpEnabled: boolean } }
  | { ok: false; reason: "invalid" | "locked"; userId?: string; firmId?: string };

/** Progressive lock: 5 fails -> 15 min, 6 -> 30 min, 7 -> 1 h ... capped at 24 h. */
export function lockDurationMs(failedLogins: number): number {
  if (failedLogins < MAX_FAILED_BEFORE_LOCK) return 0;
  return Math.min(BASE_LOCK_MS * 2 ** (failedLogins - MAX_FAILED_BEFORE_LOCK), MAX_LOCK_MS);
}

export async function attemptLogin(tx: Tx, input: { email: string; password: string }): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const [u] = await tx.select().from(users).where(eq(users.email, email)).limit(1);

  if (!u || u.status !== "active") {
    await burnPasswordCheck(input.password); // equalize timing; never reveal that the account is missing
    return { ok: false, reason: "invalid" };
  }
  const now = new Date();
  if (u.lockedUntil && u.lockedUntil > now) {
    return { ok: false, reason: "locked", userId: u.id, firmId: u.firmId };
  }

  if (!(await verifyPassword(u.passwordHash, input.password))) {
    const failed = u.failedLogins + 1;
    const lockMs = lockDurationMs(failed);
    await tx
      .update(users)
      .set({ failedLogins: failed, lockedUntil: lockMs ? new Date(now.getTime() + lockMs) : null })
      .where(eq(users.id, u.id));
    return { ok: false, reason: lockMs ? "locked" : "invalid", userId: u.id, firmId: u.firmId };
  }

  await tx.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, u.id));
  return { ok: true, user: { id: u.id, firmId: u.firmId, mustChangePassword: u.mustChangePassword, totpEnabled: u.totpEnabled } };
}

const aad = (userId: string) => `users.totp_secret:${userId}`;

/** Start enrollment: store a fresh (not yet enabled) secret. Returns the secret for QR display. */
export async function beginTotpEnrollment(tx: Tx, userId: string): Promise<string> {
  const secret = generateTotpSecret();
  await tx
    .update(users)
    .set({ totpSecretEnc: encryptField(secret, aad(userId)), totpEnabled: false, totpLastStep: null })
    .where(and(eq(users.id, userId), eq(users.totpEnabled, false)));
  return secret;
}

export async function pendingTotpSecret(tx: Tx, userId: string): Promise<string | null> {
  const [u] = await tx.select({ enc: users.totpSecretEnc, enabled: users.totpEnabled }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.enc && !u.enabled ? decryptField(u.enc, aad(userId)) : null;
}

/** Confirm enrollment with a valid code; enables 2FA and issues one-time recovery codes. */
export async function confirmTotpEnrollment(
  tx: Tx,
  p: { userId: string; firmId: string; code: string },
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const secret = await pendingTotpSecret(tx, p.userId);
  if (!secret) return { ok: false };
  const step = verifyTotp(secret, p.code);
  if (step === null) return { ok: false };
  await tx.update(users).set({ totpEnabled: true, totpLastStep: step }).where(eq(users.id, p.userId));
  return { ok: true, recoveryCodes: await issueRecoveryCodes(tx, p.userId, p.firmId) };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function newRecoveryCode(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]!);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}
const normalizeRecovery = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function issueRecoveryCodes(tx: Tx, userId: string, firmId: string): Promise<string[]> {
  await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  const codes = Array.from({ length: 10 }, newRecoveryCode);
  await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId, firmId, codeHash: hashToken(normalizeRecovery(c)) })));
  return codes;
}

export type SecondFactorResult = { ok: true; method: "totp" | "recovery" } | { ok: false };

export async function verifySecondFactor(tx: Tx, userId: string, input: string): Promise<SecondFactorResult> {
  const [u] = await tx
    .select({ enc: users.totpSecretEnc, enabled: users.totpEnabled, lastStep: users.totpLastStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.enabled || !u.enc) return { ok: false };

  const code = input.replace(/\s/g, "");
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(decryptField(u.enc, aad(userId)), code);
    if (step === null || (u.lastStep !== null && step <= u.lastStep)) return { ok: false }; // invalid or replayed
    // Conditional update makes concurrent replays of the same code lose the race.
    const upd = await tx
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, userId), sql`(${users.totpLastStep} IS NULL OR ${users.totpLastStep} < ${step})`))
      .returning({ id: users.id });
    return upd.length ? { ok: true, method: "totp" } : { ok: false };
  }

  const normalized = normalizeRecovery(input);
  if (normalized.length === 16) {
    const used = await tx
      .update(recoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, hashToken(normalized)), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });
    return used.length ? { ok: true, method: "recovery" } : { ok: false };
  }
  return { ok: false };
}

export async function changePassword(
  tx: Tx,
  p: { userId: string; current: string; next: string },
): Promise<{ ok: boolean }> {
  const [u] = await tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, p.userId)).limit(1);
  if (!u || !(await verifyPassword(u.hash, p.current))) return { ok: false };
  await tx
    .update(users)
    .set({ passwordHash: await hashPassword(p.next), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, p.userId));
  return { ok: true };
}

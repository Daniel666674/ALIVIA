import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import {
  attemptLogin, beginTotpEnrollment, confirmTotpEnrollment, changePassword, lockDurationMs, verifySecondFactor,
} from "@/lib/auth/login";
import { passwordPolicyError } from "@/lib/auth/password";
import { createSession, resolveSession, revokeSession, rotateSession, IDLE_TIMEOUT_MS } from "@/lib/auth/session-core";
import { currentTotp } from "@/lib/auth/totp";
import { sessions } from "@/db/schema";
import { createTestDb, seedFirm } from "./helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let f: Awaited<ReturnType<typeof seedFirm>>;
const req = { ip: "203.0.113.5", userAgent: "vitest" };
const PW = "correct-horse-battery";

beforeAll(async () => {
  t = await createTestDb();
  f = await seedFirm(t.admin, "Firma", [
    { email: "ana@firma.test", role: "owner", password: PW },
    { email: "luis@firma.test", role: "assistant", password: PW },
  ]);
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.admin.update(users).set({ failedLogins: 0, lockedUntil: null });
});

describe("login", () => {
  it("accepts the right password (case/space-insensitive email)", async () => {
    const r = await t.system((tx) => attemptLogin(tx, { email: "  ANA@firma.test ", password: PW }));
    expect(r.ok).toBe(true);
  });
  it("rejects wrong password and unknown email identically", async () => {
    const bad = await t.system((tx) => attemptLogin(tx, { email: "ana@firma.test", password: "nope-nope-nope" }));
    const none = await t.system((tx) => attemptLogin(tx, { email: "ghost@firma.test", password: "nope-nope-nope" }));
    expect(bad).toMatchObject({ ok: false, reason: "invalid" });
    expect(none).toEqual({ ok: false, reason: "invalid" });
  });
  it("locks after 5 failures, even for the correct password, then recovers", async () => {
    for (let i = 0; i < 5; i++) await t.system((tx) => attemptLogin(tx, { email: "luis@firma.test", password: "wrong-wrong-1" }));
    const locked = await t.system((tx) => attemptLogin(tx, { email: "luis@firma.test", password: PW }));
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    await t.admin.update(users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(users.email, "luis@firma.test"));
    expect((await t.system((tx) => attemptLogin(tx, { email: "luis@firma.test", password: PW }))).ok).toBe(true);
  });
  it("lock grows progressively and is capped", () => {
    expect(lockDurationMs(4)).toBe(0);
    expect(lockDurationMs(5)).toBe(15 * 60_000);
    expect(lockDurationMs(6)).toBe(30 * 60_000);
    expect(lockDurationMs(50)).toBe(24 * 3600_000);
  });
  it("disabled users cannot log in", async () => {
    await t.admin.update(users).set({ status: "disabled" }).where(eq(users.email, "luis@firma.test"));
    expect((await t.system((tx) => attemptLogin(tx, { email: "luis@firma.test", password: PW }))).ok).toBe(false);
    await t.admin.update(users).set({ status: "active" }).where(eq(users.email, "luis@firma.test"));
  });
});

describe("2FA", () => {
  const ana = () => f.users[0]!;
  let secret = "";
  let codes: string[] = [];

  it("enrolls only with a valid code and stores the secret encrypted", async () => {
    secret = await t.tenant(f.firm.id, (tx) => beginTotpEnrollment(tx, ana().id));
    const [row] = await t.admin.select().from(users).where(eq(users.id, ana().id));
    expect(row!.totpSecretEnc).toMatch(/^v1\./);
    expect(row!.totpSecretEnc).not.toContain(secret);
    expect((await t.tenant(f.firm.id, (tx) => confirmTotpEnrollment(tx, { userId: ana().id, firmId: f.firm.id, code: "000000" }))).ok).toBe(false);
    const ok = await t.tenant(f.firm.id, (tx) => confirmTotpEnrollment(tx, { userId: ana().id, firmId: f.firm.id, code: currentTotp(secret) }));
    expect(ok.ok).toBe(true);
    if (ok.ok) { codes = ok.recoveryCodes; expect(codes).toHaveLength(10); }
  });
  it("blocks replay of the same code", async () => {
    // enrollment consumed this step; the same code must not work again
    const r = await t.tenant(f.firm.id, (tx) => verifySecondFactor(tx, ana().id, currentTotp(secret)));
    expect(r.ok).toBe(false);
  });
  it("accepts a fresh step, rejects junk", async () => {
    const next = currentTotp(secret, Date.now() + 30_000);
    // pretend time advanced one step by using the +1 window
    const r = await t.tenant(f.firm.id, (tx) => verifySecondFactor(tx, ana().id, next));
    expect(r).toMatchObject({ ok: true, method: "totp" });
    expect((await t.tenant(f.firm.id, (tx) => verifySecondFactor(tx, ana().id, "abc"))).ok).toBe(false);
  });
  it("recovery codes work exactly once", async () => {
    const code = codes[0]!;
    expect((await t.tenant(f.firm.id, (tx) => verifySecondFactor(tx, ana().id, code.toLowerCase()))).ok).toBe(true);
    expect((await t.tenant(f.firm.id, (tx) => verifySecondFactor(tx, ana().id, code))).ok).toBe(false);
  });
});

describe("sessions", () => {
  const ana = () => f.users[0]!;
  it("stores only a hash, resolves with permissions, honors MFA flag", async () => {
    const { token } = await t.system((tx) => createSession(tx, { firmId: f.firm.id, userId: ana().id, req }));
    const [row] = await t.admin.select().from(sessions).where(eq(sessions.userId, ana().id));
    expect(JSON.stringify(row)).not.toContain(token);
    const s = await t.system((tx) => resolveSession(tx, token));
    expect(s?.mfaVerified).toBe(false);
    expect(s?.permissions.has("user:manage")).toBe(true);
  });
  it("assistants lack admin/vault permissions", async () => {
    const { token } = await t.system((tx) => createSession(tx, { firmId: f.firm.id, userId: f.users[1]!.id, req, mfaVerifiedAt: new Date() }));
    const s = await t.system((tx) => resolveSession(tx, token));
    expect(s?.permissions.has("vault:read")).toBe(false);
    expect(s?.permissions.has("user:manage")).toBe(false);
    expect(s?.permissions.has("client:read")).toBe(true);
  });
  it("rejects garbage, revoked, expired and idle sessions", async () => {
    expect(await t.system((tx) => resolveSession(tx, "x"))).toBeNull();
    expect(await t.system((tx) => resolveSession(tx, "A".repeat(43)))).toBeNull();

    const a = await t.system((tx) => createSession(tx, { firmId: f.firm.id, userId: ana().id, req }));
    const sa = await t.system((tx) => resolveSession(tx, a.token));
    await t.system((tx) => revokeSession(tx, sa!.sessionId));
    expect(await t.system((tx) => resolveSession(tx, a.token))).toBeNull();

    const b = await t.system((tx) => createSession(tx, { firmId: f.firm.id, userId: ana().id, req, expiresAt: new Date(Date.now() - 1000) }));
    expect(await t.system((tx) => resolveSession(tx, b.token))).toBeNull();

    const c = await t.system((tx) => createSession(tx, { firmId: f.firm.id, userId: ana().id, req }));
    await t.admin.update(sessions).set({ lastSeenAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 1000) }).where(eq(sessions.userId, ana().id));
    expect(await t.system((tx) => resolveSession(tx, c.token))).toBeNull();
  });
  it("rotation invalidates the old token (anti session-fixation) and keeps absolute expiry", async () => {
    const a = await t.system((tx) => createSession(tx, { firmId: f.firm.id, userId: ana().id, req }));
    const sa = (await t.system((tx) => resolveSession(tx, a.token)))!;
    const n = await t.system((tx) => rotateSession(tx, { sessionId: sa.sessionId, firmId: f.firm.id, userId: ana().id }, req, true));
    expect(await t.system((tx) => resolveSession(tx, a.token))).toBeNull();
    expect((await t.system((tx) => resolveSession(tx, n.token)))?.mfaVerified).toBe(true);
    expect(n.expiresAt.getTime()).toBe(a.expiresAt.getTime());
  });
});

describe("password", () => {
  it("policy rejects weak passwords", () => {
    expect(passwordPolicyError("short")).toMatch(/12/);
    expect(passwordPolicyError("aaaaaaaaaaaaaa")).not.toBeNull();
    expect(passwordPolicyError("password1234")).not.toBeNull();
    expect(passwordPolicyError("ana-firma-2026-x", { email: "ana-firma@x.test" })).not.toBeNull();
    expect(passwordPolicyError("tr0ub4dor&3-extra-long")).toBeNull();
  });
  it("change requires the current password and clears the forced-change flag", async () => {
    const id = f.users[1]!.id;
    await t.admin.update(users).set({ mustChangePassword: true }).where(eq(users.id, id));
    expect((await t.tenant(f.firm.id, (tx) => changePassword(tx, { userId: id, current: "wrong", next: "brand-new-passphrase-1" }))).ok).toBe(false);
    expect((await t.tenant(f.firm.id, (tx) => changePassword(tx, { userId: id, current: PW, next: "brand-new-passphrase-1" }))).ok).toBe(true);
    const [row] = await t.admin.select().from(users).where(eq(users.id, id));
    expect(row!.mustChangePassword).toBe(false);
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

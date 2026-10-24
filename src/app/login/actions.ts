"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { withSystem, withTenant } from "@/db/client";
import { audit } from "@/lib/audit";
import { requestInfo } from "@/lib/auth/context";
import { attemptLogin, normalizeEmail, verifySecondFactor } from "@/lib/auth/login";
import { createSession, revokeSession, rotateSession } from "@/lib/auth/session-core";
import { clearSessionCookie, getSession, nextStep, setSessionCookie } from "@/lib/auth/session";
import { limitOrMessage, type FormState } from "@/lib/auth/actions-shared";
import { blindIndex } from "@/lib/crypto";

const LoginInput = z.object({ email: z.string().max(254), password: z.string().min(1).max(128) });
const GENERIC = "Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.";

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = LoginInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: GENERIC };
  const { password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const req = await requestInfo();
  const ip = req.ip ?? "unknown";

  const denied =
    (await limitOrMessage("loginIp", ip, req)) ?? (await limitOrMessage("loginAccount", `${ip}:${blindIndex(email, "login")}`, req));
  if (denied) return { error: denied };

  const result = await withSystem(async (tx) => {
    const r = await attemptLogin(tx, { email, password });
    if (!r.ok) {
      await audit(tx, {
        action: r.reason === "locked" ? "auth.login.locked" : "auth.login.failure",
        firmId: r.firmId,
        userId: r.userId,
        req,
        meta: { emailHash: blindIndex(email, "login").slice(0, 12) },
      });
      return null;
    }
    const s = await createSession(tx, { firmId: r.user.firmId, userId: r.user.id, req });
    await audit(tx, { action: "auth.login.success", firmId: r.user.firmId, userId: r.user.id, req });
    return { ...s, user: r.user };
  });
  if (!result) return { error: GENERIC };

  await setSessionCookie(result.token, result.expiresAt);
  redirect(result.user.mustChangePassword ? "/account/password" : !result.user.totpEnabled ? "/account/mfa" : "/login/verify");
}

const Code = z.object({ code: z.string().min(6).max(24) });

export async function verifyAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.mfaVerified) redirect("/dashboard");
  const step = nextStep(s);
  if (step && step !== "/login/verify") redirect(step);

  const parsed = Code.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Ingresa el código de 6 dígitos." };
  const req = await requestInfo();
  const denied = await limitOrMessage("mfa", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };

  const outcome = await withTenant(s.user.firmId, async (tx) => {
    const r = await verifySecondFactor(tx, s.user.id, parsed.data.code);
    await audit(tx, {
      action: r.ok ? (r.method === "recovery" ? "auth.recovery.used" : "auth.mfa.success") : "auth.mfa.failure",
      firmId: s.user.firmId,
      userId: s.user.id,
      req,
    });
    if (!r.ok) return null;
    return rotateSession(tx, { sessionId: s.sessionId, firmId: s.user.firmId, userId: s.user.id }, req, true);
  });
  if (!outcome) return { error: "Código incorrecto o ya utilizado." };
  await setSessionCookie(outcome.token, outcome.expiresAt);
  redirect("/dashboard");
}

export async function logoutAction() {
  const s = await getSession();
  if (s) {
    const req = await requestInfo();
    await withTenant(s.user.firmId, async (tx) => {
      await revokeSession(tx, s.sessionId);
      await audit(tx, { action: "auth.logout", firmId: s.user.firmId, userId: s.user.id, req });
    });
  }
  await clearSessionCookie();
  redirect("/login");
}

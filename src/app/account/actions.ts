"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { withTenant } from "@/db/client";
import { audit } from "@/lib/audit";
import { requestInfo } from "@/lib/auth/context";
import { changePassword, confirmTotpEnrollment } from "@/lib/auth/login";
import { passwordPolicyError } from "@/lib/auth/password";
import { revokeOtherSessions, rotateSession } from "@/lib/auth/session-core";
import { getSession, nextStep, requireUser, setSessionCookie } from "@/lib/auth/session";
import { clearRecoveryFlash, setRecoveryFlash } from "@/lib/auth/flash";
import { limitOrMessage, type FormState } from "@/lib/auth/actions-shared";

const PasswordInput = z.object({
  current: z.string().min(1).max(128),
  next: z.string().max(128),
  confirm: z.string().max(128),
});

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  // Allowed while the forced first-login change is pending, or for a fully signed-in user.
  if (!s.user.mustChangePassword && nextStep(s)) redirect(nextStep(s)!);

  const parsed = PasswordInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Revisa los campos." };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { error: "Las contraseñas nuevas no coinciden." };
  if (next === current) return { error: "La contraseña nueva debe ser distinta a la actual." };
  const policy = passwordPolicyError(next, { email: s.user.email, name: s.user.name });
  if (policy) return { error: policy };

  const req = await requestInfo();
  const denied = await limitOrMessage("passwordChange", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };

  const rotated = await withTenant(s.user.firmId, async (tx) => {
    const r = await changePassword(tx, { userId: s.user.id, current, next });
    if (!r.ok) return null;
    // Kill every other session (a stolen session dies when the password changes) and rotate this one.
    await revokeOtherSessions(tx, s.user.id, s.sessionId);
    await audit(tx, { action: "auth.password.changed", firmId: s.user.firmId, userId: s.user.id, req });
    return rotateSession(tx, { sessionId: s.sessionId, firmId: s.user.firmId, userId: s.user.id }, req, s.mfaVerified);
  });
  if (!rotated) return { error: "La contraseña actual es incorrecta." };
  await setSessionCookie(rotated.token, rotated.expiresAt);
  redirect(s.user.totpEnabled ? (s.mfaVerified ? "/dashboard" : "/login/verify") : "/account/mfa");
}

export async function confirmMfaAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s || s.user.mustChangePassword) redirect(s ? "/account/password" : "/login");
  if (s.user.totpEnabled) redirect("/dashboard");

  const code = z.string().regex(/^\d{6}$/).safeParse(String(form.get("code") ?? "").replace(/\s/g, ""));
  if (!code.success) return { error: "Ingresa el código de 6 dígitos." };
  const req = await requestInfo();
  const denied = await limitOrMessage("mfa", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };

  const out = await withTenant(s.user.firmId, async (tx) => {
    const r = await confirmTotpEnrollment(tx, { userId: s.user.id, firmId: s.user.firmId, code: code.data });
    if (!r.ok) return null;
    await audit(tx, { action: "auth.mfa.enrolled", firmId: s.user.firmId, userId: s.user.id, req });
    const session = await rotateSession(tx, { sessionId: s.sessionId, firmId: s.user.firmId, userId: s.user.id }, req, true);
    return { session, codes: r.recoveryCodes };
  });
  if (!out) return { error: "Código incorrecto. Revisa la hora de tu teléfono e intenta de nuevo." };
  await setSessionCookie(out.session.token, out.session.expiresAt);
  await setRecoveryFlash(s.user.id, out.codes);
  redirect("/account/mfa/codes");
}

export async function ackRecoveryCodesAction() {
  await requireUser();
  await clearRecoveryFlash();
  redirect("/dashboard");
}

export async function revokeOtherSessionsAction() {
  const s = await requireUser();
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await revokeOtherSessions(tx, s.user.id, s.sessionId);
    await audit(tx, { action: "auth.session.revoked", firmId: s.user.firmId, userId: s.user.id, req, meta: { scope: "others" } });
  });
  redirect("/account/security");
}

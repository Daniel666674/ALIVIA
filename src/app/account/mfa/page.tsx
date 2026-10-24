import { redirect } from "next/navigation";
import { withTenant } from "@/db/client";
import { Card } from "@/components/ui";
import { beginTotpEnrollment, pendingTotpSecret } from "@/lib/auth/login";
import { totpQrDataUrl } from "@/lib/auth/totp";
import { getSession, nextStep } from "@/lib/auth/session";
import { MfaForm } from "./mfa-form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const step = nextStep(s);
  if (step && step !== "/account/mfa") redirect(step);
  if (s.user.totpEnabled) redirect("/dashboard");

  const secret = await withTenant(s.user.firmId, async (tx) => (await pendingTotpSecret(tx, s.user.id)) ?? beginTotpEnrollment(tx, s.user.id));
  const qr = await totpQrDataUrl(secret, s.user.email);
  return (
    <Card title="Activa la verificación en dos pasos" subtitle="Es obligatoria para entrar a Alivia">
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Abre Google Authenticator, Authy o similar.</li>
        <li>Escanea el código QR (o ingresa la clave manualmente).</li>
        <li>Escribe el código de 6 dígitos que aparece.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="Código QR para tu app autenticadora" width={220} height={220} className="mx-auto" />
      <p className="my-3 break-all text-center font-mono text-xs text-slate-500">{secret}</p>
      <MfaForm />
    </Card>
  );
}

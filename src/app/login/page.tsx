import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession, nextStep } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect(nextStep(s) ?? "/dashboard");
  return (
    <Card title="Alivia" subtitle="Ingresa con tu cuenta de la firma">
      <LoginForm />
      <p className="mt-4 text-center text-xs text-slate-500">Acceso solo por invitación. Si necesitas una cuenta, contacta al administrador.</p>
    </Card>
  );
}

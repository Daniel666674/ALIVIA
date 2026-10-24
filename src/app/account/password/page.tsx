import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession, nextStep } from "@/lib/auth/session";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const step = nextStep(s);
  if (step && step !== "/account/password") redirect(step);
  return (
    <Card
      title="Cambia tu contraseña"
      subtitle={s.user.mustChangePassword ? "Es tu primer ingreso: elige una contraseña propia." : "Actualiza tu contraseña"}
    >
      <PasswordForm />
    </Card>
  );
}

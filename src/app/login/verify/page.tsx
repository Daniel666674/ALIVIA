import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession, nextStep } from "@/lib/auth/session";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const step = nextStep(s);
  if (step !== "/login/verify") redirect(step ?? "/dashboard");
  return (
    <Card title="Verificación en dos pasos" subtitle="Ingresa el código de tu app autenticadora o un código de recuperación">
      <VerifyForm />
    </Card>
  );
}

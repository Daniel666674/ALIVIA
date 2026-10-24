import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { readRecoveryFlash } from "@/lib/auth/flash";
import { requireUser } from "@/lib/auth/session";
import { ackRecoveryCodesAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RecoveryCodesPage() {
  const s = await requireUser();
  const codes = await readRecoveryFlash(s.user.id);
  if (!codes) redirect("/dashboard");
  return (
    <Card title="Códigos de recuperación" subtitle="Tu verificación en dos pasos está activa">
      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Guarda estos códigos en un lugar seguro. Cada uno sirve una sola vez y <b>no se volverán a mostrar</b>.
      </p>
      <ul className="mb-4 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded bg-slate-100 px-2 py-1 text-center">{c}</li>
        ))}
      </ul>
      <form action={ackRecoveryCodesAction}>
        <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-dark">
          Ya los guardé, continuar
        </button>
      </form>
    </Card>
  );
}

import Link from "next/link";
import { mfaRequired, requireUser } from "@/lib/auth/session";
import { listMySessions } from "@/lib/auth/queries";
import { revokeOtherSessionsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const s = await requireUser();
  const list = await listMySessions(s);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand hover:underline">← Volver</Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">Seguridad de mi cuenta</h1>
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 font-medium">Verificación en dos pasos</h2>
        {s.user.totpEnabled ? (
          <p className="text-sm text-emerald-700">Activa. Se le pedirá un código de su app autenticadora en cada ingreso.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">
              {mfaRequired() ? "Es obligatoria para entrar." : "Está desactivada. Recomendamos activarla: protege su cuenta aunque alguien conozca su contraseña."}
            </p>
            <Link href="/account/mfa" className="inline-flex rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">Activar ahora</Link>
          </>
        )}
      </section>
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-medium">Sesiones activas</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {list.map((x) => (
            <li key={x.id} className="flex justify-between py-2">
              <span>
                {x.userAgent?.slice(0, 60) ?? "Dispositivo desconocido"} · {String(x.ip ?? "IP desconocida")}
                {x.id === s.sessionId && <b className="ml-2 text-emerald-700">(esta sesión)</b>}
              </span>
              <time className="text-slate-500">{x.lastSeenAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}</time>
            </li>
          ))}
        </ul>
        <form action={revokeOtherSessionsAction} className="mt-4">
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Cerrar todas las demás sesiones
          </button>
        </form>
      </section>
      <Link href="/account/password" className="text-sm text-brand hover:underline">Cambiar contraseña</Link>
    </main>
  );
}

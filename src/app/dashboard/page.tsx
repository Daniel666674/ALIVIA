import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const s = await requirePermission("dashboard:read");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hola, {s.user.name}</h1>
          <p className="text-sm text-slate-600">{s.user.email} · {s.user.roleKey}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/account/security" className="text-brand hover:underline">Seguridad</Link>
          <form action={logoutAction}>
            <button className="text-slate-600 hover:underline" type="submit">Salir</button>
          </form>
        </div>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 font-medium">Hoy</h2>
        <p className="text-sm text-slate-600">
          Fase 1 completa: acceso seguro activo. Los clientes, documentos y acciones sugeridas llegan en las siguientes fases.
        </p>
        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer">Mis permisos</summary>
          <ul className="mt-2 list-disc pl-5">{[...s.permissions].sort().map((p) => <li key={p}>{p}</li>)}</ul>
        </details>
      </section>
    </main>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import type { ResolvedSession } from "@/lib/auth/session-core";
import { can } from "@/lib/auth/session-core";

const NAV = [
  { href: "/dashboard", label: "Hoy", icon: "🏠", perm: "dashboard:read" },
  { href: "/clients", label: "Clientes", icon: "👥", perm: "client:read" },
  { href: "/board", label: "Tablero", icon: "🚦", perm: "client:read" },
  { href: "/tasks", label: "Tareas", icon: "✅", perm: "task:read" },
  { href: "/team", label: "Equipo", icon: "⚙️", perm: "user:manage" },
] as const;

export function Shell({ session, active, children }: { session: ResolvedSession; active: string; children: ReactNode }) {
  const initials = session.user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="bg-slate-900 px-3 py-4 text-slate-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="mb-3 flex items-center gap-2.5 px-2 text-lg font-bold text-white lg:mb-6">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-base">A</span>Alivia
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Principal">
          {NAV.filter((n) => can(session, n.perm)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active === n.href ? "bg-slate-800 font-semibold text-white" : "hover:bg-slate-800/60"}`}
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-3 flex items-center gap-2.5 border-t border-slate-800 px-2 pt-3 text-sm text-white lg:mt-auto">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold">{initials}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate">{session.user.name}</div>
            <div className="flex gap-3 text-xs text-slate-400">
              <Link href="/account/security" className="hover:text-white">Seguridad</Link>
              <form action={logoutAction}>
                <button type="submit" className="hover:text-white">Salir</button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}

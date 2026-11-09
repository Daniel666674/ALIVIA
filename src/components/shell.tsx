import { isDeveloper } from "@/lib/developer";
import { UsageTracker } from "@/components/usage-tracker";
import Link from "next/link";
import type { ReactNode } from "react";
import { withTenant } from "@/db/client";
import { logoutAction } from "@/app/login/actions";
import { Icon, type IconName } from "@/components/icons";
import { mfaRequired } from "@/lib/auth/session";
import type { ResolvedSession } from "@/lib/auth/session-core";
import { can } from "@/lib/auth/session-core";
import { shellCounts } from "@/lib/clients/service";

type Item = { href: string; label: string; icon: IconName; perm: Parameters<typeof can>[1]; badge?: "clients" | "docs" | "tasks" };
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", perm: "dashboard:read" },
      { href: "/clients", label: "Clientes", icon: "users", perm: "client:read", badge: "clients" },
      { href: "/documents", label: "Documentos", icon: "file", perm: "document:read", badge: "docs" },
      { href: "/tasks", label: "Tareas", icon: "tasks", perm: "task:read", badge: "tasks" },
    ],
  },
  {
    title: "Operaciones",
    items: [
      { href: "/automations", label: "Automatizaciones", icon: "bolt", perm: "dashboard:read" },
      { href: "/integrations", label: "Integraciones", icon: "link", perm: "dashboard:read" },
    ],
  },
  {
    title: "Gestión",
    items: [
      { href: "/team", label: "Equipo", icon: "team", perm: "user:manage" },
      { href: "/reports", label: "Reportes", icon: "chart", perm: "client:read" },
      { href: "/settings", label: "Configuración", icon: "cog", perm: "user:manage" },
    ],
  },
];

const ROLE = { owner: "Administrador", accountant: "Contador", assistant: "Auxiliar contable" } as Record<string, string>;

export async function Shell({ session, active, children }: { session: ResolvedSession; active: string; children: ReactNode }) {
  const all = await withTenant(session.user.firmId, (tx) => shellCounts(tx, session.user.firmId));
  const counts = {
    clients: can(session, "client:read") ? all.clients : 0,
    docs: can(session, "document:read") ? all.docs : 0,
    tasks: can(session, "task:read") ? all.tasks : 0,
  };
  const initials = session.user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const cap = (n: number) => (n > 99 ? "99+" : String(n));
  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden">
      <aside className="sidebar lg:w-[240px] lg:min-w-[240px] lg:overflow-hidden">
        <div className="sb-header">
          <div className="flex items-center gap-2.5">
            <div className="logo-mark">
              <svg viewBox="0 0 18 18" fill="none" width="18" height="18" aria-hidden>
                <path d="M9 2L16 6V12L9 16L2 12V6L9 2Z" fill="white" opacity="0.95" />
                <path d="M9 5.5L13 7.75V12.25L9 14.5L5 12.25V7.75L9 5.5Z" fill="white" opacity="0.38" />
              </svg>
            </div>
            <div className="flex flex-col gap-px">
              <span className="logo-name">Alivia</span>
              <span className="logo-tag">Firma Contable OS</span>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-y-auto" aria-label="Principal">
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => can(session, i.perm));
            if (!items.length) return null;
            return (
              <div key={g.title} className="flex gap-1 lg:block">
                <div className="nav-group hidden lg:block">{g.title}</div>
                {items.map((i) => (
                  <Link key={i.href} href={i.href} aria-current={active === i.href ? "page" : undefined} className={`nav-item whitespace-nowrap ${active === i.href ? "active" : ""}`}>
                    <Icon name={i.icon} />
                    <span className="label flex-1">{i.label}</span>
                    {i.badge === "clients" && counts.clients > 0 && <span className="nav-badge">{cap(counts.clients)}</span>}
                    {i.badge === "docs" && counts.docs > 0 && <span className="nav-badge red">{cap(counts.docs)}</span>}
                    {i.badge === "tasks" && counts.tasks > 0 && <span className="nav-badge amber">{cap(counts.tasks)}</span>}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--sb-border)" }}>
          <div className="flex items-center gap-2.5 rounded-md p-2">
            <span className="user-av">{initials}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold" style={{ color: "#c4cfdc" }}>{session.user.name}</div>
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,.28)" }}>{ROLE[session.user.roleKey] ?? session.user.roleKey}</div>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between px-2 text-[12px]" style={{ color: "var(--sb-item)" }}>
            <Link href="/account/security" className="hover:text-white">Seguridad</Link>
            {isDeveloper(session.user.email) && <Link href="/usage" className="hover:text-white">Uso</Link>}
            <form action={logoutAction}>
              <button type="submit" className="inline-flex items-center gap-1 hover:text-white"><Icon name="logout" width={13} height={13} />Salir</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 lg:overflow-y-auto">
        <div className="px-4 py-6 sm:px-7" style={{ minHeight: "100%" }}>
          {!mfaRequired() && !session.user.totpEnabled && (
            <div role="status" className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px]" style={{ background: "var(--amber-bg)", borderColor: "rgba(247,144,9,.3)", color: "#92400e" }}>
              <b>Verificación en dos pasos desactivada en este entorno.</b> Su cuenta solo está protegida por la contraseña.
              <Link href="/account/mfa" className="font-semibold underline">Activarla</Link>
            </div>
          )}
          {children}
        </div>
        <UsageTracker />
      </main>
    </div>
  );
}

import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { auditLog, firms, roles, users } from "@/db/schema";
import { Badge, PageHeader, Panel } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  "auth.login.success": "Inició sesión",
  "auth.login.failure": "Intento de ingreso fallido",
  "auth.login.locked": "Cuenta bloqueada temporalmente",
  "auth.logout": "Cerró sesión",
  "auth.mfa.success": "Verificó el segundo paso",
  "auth.mfa.failure": "Código de verificación incorrecto",
  "auth.mfa.enrolled": "Activó la verificación en dos pasos",
  "auth.recovery.used": "Usó un código de recuperación",
  "auth.password.changed": "Cambió su contraseña",
  "auth.rate_limited": "Bloqueo por demasiados intentos",
  "client.created": "Creó un cliente",
  "client.updated": "Editó un cliente",
  "client.stage": "Cambió el estado de una declaración",
  "client.deleted": "Eliminó un cliente",
  "import.applied": "Importó clientes",
  "import.rolled_back": "Deshizo una importación",
  "document.uploaded": "Subió un documento",
  "document.downloaded": "Descargó un documento",
  "document.status": "Cambió el estado de un documento",
  "document.deleted": "Eliminó un documento",
  "task.created": "Creó una tarea",
  "task.done": "Completó una tarea",
  "task.deleted": "Eliminó una tarea",
};

export default async function TeamPage() {
  const s = await requirePermission("user:manage");
  const { team, firm, log } = await withTenant(s.user.firmId, async (tx) => ({
    team: await tx.select({ id: users.id, name: users.name, email: users.email, status: users.status, totp: users.totpEnabled, last: users.lastLoginAt, role: roles.name }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).orderBy(users.name),
    firm: (await tx.select().from(firms).where(eq(firms.id, s.user.firmId)))[0]!,
    log: await tx
      .select({ at: auditLog.at, action: auditLog.action, who: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.firmId, s.user.firmId))
      .orderBy(desc(auditLog.at))
      .limit(25),
  }));
  const active = team.filter((t) => t.status === "active").length;
  return (
    <Shell session={s} active="/team">
      <PageHeader help="team" title="Equipo y auditoría" subtitle={`${active} de ${firm.seatLimit} usuarios en uso · plan de hasta ${firm.clientLimit} clientes`} />
      <Panel title="Usuarios" className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-2">Persona</th><th>Rol</th><th>2 pasos</th><th>Último ingreso</th><th>Estado</th></tr></thead>
            <tbody>
              {team.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5"><div className="font-semibold">{t.name}</div><div className="text-xs text-slate-500">{t.email}</div></td>
                  <td><Badge tone="brand">{t.role}</Badge></td>
                  <td>{t.totp ? <Badge tone="green">Activa</Badge> : <Badge tone="amber">Pendiente</Badge>}</td>
                  <td className="text-slate-600">{t.last ? fmtDateTime(t.last) : "Nunca"}</td>
                  <td><Badge tone={t.status === "active" ? "green" : "slate"}>{t.status === "active" ? "Activo" : "Desactivado"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Auditoría" action={<span className="text-xs text-slate-500">Solo se agrega, nunca se borra</span>}>
        <ul className="divide-y divide-slate-100 text-sm">
          {log.map((l, i) => (
            <li key={i} className="flex gap-3 py-2"><span className="w-32 shrink-0 text-xs text-slate-500">{fmtDateTime(l.at)}</span><span><b>{l.who ?? "Sistema"}</b> · {ACTIONS[l.action] ?? l.action}</span></li>
          ))}
        </ul>
      </Panel>
    </Shell>
  );
}

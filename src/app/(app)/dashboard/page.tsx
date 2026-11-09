import Link from "next/link";
import { withTenant } from "@/db/client";
import { Dot, Panel, PageHeader, Stat, LinkButton, Badge } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { dashboardStats, listClients, upcomingDeadlines } from "@/lib/clients/service";
import { listTasks } from "@/lib/clients/tasks";
import { colorFor, COLOR_LABEL, type Stage } from "@/lib/clients/semaforo";
import { daysUntil, deadlineText, fmtDate, todayBogota } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const s = await requirePermission("dashboard:read");
  const canClients = can(s, "client:read");
  const canTasks = can(s, "task:read");
  const data = await withTenant(s.user.firmId, async (tx) => ({
    stats: canClients ? await dashboardStats(tx, s.user.firmId) : null,
    deadlines: canClients ? await upcomingDeadlines(tx, s.user.firmId, 6) : [],
    redClients: canClients ? (await listClients(tx, s.user.firmId, { tab: "red", pageSize: 5 })).rows : [],
    tasks: canTasks ? await listTasks(tx, s.user.firmId, { status: "open", assigneeId: s.user.id }) : [],
  }));
  const st = data.stats;
  const today = todayBogota();
  const dueTasks = data.tasks.filter((t) => t.dueDate && t.dueDate <= today);
  const total = st?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Shell session={s} active="/dashboard">
      <PageHeader
        title={`Hola, ${s.user.name.split(" ")[0]}`}
        subtitle="Esto es lo que necesita atención hoy"
        actions={canClients && <LinkButton href="/clients/import">⬆ Importar clientes</LinkButton>}
      />
      {st && total === 0 ? (
        <Panel>
          <div className="py-8 text-center">
            <div className="text-4xl" aria-hidden>📂</div>
            <h2 className="mt-2 text-lg font-semibold">Todavía no hay clientes</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Cargue su base de clientes desde un archivo CSV (Excel guardado como CSV). Revisamos cada fila antes de guardar y puede deshacer la carga.</p>
            <div className="mt-4 flex justify-center gap-2">
              <LinkButton primary href="/clients/import">Importar desde CSV</LinkButton>
              <LinkButton href="/clients/new">Crear un cliente</LinkButton>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          {st && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Clientes activos" value={st.total} hint={`${st.natural} personas · ${st.empresas} empresas`} />
              <Stat label="Documentos pendientes" value={st.pendingDocs} hint="de clientes sin presentar" />
              <Stat label="Sin ningún documento" value={st.colors.red} tone="red" hint="clientes en rojo" />
              <Stat label="Declaraciones presentadas" value={st.presented} tone="green" hint={`de ${st.total} clientes`} />
            </div>
          )}
          <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
            <div className="space-y-5">
              {canTasks && (
                <Panel title="Mis tareas" action={<Link href="/tasks" className="text-xs font-semibold text-brand hover:underline">Ver todas</Link>}>
                  {data.tasks.length === 0 ? (
                    <p className="text-sm text-slate-500">No tiene tareas abiertas. 🎉</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.tasks.slice(0, 6).map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{t.title}</span>
                            {t.clientName && <Link href={`/clients/${t.clientId}`} className="text-xs text-slate-500 hover:underline">{t.clientName}</Link>}
                          </span>
                          {t.dueDate && <Badge tone={t.dueDate <= today ? "red" : "slate"}>{t.dueDate <= today ? deadlineText(t.dueDate) : fmtDate(t.dueDate)}</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {dueTasks.length > 0 && <p className="mt-2 text-xs font-medium text-red-600">{dueTasks.length} vencen hoy o ya vencieron</p>}
                </Panel>
              )}
              {canClients && (
                <Panel title="Clientes que necesitan documentos" action={<Link href="/clients?tab=red" className="text-xs font-semibold text-brand hover:underline">Ver los {st?.colors.red ?? 0}</Link>}>
                  {data.redClients.length === 0 ? (
                    <p className="text-sm text-slate-500">Todos los clientes tienen al menos un documento.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.redClients.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <Dot color="red" />
                          <Link href={`/clients/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{c.name}</Link>
                          <span className="text-xs text-slate-500">{deadlineText(c.deadline)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
            </div>
            {st && (
              <div className="space-y-5">
                <Panel title="Estado de la cartera">
                  <div className="flex h-3.5 overflow-hidden rounded-full bg-slate-200" role="img" aria-label="Distribución por color">
                    <i style={{ width: `${pct(st.colors.red)}%` }} className="bg-red-500" />
                    <i style={{ width: `${pct(st.colors.yellow)}%` }} className="bg-amber-400" />
                    <i style={{ width: `${pct(st.colors.blue)}%` }} className="bg-sky-500" />
                    <i style={{ width: `${pct(st.colors.green)}%` }} className="bg-emerald-500" />
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {(["red", "yellow", "blue", "green"] as const).map((c) => (
                      <li key={c} className="flex items-center gap-2">
                        <Dot color={c} /> {COLOR_LABEL[c]} <b className="ml-auto">{st.colors[c]}</b>
                      </li>
                    ))}
                  </ul>
                  <Link href="/board" className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">Ver el tablero completo →</Link>
                </Panel>
                <Panel title="Próximas fechas límite">
                  {data.deadlines.length === 0 ? (
                    <p className="text-sm text-slate-500">Ningún cliente tiene fecha límite cargada.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {data.deadlines.map((d) => {
                        const left = daysUntil(d.deadline);
                        return (
                          <li key={d.id} className="flex items-center gap-2">
                            <Dot color={colorFor(d.stage as Stage, d.received)} size="h-2.5 w-2.5" />
                            <Link href={`/clients/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">{d.name}</Link>
                            <span className={`text-xs ${left !== null && left <= 2 ? "font-semibold text-red-600" : "text-slate-500"}`}>{fmtDate(d.deadline)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

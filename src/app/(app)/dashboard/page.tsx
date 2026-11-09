import Link from "next/link";
import { withTenant } from "@/db/client";
import { Avatar, LinkButton, PageHeader, Stat } from "@/components/app-ui";
import { Icon } from "@/components/icons";
import { Shell } from "@/components/shell";
import { Help } from "@/components/help";
import { NbaList } from "@/components/nba-list";
import { loadNba } from "@/lib/clients/nba-view";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { recentActivity } from "@/lib/clients/activity";
import { dashboardStats, missingDocs, newClientsSince } from "@/lib/clients/service";
import { listTasks, workload } from "@/lib/clients/tasks";
import { COLOR_LABEL } from "@/lib/clients/semaforo";
import { deadlineText, fmtDate, greeting, longDate, timeAgo, todayBogota } from "@/lib/format";

export const dynamic = "force-dynamic";

const DOT = { green: "var(--green)", brand: "var(--brand)", red: "var(--red)", amber: "var(--amber)", blue: "var(--blue)", teal: "#0d9488" } as Record<string, string>;

export default async function Dashboard() {
  const s = await requirePermission("dashboard:read");
  const canClients = can(s, "client:read");
  const canTasks = can(s, "task:read");
  const f = s.user.firmId;
  const d = await withTenant(f, async (tx) => ({
    stats: canClients ? await dashboardStats(tx, f) : null,
    missing: canClients ? await missingDocs(tx, f, 5) : [],
    fresh: canClients ? await newClientsSince(tx, f, 30) : 0,
    activity: await recentActivity(tx, f, 7),
    tasks: canTasks ? await listTasks(tx, f, { status: "open" }) : [],
    load: await workload(tx, f),
    nba: canClients ? await loadNba(tx, f, { limit: 6, withTasks: canTasks }) : { items: [], total: 0 },
  }));
  const st = d.stats;
  const today = todayBogota();
  const overdue = d.tasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const todays = d.tasks.filter((t) => !t.assigneeId || t.assigneeId === s.user.id).filter((t) => (t.dueDate ?? "9999") <= today).concat(
    d.tasks.filter((t) => (!t.assigneeId || t.assigneeId === s.user.id) && (t.dueDate ?? "9999") > today),
  ).slice(0, 5);
  const total = st?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const maxTasks = Math.max(8, ...d.load.map((u) => u.tasks));

  return (
    <Shell session={s} active="/dashboard">
      <PageHeader
        help="dashboard"
        title={<>{greeting()}, {s.user.name.split(" ")[0]} 👋</>}
        subtitle={<>{longDate()} · Aquí está el resumen del día</>}
        actions={
          <>
            {canClients && <Link href="/clients" className="btn btn-secondary btn-sm"><Icon name="filter" />Filtrar</Link>}
            {canClients && can(s, "import:run") && <Link href="/clients/import" className="btn btn-secondary btn-sm"><Icon name="upload" />Importar clientes</Link>}
            <Link href="/dashboard" className="btn btn-primary btn-sm"><Icon name="refresh" />Actualizar</Link>
          </>
        }
      />

      {st && total === 0 ? (
        <section className="card">
          <div className="empty">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--brand-light)", color: "var(--brand)" }}><Icon name="users" width={26} height={26} /></div>
            <h3>Todavía no hay clientes</h3>
            <p className="mx-auto max-w-md text-[13px]">Cargue su base de clientes desde un archivo CSV (Excel guardado como CSV). Revisamos cada fila antes de guardar y puede deshacer la carga.</p>
            <div className="mt-4 flex justify-center gap-2">
              <LinkButton primary href="/clients/import" icon="upload">Importar desde CSV</LinkButton>
              <LinkButton href="/clients/new" icon="plus">Crear un cliente</LinkButton>
            </div>
          </div>
        </section>
      ) : (
        <>
          {st && (
            <div className="dash-stats mb-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
              <Stat icon="users" iconBg="#EDE9FE" iconColor="#4F46E5" label="Clientes activos" value={st.total} hint={d.fresh ? `↑ +${d.fresh} este mes` : `${st.natural} personas · ${st.empresas} empresas`} hintTone={d.fresh ? "up" : "neutral"} />
              <Stat icon="file" iconBg="#FEF3C7" iconColor="#F79009" label="Documentos pendientes" value={st.pendingDocs} hint={`· ${st.colors.red + st.colors.yellow} requieren acción`} />
              <Stat icon="clock" iconBg="#FEE2E2" iconColor="#F04438" label="Tareas vencidas" value={overdue} hint={overdue ? "↓ Requieren atención" : "· Todo al día"} hintTone={overdue ? "down" : "neutral"} />
              <Stat icon="receipt" iconBg="#CCFBF1" iconColor="#0D9488" label="Facturas pendientes" value={0} hint="· Cobros llegan en la siguiente fase" />
              <Stat icon="bolt" iconBg="#F5F3FF" iconColor="#7C3AED" label="Automatizaciones activas" value={0} hint="· Llegan en la siguiente fase" />
            </div>
          )}

          {d.nba.items.length > 0 && (
            <section className="card mb-4">
              <div className="sec-hd">
                <div><h2 className="sec-title">Siguiente mejor acción<Help id="nba" /></h2><p className="sec-sub">Lo más importante que puede hacer ahora, en orden · {d.nba.total} sugerencias</p></div>
                <Link href="/actions" className="link-more">Ver todas →</Link>
              </div>
              <NbaList items={d.nba.items} canWrite={can(s, "client:write")} compact />
            </section>
          )}

          <div className="mb-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
            <section className="card">
              <div className="sec-hd">
                <div><h2 className="sec-title">Actividad reciente</h2><p className="sec-sub">Últimas acciones del equipo</p></div>
                {can(s, "user:manage") && <Link href="/team" className="link-more">Ver todo</Link>}
              </div>
              {d.activity.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ color: "var(--t3)" }}>Todavía no hay actividad.</p>
              ) : (
                d.activity.map((a) => (
                  <div key={a.id} className="act-item">
                    <span className="act-dot" style={{ background: DOT[a.dot] }} />
                    <div>
                      <div className="act-txt"><b style={{ color: "var(--t1)" }}>{a.who}</b> {a.verb}{" "}{a.targetHref ? <Link href={a.targetHref} className="font-semibold" style={{ color: "var(--t1)" }}>{a.target}</Link> : a.target && <b style={{ color: "var(--t1)" }}>{a.target}</b>}</div>
                      <div className="act-time">{timeAgo(a.at)}</div>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="card">
              <div className="sec-hd">
                <div><h2 className="sec-title">Documentos faltantes<Help id="missing" /></h2><p className="sec-sub">Clientes con documentación incompleta</p></div>
                <Link href="/clients?tab=red" className="link-more">Ver →</Link>
              </div>
              {d.missing.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ color: "var(--t3)" }}>No hay clientes con documentos pendientes. 🎉</p>
              ) : (
                d.missing.map((c) => (
                  <div key={c.id} className="miss-row">
                    <Avatar name={c.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/clients/${c.id}`} className="block truncate text-[13px] font-semibold hover:underline" style={{ color: "var(--t1)" }}>{c.name}</Link>
                      <div className="text-[11.5px]" style={{ color: "var(--t3)" }}>{c.pct}% completado{c.deadline ? ` · ${deadlineText(c.deadline).toLowerCase()}` : ""}</div>
                    </div>
                    <div className="prog w-[70px]" style={{ height: 4 }}><div className="prog-fill" style={{ width: `${c.pct}%`, background: "var(--amber)" }} /></div>
                    <span className="badge b-amber">{c.missing} falt.</span>
                  </div>
                ))
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {canTasks && (
              <section className="card">
                <div className="sec-hd">
                  <div><h2 className="sec-title">Tareas para hoy<Help id="tasks" /></h2><p className="sec-sub">{todays.length} pendientes</p></div>
                  <Link href="/tasks" className="link-more">Ver todas →</Link>
                </div>
                {todays.length === 0 ? (
                  <p className="py-6 text-center text-[13px]" style={{ color: "var(--t3)" }}>No tiene tareas abiertas. 🎉</p>
                ) : (
                  todays.map((t) => {
                    const late = t.dueDate && t.dueDate < today;
                    const now = t.dueDate === today;
                    return (
                      <div key={t.id} className="task-today">
                        <span className="tprio" style={{ background: late ? "var(--red)" : now ? "var(--amber)" : "var(--green)" }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium" style={{ color: "var(--t1)" }}>{t.title}</div>
                          <div className="text-[11.5px]" style={{ color: "var(--t3)" }}>{t.clientName ?? "Sin cliente"}</div>
                        </div>
                        <span className={`badge ${late ? "b-red" : now ? "b-amber" : "b-gray"}`}>{t.dueDate ? (late ? deadlineText(t.dueDate) : now ? "Hoy" : fmtDate(t.dueDate)) : "Sin fecha"}</span>
                      </div>
                    );
                  })
                )}
              </section>
            )}

            <section className="card">
              <div className="sec-hd">
                <div><h2 className="sec-title">Carga laboral<Help id="workload" /></h2><p className="sec-sub">Tareas abiertas y clientes por persona</p></div>
              </div>
              {d.load.map((u) => {
                const p = Math.round((u.tasks / maxTasks) * 100);
                const color = p > 85 ? "var(--red)" : p > 60 ? "var(--amber)" : "var(--green)";
                return (
                  <div key={u.id} className="wl-row">
                    <Avatar name={u.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{u.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--t3)" }}>{u.clients} clientes · {u.tasks} tareas</div>
                    </div>
                    <div className="prog w-[90px]"><div className="prog-fill" style={{ width: `${p}%`, background: color }} /></div>
                  </div>
                );
              })}
            </section>

            <section className="card">
              <div className="sec-hd">
                <div><h2 className="sec-title">Integraciones activas<Help id="integrations" align="right" /></h2><p className="sec-sub">0 conectadas</p></div>
                <Link href="/integrations" className="link-more">Gestionar →</Link>
              </div>
              {[["G", "Gmail", "#FDECEA", "#EA4335"], ["O", "Outlook", "#E6F1FD", "#0072EF"], ["W", "WhatsApp", "#E8F9EF", "#25D366"], ["D", "Google Drive", "#FEF5DC", "#F9AB00"]].map(([l, n, bg, c]) => (
                <div key={n} className="int-row">
                  <div className="int-logo" style={{ background: bg, color: c }}>{l}</div>
                  <div className="int-name">{n}</div>
                  <div className="int-sync">Próximamente</div>
                  <div className="int-dot off" />
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

import Link from "next/link";
import { withTenant } from "@/db/client";
import { PageHeader, Panel, Stat } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { listClients, firmUsers } from "@/lib/clients/service";
import { listTasks } from "@/lib/clients/tasks";
import { todayBogota } from "@/lib/format";
import { TaskForm } from "../clients/forms";
import { KanbanBoard, type KTask } from "./kanban";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("task:read");
  const raw = await searchParams;
  const who = raw.who;
  const people0 = await withTenant(s.user.firmId, (tx) => firmUsers(tx, s.user.firmId));
  const assigneeId = who === "me" ? s.user.id : people0.find((p) => p.id === who)?.id;
  const { open, done, clientOptions } = await withTenant(s.user.firmId, async (tx) => ({
    open: await listTasks(tx, s.user.firmId, { status: "open", assigneeId }),
    done: (await listTasks(tx, s.user.firmId, { status: "done", assigneeId })).slice(0, 15),
    clientOptions: can(s, "client:read") ? (await listClients(tx, s.user.firmId, { pageSize: 100 })).rows.map((c) => ({ id: c.id, name: c.name })) : [],
  }));
  const today = todayBogota();
  const canWrite = can(s, "task:write");
  const all: KTask[] = [...open, ...done].map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, clientId: t.clientId, clientName: t.clientName, assigneeName: t.assigneeName }));
  const late = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const tab = (href: string, label: string, on: boolean) => <Link key={href} href={href} className={`f-tab ${on ? "active" : ""}`}>{label}</Link>;

  return (
    <Shell session={s} active="/tasks">
      <PageHeader help="tasks" title="Tareas" subtitle="Arrastre cada tarea entre columnas: Por hacer → En curso → En revisión → Hecha" />
      <div className="mb-4 grid gap-3.5 sm:grid-cols-3">
        <Stat icon="tasks" iconBg="#EDE9FE" iconColor="#4F46E5" label="Abiertas" value={open.length} hint={assigneeId ? "· de esta persona" : "· de todo el equipo"} />
        <Stat icon="clock" iconBg="#FEE2E2" iconColor="#F04438" label="Vencidas" value={late} hint={late ? "↓ Requieren atención" : "· Todo al día"} hintTone={late ? "down" : "neutral"} />
        <Stat icon="check" iconBg="#CCFBF1" iconColor="#0D9488" label="Hechas recientemente" value={done.length} hint="· últimas 15" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="f-tabs" aria-label="Filtrar por persona">
          {tab("/tasks", "Todas", !assigneeId)}
          {tab("/tasks?who=me", "Mis tareas", who === "me")}
          {people0.filter((p) => p.id !== s.user.id).map((p) => tab(`/tasks?who=${p.id}`, p.name.split(" ")[0]!, who === p.id))}
        </nav>
      </div>
      {canWrite && (
        <details className="card mb-4">
          <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--brand)" }}>＋ Nueva tarea</summary>
          <div className="mt-3"><TaskForm people={people0.map((p) => ({ id: p.id, name: p.name }))} clients={clientOptions} /></div>
        </details>
      )}
      <KanbanBoard key={`${assigneeId ?? "all"}-${all.map((t) => t.id + t.status).join("")}`} initial={all} canWrite={canWrite} today={today} />
      <Panel className="mt-4"><p className="text-[12px]" style={{ color: "var(--t3)" }}>Consejo: también puede cambiar la columna con el menú «Mover» de cada tarjeta (útil en el celular). Las tareas hechas se conservan; aquí se muestran las 15 más recientes.</p></Panel>
    </Shell>
  );
}

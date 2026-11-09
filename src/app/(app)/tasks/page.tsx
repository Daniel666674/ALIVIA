import Link from "next/link";
import { withTenant } from "@/db/client";
import { Badge, PageHeader, Panel } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { listClients, firmUsers } from "@/lib/clients/service";
import { listTasks } from "@/lib/clients/tasks";
import { fmtDate, todayBogota } from "@/lib/format";
import { deleteTaskAction, toggleTaskAction } from "../clients/actions";
import { TaskForm } from "../clients/forms";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("task:read");
  const raw = await searchParams;
  const mine = raw.who === "me";
  const { open, done, people, clientOptions } = await withTenant(s.user.firmId, async (tx) => ({
    open: await listTasks(tx, s.user.firmId, { status: "open", assigneeId: mine ? s.user.id : undefined }),
    done: (await listTasks(tx, s.user.firmId, { status: "done", assigneeId: mine ? s.user.id : undefined })).slice(0, 10),
    people: await firmUsers(tx, s.user.firmId),
    clientOptions: can(s, "client:read") ? (await listClients(tx, s.user.firmId, { pageSize: 100 })).rows.map((c) => ({ id: c.id, name: c.name })) : [],
  }));
  const today = todayBogota();
  const canWrite = can(s, "task:write");
  const Row = ({ t }: { t: (typeof open)[number] }) => (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      {canWrite && (
        <form action={toggleTaskAction}>
          <input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.status === "done" ? "false" : "true"} />
          <button aria-label={t.status === "done" ? "Reabrir tarea" : "Completar tarea"} className={`grid h-5 w-5 place-items-center rounded border ${t.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-brand"}`}>{t.status === "done" ? "✓" : ""}</button>
        </form>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${t.status === "done" ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
        <span className="text-xs text-slate-500">{t.clientId ? <Link href={`/clients/${t.clientId}`} className="hover:underline">{t.clientName}</Link> : "Sin cliente"} · {t.assigneeName ?? "Sin asignar"}</span>
      </span>
      {t.dueDate && <Badge tone={t.status === "open" && t.dueDate <= today ? "red" : "slate"}>{fmtDate(t.dueDate)}</Badge>}
      {canWrite && <form action={deleteTaskAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-slate-400 hover:text-red-600" aria-label="Eliminar tarea">✕</button></form>}
    </li>
  );
  return (
    <Shell session={s} active="/tasks">
      <PageHeader
        title="Tareas"
        subtitle="Asigne, ponga fecha y siga cada tarea"
        actions={
          <div className="flex gap-2 text-sm">
            <Link href="/tasks" className={`rounded-full border px-3 py-1 ${!mine ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`}>Todas</Link>
            <Link href="/tasks?who=me" className={`rounded-full border px-3 py-1 ${mine ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`}>Mis tareas</Link>
          </div>
        }
      />
      {canWrite && (
        <Panel className="mb-5"><TaskForm people={people.map((p) => ({ id: p.id, name: p.name }))} clients={clientOptions} /></Panel>
      )}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Panel title={`Abiertas (${open.length})`}>
          {open.length === 0 ? <p className="text-sm text-slate-500">No hay tareas abiertas.</p> : <ul className="divide-y divide-slate-100">{open.map((t) => <Row key={t.id} t={t} />)}</ul>}
        </Panel>
        <Panel title="Completadas recientemente">
          {done.length === 0 ? <p className="text-sm text-slate-500">Nada todavía.</p> : <ul className="divide-y divide-slate-100">{done.map((t) => <Row key={t.id} t={t} />)}</ul>}
        </Panel>
      </div>
    </Shell>
  );
}

import "server-only";
import { and, asc, eq, ne, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { clients, tasks, users } from "@/db/schema";
import { count } from "drizzle-orm";

export async function createTask(tx: Tx, p: { firmId: string; userId: string; title: string; clientId?: string | null; assigneeId?: string | null; dueDate?: string | null }) {
  if (p.clientId) {
    const [c] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, p.clientId), eq(clients.firmId, p.firmId)));
    if (!c) throw new Error("Cliente no encontrado.");
  }
  if (p.assigneeId) {
    const [u] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, p.assigneeId), eq(users.firmId, p.firmId)));
    if (!u) throw new Error("Persona no encontrada.");
  }
  const [t] = await tx
    .insert(tasks)
    .values({ firmId: p.firmId, title: p.title, clientId: p.clientId ?? null, assigneeId: p.assigneeId ?? null, dueDate: p.dueDate ?? null, createdBy: p.userId })
    .returning({ id: tasks.id });
  return t!.id;
}

export async function setTaskDone(tx: Tx, firmId: string, id: string, done: boolean) {
  await tx.update(tasks).set({ status: done ? "done" : "open", completedAt: done ? new Date() : null }).where(and(eq(tasks.id, id), eq(tasks.firmId, firmId)));
}

export type TaskStatus = "open" | "doing" | "review" | "done";
export const TASK_STATUSES: TaskStatus[] = ["open", "doing", "review", "done"];

/** Kanban move. "open" is the "Por hacer" column; anything that is not "done" counts as open work. */
export async function setTaskStatus(tx: Tx, firmId: string, id: string, status: TaskStatus) {
  await tx.update(tasks).set({ status, completedAt: status === "done" ? new Date() : null }).where(and(eq(tasks.id, id), eq(tasks.firmId, firmId)));
}

export async function deleteTask(tx: Tx, firmId: string, id: string) {
  await tx.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.firmId, firmId)));
}

export async function listTasks(tx: Tx, firmId: string, f: { status?: "open" | "done"; assigneeId?: string }) {
  const conds: SQL[] = [eq(tasks.firmId, firmId)];
  if (f.status === "done") conds.push(eq(tasks.status, "done"));
  else if (f.status === "open") conds.push(ne(tasks.status, "done"));
  if (f.assigneeId) conds.push(eq(tasks.assigneeId, f.assigneeId));
  return tx
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate, clientId: tasks.clientId, clientName: clients.name, assigneeId: tasks.assigneeId, assigneeName: users.name })
    .from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(...conds))
    .orderBy(asc(tasks.status), sql`${tasks.dueDate} ASC NULLS LAST`, asc(tasks.title))
    .limit(300);
}

export async function openTaskCount(tx: Tx, firmId: string): Promise<number> {
  const [r] = await tx.select({ n: count() }).from(tasks).where(and(eq(tasks.firmId, firmId), ne(tasks.status, "done")));
  return r?.n ?? 0;
}

/** Open tasks and assigned (not yet presented) clients per active user. */
export async function workload(tx: Tx, firmId: string) {
  const team = await tx.select({ id: users.id, name: users.name, role: users.roleId }).from(users).where(and(eq(users.firmId, firmId), eq(users.status, "active")));
  const t = await tx.select({ id: tasks.assigneeId, n: count() }).from(tasks).where(and(eq(tasks.firmId, firmId), ne(tasks.status, "done"))).groupBy(tasks.assigneeId);
  const c = await tx
    .select({ id: clients.responsibleId, n: count() })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), sql`${clients.deletedAt} IS NULL`, sql`${clients.stage} <> 'presented'`))
    .groupBy(clients.responsibleId);
  return team.map((u) => ({ id: u.id, name: u.name, tasks: t.find((x) => x.id === u.id)?.n ?? 0, clients: c.find((x) => x.id === u.id)?.n ?? 0 }));
}

import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { clientDocuments, clients, DOC_KINDS, firms, tasks, users } from "@/db/schema";
import { blindIndex, decryptField, encryptField } from "@/lib/crypto";
import { colorFor, type Color, type Stage } from "./semaforo";
import { lastDigits, type ClientKind } from "./nit";

export const docIdx = (docNumber: string) => blindIndex(docNumber, "client.doc");
const aad = (field: string, id: string) => `clients.${field}:${id}`;

export type NewClient = {
  kind: ClientKind;
  name: string;
  docNumber: string;
  docDv?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  responsibleId?: string | null;
  deadline?: string | null;
  importBatchId?: string | null;
};

export class LimitError extends Error {}

export async function clientCount(tx: Tx, firmId: string): Promise<number> {
  const [r] = await tx.select({ n: count() }).from(clients).where(and(eq(clients.firmId, firmId), isNull(clients.deletedAt)));
  return r?.n ?? 0;
}

export async function assertCapacity(tx: Tx, firmId: string, adding: number) {
  const [f] = await tx.select({ limit: firms.clientLimit }).from(firms).where(eq(firms.id, firmId));
  const current = await clientCount(tx, firmId);
  const limit = f?.limit ?? 0;
  if (current + adding > limit) {
    throw new LimitError(`Este plan permite hasta ${limit} clientes (hoy hay ${current}). Para agregar más, amplíe el plan.`);
  }
}

/** Insert many clients (+ their 4 empty document slots) in one go. Caller handles capacity and dedupe. */
export async function insertClients(tx: Tx, firmId: string, list: NewClient[]): Promise<string[]> {
  if (list.length === 0) return [];
  const ids = list.map(() => randomUUID());
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    await tx.insert(clients).values(
      chunk.map((c, j) => {
        const id = ids[i + j]!;
        return {
          id,
          firmId,
          kind: c.kind,
          name: c.name,
          docNumberEnc: encryptField(c.docNumber, aad("doc", id)),
          docIdx: docIdx(c.docNumber),
          docHint: lastDigits(c.docNumber),
          docDv: c.docDv ?? null,
          emailEnc: c.email ? encryptField(c.email, aad("email", id)) : null,
          phoneEnc: c.phone ? encryptField(c.phone, aad("phone", id)) : null,
          city: c.city ?? null,
          responsibleId: c.responsibleId ?? null,
          deadline: c.deadline ?? null,
          importBatchId: c.importBatchId ?? null,
        };
      }),
    );
    await tx.insert(clientDocuments).values(
      chunk.flatMap((_, j) => DOC_KINDS.map((kind) => ({ firmId, clientId: ids[i + j]!, kind }))),
    );
  }
  return ids;
}

export async function createClient(tx: Tx, firmId: string, c: NewClient): Promise<{ id: string } | { error: string }> {
  const exists = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.docIdx, docIdx(c.docNumber)), isNull(clients.deletedAt)))
    .limit(1);
  if (exists[0]) return { error: "Ya existe un cliente con esa cédula o NIT." };
  await assertCapacity(tx, firmId, 1);
  const [id] = await insertClients(tx, firmId, [c]);
  return { id: id! };
}

// ---- reading -------------------------------------------------------------------------------

const docsReceivedSql = sql<number>`(SELECT count(*)::int FROM client_documents d WHERE d.client_id = ${clients.id} AND d.status <> 'pending')`;

export type ListFilter = {
  tab?: "all" | "natural" | "empresa" | "red" | "mine";
  q?: string;
  page?: number;
  pageSize?: number;
  userId?: string;
};

export type ClientRow = {
  id: string;
  name: string;
  kind: ClientKind;
  docHint: string;
  city: string | null;
  stage: Stage;
  deadline: string | null;
  docsReceived: number;
  color: Color;
  responsibleName: string | null;
};

export async function listClients(tx: Tx, firmId: string, f: ListFilter): Promise<{ rows: ClientRow[]; total: number }> {
  const conds: SQL[] = [eq(clients.firmId, firmId), isNull(clients.deletedAt)];
  if (f.tab === "natural" || f.tab === "empresa") conds.push(eq(clients.kind, f.tab));
  if (f.tab === "mine" && f.userId) conds.push(eq(clients.responsibleId, f.userId));
  if (f.tab === "red") conds.push(sql`${clients.stage} = 'pending' AND ${docsReceivedSql} = 0`);
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const byName = ilike(clients.name, `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    conds.push(digits.length >= 5 ? or(byName, eq(clients.docIdx, docIdx(digits)))! : byName);
  }
  const where = and(...conds);
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(clients).where(where);
  const rows = await tx
    .select({
      id: clients.id,
      name: clients.name,
      kind: clients.kind,
      docHint: clients.docHint,
      city: clients.city,
      stage: clients.stage,
      deadline: clients.deadline,
      docsReceived: docsReceivedSql,
      responsibleName: users.name,
    })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.responsibleId))
    .where(where)
    .orderBy(sql`${clients.deadline} ASC NULLS LAST`, asc(clients.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: n,
    rows: rows.map((r) => ({ ...r, color: colorFor(r.stage, r.docsReceived) })),
  };
}

export async function getClient(tx: Tx, firmId: string, id: string) {
  const [c] = await tx
    .select({ c: clients, responsibleName: users.name })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.responsibleId))
    .where(and(eq(clients.id, id), eq(clients.firmId, firmId), isNull(clients.deletedAt)));
  if (!c) return null;
  const docs = await tx.select().from(clientDocuments).where(eq(clientDocuments.clientId, id));
  const order = new Map(DOC_KINDS.map((k, i) => [k, i]));
  docs.sort((a, b) => order.get(a.kind)! - order.get(b.kind)!);
  const taskRows = await tx
    .select({ t: tasks, assigneeName: users.name })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(eq(tasks.clientId, id))
    .orderBy(asc(tasks.status), sql`${tasks.dueDate} ASC NULLS LAST`);
  const received = docs.filter((d) => d.status !== "pending").length;
  return {
    id: c.c.id,
    name: c.c.name,
    kind: c.c.kind,
    city: c.c.city,
    stage: c.c.stage as Stage,
    deadline: c.c.deadline,
    docDv: c.c.docDv,
    docNumber: decryptField(c.c.docNumberEnc, aad("doc", c.c.id)),
    email: c.c.emailEnc ? decryptField(c.c.emailEnc, aad("email", c.c.id)) : null,
    phone: c.c.phoneEnc ? decryptField(c.c.phoneEnc, aad("phone", c.c.id)) : null,
    responsibleId: c.c.responsibleId,
    responsibleName: c.responsibleName,
    docs,
    docsReceived: received,
    color: colorFor(c.c.stage as Stage, received),
    tasks: taskRows.map((r) => ({ ...r.t, assigneeName: r.assigneeName })),
  };
}

// ---- writing -------------------------------------------------------------------------------

export type ClientEdit = { name: string; email: string | null; phone: string | null; city: string | null; responsibleId: string | null; deadline: string | null };

export async function updateClient(tx: Tx, firmId: string, id: string, e: ClientEdit) {
  await tx
    .update(clients)
    .set({
      name: e.name,
      emailEnc: e.email ? encryptField(e.email, aad("email", id)) : null,
      phoneEnc: e.phone ? encryptField(e.phone, aad("phone", id)) : null,
      city: e.city,
      responsibleId: e.responsibleId,
      deadline: e.deadline,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, id), eq(clients.firmId, firmId)));
}

export async function setStage(tx: Tx, firmId: string, id: string, stage: Stage) {
  await tx.update(clients).set({ stage, updatedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.firmId, firmId)));
}

export async function softDeleteClient(tx: Tx, firmId: string, id: string) {
  await tx.update(clients).set({ deletedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.firmId, firmId)));
}

// ---- dashboard -----------------------------------------------------------------------------

export async function dashboardStats(tx: Tx, firmId: string) {
  const rows = await tx
    .select({ kind: clients.kind, stage: clients.stage, received: docsReceivedSql })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), isNull(clients.deletedAt)));
  const colors: Record<Color, number> = { red: 0, yellow: 0, blue: 0, green: 0 };
  let natural = 0;
  let pendingDocs = 0;
  let presented = 0;
  for (const r of rows) {
    if (r.kind === "natural") natural++;
    colors[colorFor(r.stage as Stage, r.received)]++;
    if (r.stage === "presented") presented++;
    else pendingDocs += 4 - r.received;
  }
  return { total: rows.length, natural, empresas: rows.length - natural, colors, pendingDocs, presented };
}

export async function upcomingDeadlines(tx: Tx, firmId: string, limit = 6) {
  return tx
    .select({ id: clients.id, name: clients.name, deadline: clients.deadline, stage: clients.stage, received: docsReceivedSql })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), isNull(clients.deletedAt), sql`${clients.deadline} IS NOT NULL`, sql`${clients.stage} <> 'presented'`))
    .orderBy(asc(clients.deadline))
    .limit(limit);
}

export async function boardData(tx: Tx, firmId: string, responsibleId?: string) {
  const conds = [eq(clients.firmId, firmId), isNull(clients.deletedAt)];
  if (responsibleId) conds.push(eq(clients.responsibleId, responsibleId));
  const rows = await tx
    .select({ id: clients.id, name: clients.name, stage: clients.stage, deadline: clients.deadline, received: docsReceivedSql, responsibleName: users.name })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.responsibleId))
    .where(and(...conds))
    .orderBy(sql`${clients.deadline} ASC NULLS LAST`, desc(clients.updatedAt))
    .limit(1500);
  return rows.map((r) => ({ ...r, color: colorFor(r.stage as Stage, r.received) }));
}

export async function firmUsers(tx: Tx, firmId: string) {
  return tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.firmId, firmId), eq(users.status, "active"))).orderBy(asc(users.name));
}


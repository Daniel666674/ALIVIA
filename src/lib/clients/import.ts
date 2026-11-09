import "server-only";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { clients, importBatches } from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import { MAX_IMPORT_BYTES, parseSpreadsheet, suggestMapping, validateRows, type Mapping, type RowResult } from "./csv";
import { assertCapacity, docIdx, firmUsers, insertClients } from "./service";

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const aad = (id: string) => `import_batches.payload:${id}`;

type Draft = { ignored?: string[]; headers: string[]; rows: Record<string, string>[]; mapping: Mapping; delimiter: string; encoding: string };

export async function createDraft(tx: Tx, p: { firmId: string; userId: string; filename: string; bytes: Buffer }) {
  if (p.bytes.length > MAX_IMPORT_BYTES) throw new Error("El archivo supera 4 MB.");
  await tx.delete(importBatches).where(and(eq(importBatches.status, "draft"), lt(importBatches.expiresAt, new Date())));
  const parsed = await parseSpreadsheet(p.bytes);
  const mapping = suggestMapping(parsed.headers);
  const [b] = await tx
    .insert(importBatches)
    .values({ firmId: p.firmId, userId: p.userId, filename: p.filename.slice(0, 200), totalRows: parsed.rows.length, expiresAt: new Date(Date.now() + DRAFT_TTL_MS) })
    .returning({ id: importBatches.id });
  const id = b!.id;
  const draft: Draft = { ...parsed, mapping };
  await tx.update(importBatches).set({ payloadEnc: encryptField(JSON.stringify(draft), aad(id)) }).where(eq(importBatches.id, id));
  return { batchId: id, headers: parsed.headers, mapping, totalRows: parsed.rows.length, encoding: parsed.encoding };
}

export async function loadDraft(tx: Tx, firmId: string, userId: string, batchId: string): Promise<(Draft & { filename: string }) | null> {
  const [b] = await tx
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.firmId, firmId), eq(importBatches.userId, userId), eq(importBatches.status, "draft")));
  if (!b?.payloadEnc || b.expiresAt < new Date()) return null;
  return { ...(JSON.parse(decryptField(b.payloadEnc, aad(batchId))) as Draft), filename: b.filename };
}

export async function saveMapping(tx: Tx, firmId: string, userId: string, batchId: string, mapping: Mapping): Promise<boolean> {
  const draft = await loadDraft(tx, firmId, userId, batchId);
  if (!draft) return false;
  const clean: Mapping = {};
  for (const [k, v] of Object.entries(mapping)) if (v && draft.headers.includes(v)) clean[k as keyof Mapping] = v;
  draft.mapping = clean;
  await tx
    .update(importBatches)
    .set({ payloadEnc: encryptField(JSON.stringify({ headers: draft.headers, rows: draft.rows, mapping: clean, delimiter: draft.delimiter, encoding: draft.encoding }), aad(batchId)) })
    .where(eq(importBatches.id, batchId));
  return true;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export type Preview = {
  total: number;
  ready: number;
  warnings: number;
  errors: number;
  existing: number;
  overLimit: boolean;
  rows: (RowResult & { existing?: boolean; responsibleFound?: boolean })[];
  hasName: boolean;
  hasDoc: boolean;
  ignored: string[];
};

export async function previewImport(tx: Tx, firmId: string, userId: string, batchId: string): Promise<Preview | null> {
  const draft = await loadDraft(tx, firmId, userId, batchId);
  if (!draft) return null;
  const results = validateRows(draft.rows, draft.mapping);
  const valid = results.filter((r) => r.data);
  const idxByLine = new Map(valid.filter((r) => r.data!.docNumber).map((r) => [r.line, docIdx(r.data!.docNumber!)]));
  const found = new Set<string>();
  const idxs = [...idxByLine.values()];
  for (let i = 0; i < idxs.length; i += 500) {
    const rows = await tx
      .select({ i: clients.docIdx })
      .from(clients)
      .where(and(eq(clients.firmId, firmId), isNull(clients.deletedAt), inArray(clients.docIdx, idxs.slice(i, i + 500))));
    rows.forEach((r) => r.i && found.add(r.i));
  }
  // Clients without a full id are matched by name + last digits.
  const keyOf = (name: string, tail: string) => `${norm(name)}|${tail}`;
  const noDocExisting = new Set<string>();
  if (valid.some((r) => !r.data!.docNumber)) {
    const rows = await tx.select({ n: clients.name, h: clients.docHint }).from(clients).where(and(eq(clients.firmId, firmId), isNull(clients.deletedAt), isNull(clients.docIdx)));
    rows.forEach((r) => noDocExisting.add(keyOf(r.n, r.h)));
  }
  const team = await firmUsers(tx, firmId);
  const resolve = (raw: string | null) => {
    if (!raw) return undefined;
    const n = norm(raw);
    const hits = team.filter((u) => norm(u.name) === n || norm(u.email) === n || norm(u.name).split(" ")[0] === n);
    return hits.length === 1 ? hits[0]!.id : null;
  };
  type PRow = RowResult & { existing?: boolean; responsibleFound?: boolean };
  const rows: PRow[] = results.map((r): PRow => {
    if (!r.data) return r;
    const existing = r.data.docNumber ? found.has(idxByLine.get(r.line)!) : noDocExisting.has(keyOf(r.data.name, r.data.docTail ?? ""));
    const resp = resolve(r.data.responsible);
    const messages = [...r.messages];
    let status = r.status;
    if (existing) messages.push("Ya existe en el sistema: se omitirá.");
    if (resp === null) {
      messages.push(`No se encontró al responsable “${r.data.responsible}”; quedará sin asignar.`);
      if (status === "ok") status = "warning";
    }
    return { ...r, status, messages, existing, responsibleFound: resp !== null && resp !== undefined };
  });
  const toCreate = rows.filter((r) => r.data && !r.existing).length;
  const [f] = await tx.query.firms.findMany({ where: (t, { eq: e }) => e(t.id, firmId), limit: 1 });
  const current = (await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.firmId, firmId), isNull(clients.deletedAt)))).length;
  return {
    total: rows.length,
    ready: toCreate,
    warnings: rows.filter((r) => r.status === "warning" && !r.existing).length,
    errors: rows.filter((r) => r.status === "error").length,
    existing: rows.filter((r) => r.existing).length,
    overLimit: current + toCreate > (f?.clientLimit ?? 0),
    rows,
    hasName: !!draft.mapping.name,
    hasDoc: !!draft.mapping.doc || !!draft.mapping.docTail,
    ignored: draft.ignored ?? [],
  };
}

export async function applyImport(tx: Tx, p: { firmId: string; userId: string; batchId: string }) {
  const draft = await loadDraft(tx, p.firmId, p.userId, p.batchId);
  if (!draft) throw new Error("La importación venció. Suba el archivo de nuevo.");
  const preview = await previewImport(tx, p.firmId, p.userId, p.batchId);
  if (!preview) throw new Error("La importación venció. Suba el archivo de nuevo.");
  if (!preview.hasName || !preview.hasDoc) throw new Error("Falta indicar la columna del nombre y la de la cédula o NIT.");
  const team = await firmUsers(tx, p.firmId);
  const resolveId = (raw: string | null) => {
    if (!raw) return null;
    const n = norm(raw);
    const hits = team.filter((u) => norm(u.name) === n || norm(u.email) === n || norm(u.name).split(" ")[0] === n);
    return hits.length === 1 ? hits[0]!.id : null;
  };
  const toCreate = preview.rows.filter((r) => r.data && !r.existing);
  await assertCapacity(tx, p.firmId, toCreate.length);
  await insertClients(
    tx,
    p.firmId,
    toCreate.map((r) => ({
      kind: r.data!.kind,
      name: r.data!.name,
      docNumber: r.data!.docNumber,
      docTail: r.data!.docTail,
      docDv: r.data!.docDv,
      email: r.data!.email,
      phone: r.data!.phone,
      city: r.data!.city,
      deadline: r.data!.deadline,
      feeCop: r.data!.fee,
      responsibleId: resolveId(r.data!.responsible),
      importBatchId: p.batchId,
    })),
  );
  await tx
    .update(importBatches)
    .set({ status: "applied", created: toCreate.length, skipped: preview.existing, failed: preview.errors, payloadEnc: null, appliedAt: new Date() })
    .where(eq(importBatches.id, p.batchId));
  return { created: toCreate.length, skipped: preview.existing, failed: preview.errors };
}

/** Undo: removes the clients this import created (and their documents). Existing clients were never touched. */
export async function rollbackImport(tx: Tx, firmId: string, batchId: string): Promise<number> {
  const removed = await tx.delete(clients).where(and(eq(clients.firmId, firmId), eq(clients.importBatchId, batchId))).returning({ id: clients.id });
  await tx.update(importBatches).set({ status: "rolled_back", rolledBackAt: new Date() }).where(and(eq(importBatches.id, batchId), eq(importBatches.firmId, firmId)));
  return removed.length;
}

export async function recentBatches(tx: Tx, firmId: string) {
  return tx.query.importBatches.findMany({ where: (t, { eq: e, and: a, ne }) => a(e(t.firmId, firmId), ne(t.status, "draft")), orderBy: (t, { desc }) => desc(t.createdAt), limit: 5 });
}

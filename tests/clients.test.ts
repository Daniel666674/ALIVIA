import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { clientDocuments, clients, firms, importBatches } from "@/db/schema";
import { applyImport, createDraft, previewImport, rollbackImport, saveMapping } from "@/lib/clients/import";
import { LimitError, createClient, dashboardStats, getClient, listClients, setStage, softDeleteClient } from "@/lib/clients/service";
import { createTestDb, seedFirm } from "./helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let a: Awaited<ReturnType<typeof seedFirm>>;
let b: Awaited<ReturnType<typeof seedFirm>>;

beforeAll(async () => {
  t = await createTestDb();
  a = await seedFirm(t.admin, "Firma A", [{ email: "jenny@a.test", role: "owner" }, { email: "monica@a.test", role: "accountant" }]);
  b = await seedFirm(t.admin, "Firma B", [{ email: "x@b.test", role: "owner" }]);
});
afterAll(() => t.close());

const A = () => a.firm.id;
const CSV = (rows: string[]) => Buffer.from(["Razón Social;NIT/CC;Ciudad;Correo;Responsable", ...rows].join("\n"), "utf-8");

describe("clients", () => {
  let id = "";
  it("creates a client with 4 document slots; PII is encrypted at rest", async () => {
    const r = await t.tenant(A(), (tx) =>
      createClient(tx, A(), { kind: "natural", name: "Carlos Ruiz Mejía", docNumber: "79123456", email: "carlos@x.co", phone: "3105554242", city: "Bogotá" }),
    );
    expect("id" in r).toBe(true);
    id = (r as { id: string }).id;
    const [row] = await t.admin.select().from(clients).where(eq(clients.id, id));
    expect(row!.docNumberEnc).not.toContain("79123456");
    expect(row!.emailEnc).not.toContain("carlos");
    expect(row!.docHint).toBe("456");
    expect((await t.admin.select().from(clientDocuments).where(eq(clientDocuments.clientId, id))).length).toBe(4);
    const full = await t.tenant(A(), (tx) => getClient(tx, A(), id));
    expect(full).toMatchObject({ docNumber: "79123456", email: "carlos@x.co", color: "red", docsReceived: 0 });
  });
  it("rejects duplicate documents (blind index), also with different formatting upstream", async () => {
    const r = await t.tenant(A(), (tx) => createClient(tx, A(), { kind: "natural", name: "Otro", docNumber: "79123456" }));
    expect(r).toEqual({ error: "Ya existe un cliente con esa cédula o NIT." });
  });
  it("searches by name and by full document number", async () => {
    const byName = await t.tenant(A(), (tx) => listClients(tx, A(), { q: "ruiz" }));
    expect(byName.total).toBe(1);
    const byDoc = await t.tenant(A(), (tx) => listClients(tx, A(), { q: "79.123.456" }));
    expect(byDoc.rows[0]!.id).toBe(id);
    expect((await t.tenant(A(), (tx) => listClients(tx, A(), { q: "zzz%" }))).total).toBe(0);
  });
  it("changes color with documents and stage", async () => {
    await t.admin.update(clientDocuments).set({ status: "received" }).where(eq(clientDocuments.clientId, id));
    expect((await t.tenant(A(), (tx) => getClient(tx, A(), id)))!.color).toBe("blue");
    await t.tenant(A(), (tx) => setStage(tx, A(), id, "presented"));
    expect((await t.tenant(A(), (tx) => getClient(tx, A(), id)))!.color).toBe("green");
    const s = await t.tenant(A(), (tx) => dashboardStats(tx, A()));
    expect(s).toMatchObject({ total: 1, presented: 1, natural: 1 });
  });
  it("soft-deleted clients disappear and free their document number", async () => {
    await t.tenant(A(), (tx) => softDeleteClient(tx, A(), id));
    expect((await t.tenant(A(), (tx) => listClients(tx, A(), {}))).total).toBe(0);
    const r = await t.tenant(A(), (tx) => createClient(tx, A(), { kind: "natural", name: "Carlos de nuevo", docNumber: "79123456" }));
    expect("id" in r).toBe(true);
  });
  it("another firm cannot see or fetch these clients (RLS)", async () => {
    const B = b.firm.id;
    expect((await t.tenant(B, (tx) => listClients(tx, B, {}))).total).toBe(0);
    expect(await t.tenant(B, (tx) => getClient(tx, B, id))).toBeNull();
    expect(await t.tenant(B, (tx) => tx.select().from(clients))).toHaveLength(0);
    expect(await t.tenant(B, (tx) => tx.select().from(clientDocuments))).toHaveLength(0);
  });
  it("enforces the plan limit", async () => {
    await t.admin.update(firms).set({ clientLimit: 1 }).where(eq(firms.id, A()));
    await expect(t.tenant(A(), (tx) => createClient(tx, A(), { kind: "natural", name: "Sobra", docNumber: "10000001" }))).rejects.toThrow(LimitError);
    await t.admin.update(firms).set({ clientLimit: 600 }).where(eq(firms.id, A()));
  });
});

describe("csv import end to end", () => {
  let batchId = "";
  const user = () => a.users[0]!.id;
  it("creates a draft, previews with warnings/errors, applies, skips existing", async () => {
    const bytes = CSV([
      "Ferretería Vargas SAS;900.123.456-8;bogota;vargas@x.co;Jenny",
      "María Gómez;52123456;Medellín;maria@x.co;Mónica",
      "Sin Cédula;;Cali;;",
      "Carlos de nuevo;79123456;Bogotá;;",
      "Repetida;52.123.456;Cali;;",
      "Responsable raro;80123456;Cali;;Nadie",
    ]);
    const d = await t.tenant(A(), (tx) => createDraft(tx, { firmId: A(), userId: user(), filename: "clientes.csv", bytes }));
    batchId = d.batchId;
    expect(d.mapping).toMatchObject({ name: "Razón Social", doc: "NIT/CC", city: "Ciudad", email: "Correo", responsible: "Responsable" });
    const [row] = await t.admin.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(row!.payloadEnc).not.toContain("Vargas"); // payload is encrypted

    const p = (await t.tenant(A(), (tx) => previewImport(tx, A(), user(), batchId)))!;
    expect(p.total).toBe(6);
    expect(p.errors).toBe(2); // missing doc, in-file duplicate
    expect(p.existing).toBe(1); // 79123456 already exists
    expect(p.ready).toBe(3);
    expect(p.rows.find((r) => r.line === 7)!.messages.join(" ")).toMatch(/responsable/i);

    const r = await t.tenant(A(), (tx) => applyImport(tx, { firmId: A(), userId: user(), batchId }));
    expect(r).toEqual({ created: 3, skipped: 1, failed: 2 });
    const [after] = await t.admin.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(after).toMatchObject({ status: "applied", payloadEnc: null });
    const list = await t.tenant(A(), (tx) => listClients(tx, A(), {}));
    expect(list.total).toBe(4);
    const vargas = list.rows.find((x) => x.name.startsWith("Ferretería"))!;
    expect(vargas).toMatchObject({ kind: "empresa", city: "Bogotá", responsibleName: "jenny" });
  });
  it("a draft cannot be used by another user or another firm", async () => {
    const d = await t.tenant(A(), (tx) => createDraft(tx, { firmId: A(), userId: user(), filename: "x.csv", bytes: CSV(["Z;11111111;;;"]) }));
    expect(await t.tenant(A(), (tx) => previewImport(tx, A(), a.users[1]!.id, d.batchId))).toBeNull();
    const B = b.firm.id;
    expect(await t.tenant(B, (tx) => previewImport(tx, B, b.users[0]!.id, d.batchId))).toBeNull();
  });
  it("mapping can be corrected before applying; applying without name/doc is refused", async () => {
    const bytes = Buffer.from("col1;col2\nZeta Cliente;90000001\n");
    const d = await t.tenant(A(), (tx) => createDraft(tx, { firmId: A(), userId: user(), filename: "raro.csv", bytes }));
    await expect(t.tenant(A(), (tx) => applyImport(tx, { firmId: A(), userId: user(), batchId: d.batchId }))).rejects.toThrow(/columna/);
    await t.tenant(A(), (tx) => saveMapping(tx, A(), user(), d.batchId, { name: "col1", doc: "col2" }));
    const r = await t.tenant(A(), (tx) => applyImport(tx, { firmId: A(), userId: user(), batchId: d.batchId }));
    expect(r.created).toBe(1);
  });
  it("rollback removes only what the import created", async () => {
    const before = (await t.tenant(A(), (tx) => listClients(tx, A(), {}))).total;
    const n = await t.tenant(A(), (tx) => rollbackImport(tx, A(), batchId));
    expect(n).toBe(3);
    const after = (await t.tenant(A(), (tx) => listClients(tx, A(), {}))).total;
    expect(after).toBe(before - 3);
    const [b1] = await t.admin.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(b1!.status).toBe("rolled_back");
  });
  it("refuses an import that would exceed the plan limit", async () => {
    await t.admin.update(firms).set({ clientLimit: 2 }).where(eq(firms.id, A()));
    const d = await t.tenant(A(), (tx) => createDraft(tx, { firmId: A(), userId: user(), filename: "g.csv", bytes: CSV(["U1;20000001;;;", "U2;20000002;;;", "U3;20000003;;;"]) }));
    expect((await t.tenant(A(), (tx) => previewImport(tx, A(), user(), d.batchId)))!.overLimit).toBe(true);
    await expect(t.tenant(A(), (tx) => applyImport(tx, { firmId: A(), userId: user(), batchId: d.batchId }))).rejects.toThrow(/plan permite/);
    await t.admin.update(firms).set({ clientLimit: 600 }).where(eq(firms.id, A()));
  });
});

import { MAX_FILE_BYTES, UploadError, filesForClient, readFile, safeFilename, setDocumentStatus, sniffMime, uploadDocument } from "@/lib/clients/documents";
import { createTask, listTasks, setTaskDone } from "@/lib/clients/tasks";
import { documentFiles } from "@/db/schema";

describe("documents", () => {
  const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("contenido secreto del cliente")]);
  let cid = "";
  beforeAll(async () => {
    const r = await t.tenant(A(), (tx) => createClient(tx, A(), { kind: "natural", name: "Doc Test", docNumber: "30000001" }));
    cid = (r as { id: string }).id;
  });
  it("sniffs real types and sanitizes names", () => {
    expect(sniffMime(PDF)?.ext).toBe("pdf");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffMime(Buffer.from("MZ\x90\x00 executable"))).toBeNull();
    const evil = safeFilename("../../etc/pass<wd>.exe", "pdf");
    expect(evil).not.toMatch(/[\\/<>]|\.\./);
    expect(evil.endsWith(".pdf")).toBe(true);
    expect(safeFilename("Cédula frente.jpg", "jpg")).toBe("Cédula frente.jpg");
  });
  it("stores the file encrypted, marks the document received, and reads it back", async () => {
    const { fileId } = await t.tenant(A(), (tx) => uploadDocument(tx, { firmId: A(), userId: a.users[0]!.id, clientId: cid, kind: "rut", filename: "rut 2026.pdf", bytes: PDF }));
    const [row] = await t.admin.select().from(documentFiles).where(eq(documentFiles.id, fileId));
    expect(row!.dataEnc.includes(Buffer.from("secreto"))).toBe(false);
    const c = await t.tenant(A(), (tx) => getClient(tx, A(), cid));
    expect(c!.docs.find((d) => d.kind === "rut")!.status).toBe("received");
    const files = await t.tenant(A(), (tx) => filesForClient(tx, A(), c!.docs.map((d) => d.id)));
    expect(files).toHaveLength(1);
    const back = await t.tenant(A(), (tx) => readFile(tx, A(), fileId));
    expect(back!.bytes.equals(PDF)).toBe(true);
  });
  it("another firm cannot read the file", async () => {
    const [f] = await t.admin.select().from(documentFiles);
    const B = b.firm.id;
    expect(await t.tenant(B, (tx) => readFile(tx, B, f!.id))).toBeNull();
  });
  it("rejects wrong types, empty, oversize, and the DIAN key as a file", async () => {
    const up = (kind: "rut" | "dian_key", bytes: Buffer) => t.tenant(A(), (tx) => uploadDocument(tx, { firmId: A(), userId: a.users[0]!.id, clientId: cid, kind, filename: "x", bytes }));
    await expect(up("rut", Buffer.from("MZ not a pdf"))).rejects.toThrow(UploadError);
    await expect(up("rut", Buffer.alloc(0))).rejects.toThrow(UploadError);
    await expect(up("rut", Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX_FILE_BYTES)]))).rejects.toThrow(/4 MB/);
    await expect(up("dian_key", PDF)).rejects.toThrow(/clave DIAN/);
  });
  it("status can be set manually (e.g. DIAN key received) and reviewed", async () => {
    await t.tenant(A(), (tx) => setDocumentStatus(tx, { firmId: A(), userId: a.users[0]!.id, clientId: cid, kind: "dian_key", status: "received" }));
    await t.tenant(A(), (tx) => setDocumentStatus(tx, { firmId: A(), userId: a.users[0]!.id, clientId: cid, kind: "rut", status: "reviewed" }));
    const c = await t.tenant(A(), (tx) => getClient(tx, A(), cid));
    expect(c!.docsReceived).toBe(2);
    expect(c!.docs.find((d) => d.kind === "rut")!.reviewedBy).toBe(a.users[0]!.id);
  });
});

describe("tasks", () => {
  it("creates, lists, completes; rejects foreign clients/assignees", async () => {
    const [c] = (await t.tenant(A(), (tx) => listClients(tx, A(), { q: "Doc Test" }))).rows;
    const id = await t.tenant(A(), (tx) => createTask(tx, { firmId: A(), userId: a.users[0]!.id, title: "Pedir certificación", clientId: c!.id, assigneeId: a.users[1]!.id, dueDate: "2026-10-12" }));
    const open = await t.tenant(A(), (tx) => listTasks(tx, A(), { status: "open", assigneeId: a.users[1]!.id }));
    expect(open.map((x) => x.title)).toEqual(["Pedir certificación"]);
    expect(open[0]!.clientName).toBe("Doc Test");
    await t.tenant(A(), (tx) => setTaskDone(tx, A(), id, true));
    expect(await t.tenant(A(), (tx) => listTasks(tx, A(), { status: "open" }))).toHaveLength(0);
    await expect(t.tenant(A(), (tx) => createTask(tx, { firmId: A(), userId: a.users[0]!.id, title: "x", assigneeId: b.users[0]!.id }))).rejects.toThrow();
  });
});

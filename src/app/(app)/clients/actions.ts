"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@/db/client";
import { DOC_KINDS } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requestInfo } from "@/lib/auth/context";
import { requirePermission } from "@/lib/auth/session";
import { limitOrMessage, type FormState } from "@/lib/auth/actions-shared";
import { MAX_FILE_BYTES, UploadError, deleteFile, setDocumentStatus, uploadDocument } from "@/lib/clients/documents";
import { parseDoc } from "@/lib/clients/nit";
import { LimitError, createClient, markClient, setStage, softDeleteClient, updateClient } from "@/lib/clients/service";
import { addNote, deleteNote } from "@/lib/clients/notes";
import { TASK_STATUSES, createTask, deleteTask, setTaskDone, setTaskStatus } from "@/lib/clients/tasks";

const optional = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const Id = z.string().uuid();
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)), "Fecha no válida");

const ClientForm = z.object({
  kind: z.enum(["natural", "empresa"]),
  name: z.string().trim().min(2, "Escriba el nombre.").max(200),
  doc: z.string().trim().min(1, "Escriba la cédula o el NIT."),
  email: optional(254).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Correo no válido."),
  phone: optional(30),
  city: optional(80),
  responsibleId: optional(40).refine((v) => v === null || Id.safeParse(v).success, "Responsable no válido."),
  deadline: optional(10).refine((v) => v === null || IsoDate.safeParse(v).success, "Fecha no válida."),
  fee: optional(20).transform((v) => (v === null ? null : Number(v.replace(/[^\d]/g, "")) || null)),
});

function firstError(e: z.ZodError) {
  return e.issues[0]?.message ?? "Revise los campos.";
}

export async function createClientAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requirePermission("client:write");
  const parsed = ClientForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  const doc = parseDoc(d.doc);
  if (!doc) return { error: "La cédula o el NIT no es válido (use solo números)." };
  const req = await requestInfo();
  const denied = await limitOrMessage("general", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };
  let result: { id: string } | { error: string };
  try {
    result = await withTenant(s.user.firmId, async (tx) => {
      const r = await createClient(tx, s.user.firmId, { kind: d.kind, name: d.name, docNumber: doc.number, docDv: doc.dv, email: d.email, phone: d.phone, city: d.city, responsibleId: d.responsibleId, deadline: d.deadline, feeCop: d.fee });
      if ("id" in r) await audit(tx, { action: "client.created", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: r.id, req });
      return r;
    });
  } catch (e) {
    if (e instanceof LimitError) return { error: e.message };
    throw e;
  }
  if ("error" in result) return { error: result.error };
  redirect(`/clients/${result.id}`);
}

const EditForm = ClientForm.omit({ kind: true, doc: true }).extend({ id: Id, doc: z.string().trim().max(40).optional() });

export async function updateClientAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requirePermission("client:write");
  const parsed = EditForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, fee, doc: docRaw, ...rest } = parsed.data;
  const doc = docRaw ? parseDoc(docRaw) : null;
  if (docRaw && !doc) return { error: "La cédula o el NIT no es válido (use solo números)." };
  const req = await requestInfo();
  const err = await withTenant(s.user.firmId, async (tx) => {
    const r = await updateClient(tx, s.user.firmId, id, { ...rest, feeCop: fee, doc: doc ? { number: doc.number, dv: doc.dv } : null });
    if (r) return r;
    await audit(tx, { action: "client.updated", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: id, req });
    return undefined;
  });
  if (err) return err;
  revalidatePath(`/clients/${id}`);
  return undefined;
}

const StageForm = z.object({ id: Id, stage: z.enum(["pending", "in_preparation", "in_review", "presented"]) });

export async function setStageAction(form: FormData) {
  const s = await requirePermission("client:write");
  const p = StageForm.parse(Object.fromEntries(form));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await setStage(tx, s.user.firmId, p.id, p.stage);
    await audit(tx, { action: "client.stage", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: p.id, req, meta: { stage: p.stage } });
  });
  revalidatePath(`/clients/${p.id}`);
}

export async function deleteClientAction(form: FormData) {
  const s = await requirePermission("client:write");
  const id = Id.parse(form.get("id"));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await softDeleteClient(tx, s.user.firmId, id);
    await audit(tx, { action: "client.deleted", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: id, req });
  });
  redirect("/clients");
}

export async function uploadDocumentAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requirePermission("document:write");
  const clientId = Id.safeParse(form.get("clientId"));
  const kind = z.enum(DOC_KINDS).safeParse(form.get("kind"));
  const file = form.get("file");
  if (!clientId.success || !kind.success) return { error: "Solicitud no válida." };
  if (!(file instanceof File) || file.size === 0) return { error: "Elija un archivo." };
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo supera 4 MB." };
  const req = await requestInfo();
  const denied = await limitOrMessage("documentUpload", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await withTenant(s.user.firmId, async (tx) => {
      const { fileId } = await uploadDocument(tx, { firmId: s.user.firmId, userId: s.user.id, clientId: clientId.data, kind: kind.data, filename: file.name, bytes });
      await audit(tx, { action: "document.uploaded", firmId: s.user.firmId, userId: s.user.id, resourceType: "document", resourceId: fileId, req, meta: { kind: kind.data, size: bytes.length } });
    });
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/clients/${clientId.data}`);
  return undefined;
}

const StatusForm = z.object({ clientId: Id, kind: z.enum(DOC_KINDS), status: z.enum(["pending", "received", "reviewed"]) });

export async function setDocStatusAction(form: FormData) {
  const s = await requirePermission("document:write");
  const p = StatusForm.parse(Object.fromEntries(form));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await setDocumentStatus(tx, { firmId: s.user.firmId, userId: s.user.id, ...p });
    await audit(tx, { action: "document.status", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: p.clientId, req, meta: { kind: p.kind, status: p.status } });
  });
  revalidatePath(`/clients/${p.clientId}`);
}

export async function deleteFileAction(form: FormData) {
  const s = await requirePermission("document:write");
  const p = z.object({ fileId: Id, clientId: Id }).parse(Object.fromEntries(form));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await deleteFile(tx, s.user.firmId, p.fileId);
    await audit(tx, { action: "document.deleted", firmId: s.user.firmId, userId: s.user.id, resourceType: "document", resourceId: p.fileId, req });
  });
  revalidatePath(`/clients/${p.clientId}`);
}

const TaskForm = z.object({
  title: z.string().trim().min(2, "Escriba la tarea.").max(200),
  clientId: optional(40).refine((v) => v === null || Id.safeParse(v).success, "Cliente no válido."),
  assigneeId: optional(40).refine((v) => v === null || Id.safeParse(v).success, "Persona no válida."),
  dueDate: optional(10).refine((v) => v === null || IsoDate.safeParse(v).success, "Fecha no válida."),
});

export async function createTaskAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requirePermission("task:write");
  const parsed = TaskForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const req = await requestInfo();
  try {
    await withTenant(s.user.firmId, async (tx) => {
      const id = await createTask(tx, { firmId: s.user.firmId, userId: s.user.id, ...parsed.data });
      await audit(tx, { action: "task.created", firmId: s.user.firmId, userId: s.user.id, resourceType: "task", resourceId: id, req });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear la tarea." };
  }
  revalidatePath("/tasks");
  if (parsed.data.clientId) revalidatePath(`/clients/${parsed.data.clientId}`);
  return undefined;
}

export async function toggleTaskAction(form: FormData) {
  const s = await requirePermission("task:write");
  const p = z.object({ id: Id, done: z.enum(["true", "false"]) }).parse(Object.fromEntries(form));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await setTaskDone(tx, s.user.firmId, p.id, p.done === "true");
    if (p.done === "true") await audit(tx, { action: "task.done", firmId: s.user.firmId, userId: s.user.id, resourceType: "task", resourceId: p.id, req });
  });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

/** Kanban drag & drop / "move to" select. Returns false when it could not be saved. */
export async function moveTaskAction(taskId: string, status: string): Promise<boolean> {
  const s = await requirePermission("task:write");
  const p = z.object({ id: Id, status: z.enum(TASK_STATUSES as [string, ...string[]]) }).safeParse({ id: taskId, status });
  if (!p.success) return false;
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await setTaskStatus(tx, s.user.firmId, p.data.id, p.data.status as (typeof TASK_STATUSES)[number]);
    await audit(tx, { action: p.data.status === "done" ? "task.done" : "task.moved", firmId: s.user.firmId, userId: s.user.id, resourceType: "task", resourceId: p.data.id, req, meta: { status: p.data.status } });
  });
  revalidatePath("/dashboard");
  return true;
}

export async function deleteTaskAction(form: FormData) {
  const s = await requirePermission("task:write");
  const id = Id.parse(form.get("id"));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await deleteTask(tx, s.user.firmId, id);
    await audit(tx, { action: "task.deleted", firmId: s.user.firmId, userId: s.user.id, resourceType: "task", resourceId: id, req });
  });
  revalidatePath("/tasks");
}

const MarkForm = z.object({ id: Id, mark: z.enum(["reminded", "notified", "delivered", "paid"]), on: z.enum(["true", "false"]) });

/** Manual follow-up marks (folder delivered, fee paid, client notified…). Nothing is sent automatically. */
export async function markClientAction(form: FormData) {
  const s = await requirePermission("client:write");
  const p = MarkForm.parse(Object.fromEntries(form));
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await markClient(tx, s.user.firmId, p.id, p.mark, p.on === "true");
    await audit(tx, { action: "client.updated", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: p.id, req, meta: { mark: p.mark, on: p.on === "true" } });
  });
  revalidatePath(`/clients/${p.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/actions");
}

/** Called when someone opens WhatsApp from an action: remembers that the client was contacted. */
export async function recordContactAction(clientId: string, via: "request_docs" | "notify" | "collect") {
  const s = await requirePermission("client:write");
  const id = Id.parse(clientId);
  const mark = via === "notify" ? "notified" : "reminded";
  const req = await requestInfo();
  await withTenant(s.user.firmId, async (tx) => {
    await markClient(tx, s.user.firmId, id, mark, true);
    await audit(tx, { action: "client.updated", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: id, req, meta: { mark, via: "whatsapp" } });
  });
  revalidatePath("/dashboard");
  revalidatePath("/actions");
  revalidatePath(`/clients/${id}`);
}

const NoteForm = z.object({ clientId: Id, body: z.string().trim().min(1, "Escriba la nota.").max(2000, "La nota es muy larga (máximo 2000 caracteres).") });

export async function addNoteAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requirePermission("client:write");
  const parsed = NoteForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const req = await requestInfo();
  const denied = await limitOrMessage("general", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };
  await withTenant(s.user.firmId, async (tx) => {
    await addNote(tx, s.user.firmId, parsed.data.clientId, s.user.id, parsed.data.body);
    await audit(tx, { action: "note.created", firmId: s.user.firmId, userId: s.user.id, resourceType: "client", resourceId: parsed.data.clientId, req });
  });
  revalidatePath(`/clients/${parsed.data.clientId}`);
  return undefined;
}

export async function deleteNoteAction(form: FormData) {
  const s = await requirePermission("client:write");
  const noteId = Id.parse(form.get("noteId"));
  const clientId = Id.parse(form.get("clientId"));
  await withTenant(s.user.firmId, (tx) => deleteNote(tx, s.user.firmId, noteId, s.user.id));
  revalidatePath(`/clients/${clientId}`);
}

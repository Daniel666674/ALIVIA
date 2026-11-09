import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { clientDocuments, clients, documentFiles, type DOC_KINDS } from "@/db/schema";
import { decryptBytes, encryptBytes, sha256Hex } from "@/lib/crypto";

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel functions cap request bodies at ~4.5 MB
export type DocKind = (typeof DOC_KINDS)[number];

const aad = (fileId: string) => `document_files.data:${fileId}`;

/** Trust the bytes, not the extension or the browser-supplied type. */
export function sniffMime(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

export function safeFilename(name: string, ext: string): string {
  const base = name.normalize("NFKC").replace(/[\\/\0]/g, "").replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/^\.+/, "").trim().slice(0, 80);
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "documento";
  return `${stem}.${ext}`;
}

export class UploadError extends Error {}

export async function uploadDocument(
  tx: Tx,
  p: { firmId: string; userId: string; clientId: string; kind: DocKind; filename: string; bytes: Buffer },
) {
  if (p.kind === "dian_key") throw new UploadError("La clave DIAN no se sube como archivo: solo se marca como recibida.");
  if (p.bytes.length === 0) throw new UploadError("El archivo está vacío.");
  if (p.bytes.length > MAX_FILE_BYTES) throw new UploadError("El archivo supera 4 MB.");
  const type = sniffMime(p.bytes);
  if (!type) throw new UploadError("Solo se aceptan archivos PDF, JPG o PNG.");
  const [slot] = await tx
    .select({ id: clientDocuments.id, status: clientDocuments.status })
    .from(clientDocuments)
    .where(and(eq(clientDocuments.clientId, p.clientId), eq(clientDocuments.kind, p.kind), eq(clientDocuments.firmId, p.firmId)));
  if (!slot) throw new UploadError("No se encontró el cliente.");
  const fileId = randomUUID();
  await tx.insert(documentFiles).values({
    id: fileId,
    firmId: p.firmId,
    clientDocumentId: slot.id,
    filename: safeFilename(p.filename, type.ext),
    mime: type.mime,
    size: p.bytes.length,
    sha256: sha256Hex(p.bytes),
    dataEnc: encryptBytes(p.bytes, aad(fileId)),
    uploadedBy: p.userId,
  });
  if (slot.status === "pending") {
    await tx.update(clientDocuments).set({ status: "received", receivedAt: new Date() }).where(eq(clientDocuments.id, slot.id));
  }
  await tx.update(clients).set({ updatedAt: new Date() }).where(eq(clients.id, p.clientId));
  return { fileId };
}

export async function filesForClient(tx: Tx, firmId: string, clientDocIds: string[]) {
  if (clientDocIds.length === 0) return [];
  return tx
    .select({ id: documentFiles.id, clientDocumentId: documentFiles.clientDocumentId, filename: documentFiles.filename, mime: documentFiles.mime, size: documentFiles.size, uploadedAt: documentFiles.uploadedAt })
    .from(documentFiles)
    .where(and(eq(documentFiles.firmId, firmId), inArray(documentFiles.clientDocumentId, clientDocIds)))
    .orderBy(desc(documentFiles.uploadedAt));
}

export async function readFile(tx: Tx, firmId: string, fileId: string) {
  const [f] = await tx.select().from(documentFiles).where(and(eq(documentFiles.id, fileId), eq(documentFiles.firmId, firmId)));
  if (!f) return null;
  return { bytes: decryptBytes(f.dataEnc, aad(f.id)), filename: f.filename, mime: f.mime, clientDocumentId: f.clientDocumentId };
}

export async function setDocumentStatus(
  tx: Tx,
  p: { firmId: string; userId: string; clientId: string; kind: DocKind; status: "pending" | "received" | "reviewed" },
) {
  const now = new Date();
  await tx
    .update(clientDocuments)
    .set({
      status: p.status,
      receivedAt: p.status === "pending" ? null : now,
      reviewedAt: p.status === "reviewed" ? now : null,
      reviewedBy: p.status === "reviewed" ? p.userId : null,
    })
    .where(and(eq(clientDocuments.clientId, p.clientId), eq(clientDocuments.kind, p.kind), eq(clientDocuments.firmId, p.firmId)));
  await tx.update(clients).set({ updatedAt: now }).where(and(eq(clients.id, p.clientId), eq(clients.firmId, p.firmId)));
}

export async function deleteFile(tx: Tx, firmId: string, fileId: string) {
  await tx.delete(documentFiles).where(and(eq(documentFiles.id, fileId), eq(documentFiles.firmId, firmId)));
}

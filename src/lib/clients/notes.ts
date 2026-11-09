import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { clientNotes, users } from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";

const aad = (id: string) => `client_notes.body:${id}`;

/** Internal notes about a client, encrypted at rest like the rest of the client's personal data. */
export async function listNotes(tx: Tx, firmId: string, clientId: string) {
  const rows = await tx
    .select({ id: clientNotes.id, enc: clientNotes.bodyEnc, at: clientNotes.createdAt, authorId: clientNotes.authorId, author: users.name })
    .from(clientNotes)
    .leftJoin(users, eq(users.id, clientNotes.authorId))
    .where(and(eq(clientNotes.firmId, firmId), eq(clientNotes.clientId, clientId)))
    .orderBy(desc(clientNotes.createdAt))
    .limit(100);
  return rows.map((r) => ({ id: r.id, body: decryptField(r.enc, aad(r.id)), at: r.at, authorId: r.authorId, author: r.author ?? "—" }));
}

export async function addNote(tx: Tx, firmId: string, clientId: string, authorId: string, body: string) {
  const id = crypto.randomUUID();
  await tx.insert(clientNotes).values({ id, firmId, clientId, authorId, bodyEnc: encryptField(body, aad(id)) });
  return id;
}

export async function deleteNote(tx: Tx, firmId: string, noteId: string, authorId: string) {
  await tx.delete(clientNotes).where(and(eq(clientNotes.id, noteId), eq(clientNotes.firmId, firmId), eq(clientNotes.authorId, authorId)));
}

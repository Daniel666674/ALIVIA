"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@/db/client";
import { audit } from "@/lib/audit";
import { requestInfo } from "@/lib/auth/context";
import { requirePermission } from "@/lib/auth/session";
import { limitOrMessage, type FormState } from "@/lib/auth/actions-shared";
import { IMPORT_FIELDS, MAX_IMPORT_BYTES, type Mapping } from "@/lib/clients/csv";
import { applyImport, createDraft, rollbackImport, saveMapping } from "@/lib/clients/import";
import { LimitError } from "@/lib/clients/service";

const Id = z.string().uuid();

export async function uploadCsvAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requirePermission("import:run");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elija un archivo de Excel (.xlsx) o CSV." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "El archivo supera 4 MB." };
  const req = await requestInfo();
  const denied = await limitOrMessage("csvImport", s.user.id, req, { firmId: s.user.firmId, userId: s.user.id });
  if (denied) return { error: denied };
  let batchId: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    batchId = (await withTenant(s.user.firmId, (tx) => createDraft(tx, { firmId: s.user.firmId, userId: s.user.id, filename: file.name, bytes }))).batchId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }
  redirect(`/clients/import?batch=${batchId}`);
}

export async function saveMappingAction(form: FormData) {
  const s = await requirePermission("import:run");
  const batch = Id.parse(form.get("batch"));
  const mapping: Mapping = {};
  for (const f of IMPORT_FIELDS) {
    const v = String(form.get(`map_${f}`) ?? "");
    if (v) mapping[f] = v;
  }
  const ok = await withTenant(s.user.firmId, (tx) => saveMapping(tx, s.user.firmId, s.user.id, batch, mapping));
  redirect(ok ? `/clients/import?batch=${batch}` : "/clients/import?expired=1");
}

export async function applyImportAction(form: FormData) {
  const s = await requirePermission("import:run");
  const batch = Id.parse(form.get("batch"));
  const req = await requestInfo();
  let result: { created: number; skipped: number; failed: number };
  try {
    result = await withTenant(s.user.firmId, async (tx) => {
      const r = await applyImport(tx, { firmId: s.user.firmId, userId: s.user.id, batchId: batch });
      await audit(tx, { action: "import.applied", firmId: s.user.firmId, userId: s.user.id, resourceType: "import", resourceId: batch, req, meta: r });
      return r;
    });
  } catch (e) {
    const msg = e instanceof LimitError || e instanceof Error ? e.message : "No se pudo importar.";
    redirect(`/clients/import?batch=${batch}&error=${encodeURIComponent(msg.slice(0, 200))}`);
  }
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  redirect(`/clients/import?done=${batch}&c=${result.created}&s=${result.skipped}&f=${result.failed}`);
}

export async function rollbackImportAction(form: FormData) {
  const s = await requirePermission("import:run");
  const batch = Id.parse(form.get("batch"));
  const req = await requestInfo();
  const n = await withTenant(s.user.firmId, async (tx) => {
    const removed = await rollbackImport(tx, s.user.firmId, batch);
    await audit(tx, { action: "import.rolled_back", firmId: s.user.firmId, userId: s.user.id, resourceType: "import", resourceId: batch, req, meta: { removed } });
    return removed;
  });
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  redirect(`/clients/import?undone=${n}`);
}

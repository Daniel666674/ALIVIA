import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { auditLog } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Badge, Dot, PageHeader, Panel, StageBadge, btnGhost, btnSmall } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { filesForClient } from "@/lib/clients/documents";
import { firmUsers, getClient } from "@/lib/clients/service";
import { COLOR_LABEL, DOC_LABEL, type Stage } from "@/lib/clients/semaforo";
import { deadlineText, fmtDate, fmtDateTime } from "@/lib/format";
import { deleteClientAction, deleteFileAction, deleteTaskAction, setDocStatusAction, setStageAction, toggleTaskAction } from "../actions";
import { EditClientForm, TaskForm, UploadForm } from "../forms";

export const dynamic = "force-dynamic";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const STAGES: { stage: Stage; label: string }[] = [
  { stage: "in_preparation", label: "En preparación" },
  { stage: "in_review", label: "En revisión" },
  { stage: "presented", label: "Presentada" },
];

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("client:read");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const data = await withTenant(s.user.firmId, async (tx) => {
    const c = await getClient(tx, s.user.firmId, id.data);
    if (!c) return null;
    const files = can(s, "document:read") ? await filesForClient(tx, s.user.firmId, c.docs.map((d) => d.id)) : [];
    const people = await firmUsers(tx, s.user.firmId);
    const history = await tx
      .select({ action: auditLog.action, at: auditLog.at, meta: auditLog.meta })
      .from(auditLog)
      .where(and(eq(auditLog.firmId, s.user.firmId), eq(auditLog.resourceId, c.id)))
      .orderBy(desc(auditLog.at))
      .limit(8);
    return { c, files, people, history };
  });
  if (!data) notFound();
  const { c, files, people, history } = data;
  const canWrite = can(s, "client:write");
  const canDocWrite = can(s, "document:write");
  const canTask = can(s, "task:write");
  const people2 = people.map((p) => ({ id: p.id, name: p.name }));
  const missing = c.docs.filter((d) => d.status === "pending").map((d) => DOC_LABEL[d.kind]);

  return (
    <Shell session={s} active="/clients">
      <Link href="/clients" className="text-sm font-semibold text-brand hover:underline">← Clientes</Link>
      <PageHeader
        title={c.name}
        subtitle={`${c.kind === "natural" ? "Persona natural" : "Empresa"} · ${c.kind === "natural" ? "CC" : "NIT"} ${c.docNumber}${c.docDv ? `-${c.docDv}` : ""}${c.city ? ` · ${c.city}` : ""}`}
        actions={canWrite && (
          <>
            {STAGES.filter((x) => x.stage !== c.stage).map((x) => (
              <form key={x.stage} action={setStageAction}>
                <input type="hidden" name="id" value={c.id} /><input type="hidden" name="stage" value={x.stage} />
                <button className={x.stage === "presented" ? "inline-flex rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700" : btnGhost}>{x.stage === "presented" ? "✓ Marcar presentada" : x.label}</button>
              </form>
            ))}
            {c.stage !== "pending" && (
              <form action={setStageAction}>
                <input type="hidden" name="id" value={c.id} /><input type="hidden" name="stage" value="pending" />
                <button className={btnSmall}>Reabrir</button>
              </form>
            )}
          </>
        )}
      />
      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <Dot color={c.color} size="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{COLOR_LABEL[c.color]} · {c.docsReceived} de 4 documentos</div>
            <div className="text-sm text-slate-600">
              {missing.length ? `Falta: ${missing.join(", ")}` : "Documentos completos"} · Fecha límite: {c.deadline ? `${fmtDate(c.deadline)} (${deadlineText(c.deadline)})` : "sin fecha"}
            </div>
          </div>
          <StageBadge stage={c.stage} />
          <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${c.docsReceived} de 4 documentos`}>
            <div className={`h-full ${c.color === "green" ? "bg-emerald-500" : c.color === "blue" ? "bg-sky-500" : c.color === "yellow" ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${c.docsReceived * 25}%` }} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <Panel title="Documentos base" action={<span className="text-xs text-slate-500">Solo 4 por cliente</span>}>
            <ul className="divide-y divide-slate-100">
              {c.docs.map((d) => {
                const fs = files.filter((f) => f.clientDocumentId === d.id);
                const isKey = d.kind === "dian_key";
                return (
                  <li key={d.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{DOC_LABEL[d.kind]}</span>
                      <Badge tone={d.status === "reviewed" ? "green" : d.status === "received" ? "sky" : "red"}>{d.status === "reviewed" ? "Revisado" : d.status === "received" ? "Recibido" : "Pendiente"}</Badge>
                      {canDocWrite && (
                        <span className="ml-auto flex gap-1.5">
                          {d.status !== "received" && d.status !== "reviewed" && isKey && <StatusBtn clientId={c.id} kind={d.kind} status="received">Marcar recibida</StatusBtn>}
                          {d.status === "received" && <StatusBtn clientId={c.id} kind={d.kind} status="reviewed">Marcar revisado</StatusBtn>}
                          {d.status !== "pending" && <StatusBtn clientId={c.id} kind={d.kind} status="pending">Deshacer</StatusBtn>}
                        </span>
                      )}
                    </div>
                    {isKey ? (
                      <p className="mt-1 text-xs text-slate-500">La clave DIAN no se guarda en el sistema: solo se registra si el contador ya la recibió.</p>
                    ) : (
                      <>
                        {fs.map((f) => (
                          <div key={f.id} className="mt-1.5 flex items-center gap-2 text-sm">
                            <span aria-hidden>📎</span>
                            {can(s, "document:read") ? <a className="font-medium text-brand hover:underline" href={`/api/documents/${f.id}`}>{f.filename}</a> : f.filename}
                            <span className="text-xs text-slate-500">{kb(f.size)} · {fmtDateTime(f.uploadedAt)}</span>
                            {canDocWrite && (
                              <form action={deleteFileAction} className="ml-auto">
                                <input type="hidden" name="fileId" value={f.id} /><input type="hidden" name="clientId" value={c.id} />
                                <button className="text-xs text-slate-400 hover:text-red-600" aria-label={`Eliminar ${f.filename}`}>Eliminar</button>
                              </form>
                            )}
                          </div>
                        ))}
                        {canDocWrite && <div className="mt-2"><UploadForm clientId={c.id} kind={d.kind} /></div>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Tareas de este cliente">
            {c.tasks.length === 0 && <p className="mb-3 text-sm text-slate-500">Sin tareas.</p>}
            <ul className="mb-3 divide-y divide-slate-100">
              {c.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  {canTask ? (
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.status === "done" ? "false" : "true"} />
                      <button aria-label={t.status === "done" ? "Reabrir tarea" : "Completar tarea"} className={`grid h-5 w-5 place-items-center rounded border ${t.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{t.status === "done" ? "✓" : ""}</button>
                    </form>
                  ) : null}
                  <span className={`flex-1 ${t.status === "done" ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
                  <span className="text-xs text-slate-500">{t.assigneeName ?? "Sin asignar"}{t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}</span>
                  {canTask && <form action={deleteTaskAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-slate-400 hover:text-red-600" aria-label="Eliminar tarea">✕</button></form>}
                </li>
              ))}
            </ul>
            {canTask && <TaskForm people={people2} clientId={c.id} />}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Datos del cliente">
            {canWrite ? (
              <EditClientForm c={{ id: c.id, name: c.name, email: c.email, phone: c.phone, city: c.city, deadline: c.deadline, responsibleId: c.responsibleId }} people={people2} />
            ) : (
              <dl className="space-y-1 text-sm"><dt className="text-slate-500">Correo</dt><dd>{c.email ?? "—"}</dd><dt className="text-slate-500">Teléfono</dt><dd>{c.phone ?? "—"}</dd></dl>
            )}
          </Panel>
          <Panel title="Historial">
            {history.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos todavía.</p> : (
              <ul className="space-y-2 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-xs text-slate-500">{fmtDateTime(h.at)}</span><span>{ACTION_TEXT[h.action] ?? h.action}</span></li>
                ))}
              </ul>
            )}
          </Panel>
          {canWrite && (
            <form action={deleteClientAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-xs text-slate-400 hover:text-red-600">Eliminar cliente</button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}

const ACTION_TEXT: Record<string, string> = {
  "client.created": "Cliente creado",
  "client.updated": "Datos actualizados",
  "client.stage": "Cambió el estado de la declaración",
  "document.uploaded": "Documento subido",
  "document.downloaded": "Documento descargado",
  "document.status": "Cambió el estado de un documento",
  "document.deleted": "Documento eliminado",
};

function StatusBtn({ clientId, kind, status, children }: { clientId: string; kind: string; status: string; children: React.ReactNode }) {
  return (
    <form action={setDocStatusAction}>
      <input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="status" value={status} />
      <button className={btnSmall}>{children}</button>
    </form>
  );
}

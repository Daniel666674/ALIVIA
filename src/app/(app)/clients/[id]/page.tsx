import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Avatar, Badge, Dot, Panel, StageBadge, Stat, btnGhost, btnSmall } from "@/components/app-ui";
import { Help } from "@/components/help";
import { NbaList } from "@/components/nba-list";
import { Shell } from "@/components/shell";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { filesForClient } from "@/lib/clients/documents";
import { loadNba, waLinksFor } from "@/lib/clients/nba-view";
import { listNotes } from "@/lib/clients/notes";
import { COLOR_LABEL, DOC_LABEL, type Stage } from "@/lib/clients/semaforo";
import { firmUsers, getClient } from "@/lib/clients/service";
import { daysUntil, deadlineText, fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { deleteClientAction, deleteFileAction, deleteNoteAction, deleteTaskAction, markClientAction, setDocStatusAction, setStageAction, toggleTaskAction } from "../actions";
import { EditClientForm, NoteForm, TaskForm, UploadForm } from "../forms";

export const dynamic = "force-dynamic";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const cop = (n: number) => `$${n.toLocaleString("es-CO")}`;

const TABS = [
  ["resumen", "Resumen"],
  ["documentos", "Documentos"],
  ["tareas", "Tareas"],
  ["seguimiento", "Seguimiento"],
  ["notas", "Notas"],
  ["historial", "Historial"],
] as const;
type Tab = (typeof TABS)[number][0];

const PIPELINE = ["Sin presentar", "En preparación", "En revisión", "Presentada", "Cliente avisado", "Carpeta entregada", "Honorarios pagados"] as const;

const ACTION_TEXT: Record<string, string> = {
  "client.created": "Cliente creado",
  "client.updated": "Datos actualizados",
  "client.stage": "Cambió el estado de la declaración",
  "document.uploaded": "Documento subido",
  "document.downloaded": "Documento descargado",
  "document.status": "Cambió el estado de un documento",
  "document.deleted": "Documento eliminado",
  "note.created": "Agregó una nota",
  "task.created": "Creó una tarea",
};

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const s = await requirePermission("client:read");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const tabRaw = (await searchParams).tab;
  const tab: Tab = TABS.some(([k]) => k === tabRaw) ? (tabRaw as Tab) : "resumen";
  const data = await withTenant(s.user.firmId, async (tx) => {
    const c = await getClient(tx, s.user.firmId, id.data);
    if (!c) return null;
    const files = can(s, "document:read") ? await filesForClient(tx, s.user.firmId, c.docs.map((d) => d.id)) : [];
    const people = await firmUsers(tx, s.user.firmId);
    const history = await tx
      .select({ action: auditLog.action, at: auditLog.at, meta: auditLog.meta, who: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.firmId, s.user.firmId), eq(auditLog.resourceId, c.id)))
      .orderBy(desc(auditLog.at))
      .limit(30);
    const nba = await loadNba(tx, s.user.firmId, { onlyClientId: c.id, limit: 3 });
    const wa = await waLinksFor(tx, s.user.firmId, c.id);
    const notes = await listNotes(tx, s.user.firmId, c.id);
    return { c, files, people, history, nba: nba.items, wa, notes };
  });
  if (!data) notFound();
  const { c, files, people, history, nba, wa, notes } = data;
  const canWrite = can(s, "client:write");
  const canDocWrite = can(s, "document:write");
  const canTask = can(s, "task:write");
  const people2 = people.map((p) => ({ id: p.id, name: p.name }));
  const missing = c.docs.filter((d) => d.status === "pending").map((d) => DOC_LABEL[d.kind]);
  const openTasks = c.tasks.filter((t) => t.status !== "done");
  const dleft = daysUntil(c.deadline);
  const stageIdx = c.stage === "pending" ? 0 : c.stage === "in_preparation" ? 1 : c.stage === "in_review" ? 2 : c.paidAt ? 6 : c.deliveredAt ? 5 : c.notifiedAt ? 4 : 3;
  const idLabel = c.docNumber ? `${c.kind === "natural" ? "CC" : "NIT"} ${c.docNumber}${c.docDv ? `-${c.docDv}` : ""}` : `Cédula sin completar${c.docHint ? ` · termina en ${c.docHint}` : ""}`;
  const tel = c.phone?.replace(/[^\d+]/g, "");
  const tabHref = (t: Tab) => `/clients/${c.id}${t === "resumen" ? "" : `?tab=${t}`}`;
  const badge: Record<Tab, number> = { resumen: 0, documentos: missing.length, tareas: openTasks.length, seguimiento: 0, notas: notes.length, historial: 0 };

  return (
    <Shell session={s} active="/clients">
      <Link href="/clients" className="mb-3 inline-block text-[13px] font-semibold hover:underline" style={{ color: "var(--brand)" }}>← Clientes</Link>

      {/* Hero */}
      <section className="card mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={c.name} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold leading-tight" style={{ color: "var(--t1)" }}>{c.name}</h1>
              <Help id="client.profile" />
              <Badge tone={c.kind === "empresa" ? "brand" : "slate"}>{c.kind === "natural" ? "Persona natural" : "Empresa"}</Badge>
              <StageBadge stage={c.stage} />
              <Dot color={c.color} size="h-3.5 w-3.5" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--t3)" }}>
              <span>{idLabel}</span>
              {c.city && <span>📍 {c.city}</span>}
              {c.responsibleName && <span className="inline-flex items-center gap-1.5"><Avatar name={c.responsibleName} size={18} />Responsable: <b style={{ color: "var(--t2)" }}>{c.responsibleName}</b></span>}
              {!c.responsibleName && <span>Sin responsable</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && missing.length > 0 && <WhatsAppButton href={wa.request} clientId={c.id} via="request_docs" label="Pedir documentos" />}
            <Link href={`/portal?c=${c.id}`} className="btn btn-secondary btn-sm" data-track="portal.open">🌐 Ver portal</Link>
            {c.email && <a href={`mailto:${c.email}`} className="btn btn-secondary btn-sm" data-track="client.email">✉ Correo</a>}
            {tel && <a href={`tel:${tel}`} className="btn btn-secondary btn-sm" data-track="client.call">☎ Llamar</a>}
          </div>
        </div>

        {/* Pipeline */}
        <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Avance del cliente">
          {PIPELINE.map((label, i) => {
            const done = i < stageIdx || (i === stageIdx && i >= 3);
            const current = i === stageIdx && i < 3;
            return (
              <li key={label} className="rounded-lg border px-2.5 py-2 text-[11.5px] font-semibold" style={{ borderColor: done ? "var(--green)" : current ? "var(--brand)" : "var(--ws-border)", background: done ? "var(--green-bg)" : current ? "var(--brand-light)" : "var(--ws-bg)", color: done ? "var(--green)" : current ? "var(--brand)" : "var(--t3)" }}>
                <span className="mr-1">{done ? "✓" : i + 1}</span>{label}
              </li>
            );
          })}
        </ol>
      </section>

      {/* KPIs */}
      <div className="mb-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="file" iconBg="#FEF3C7" iconColor="#F79009" label="Documentos" value={`${c.docsReceived} de 4`} hint={missing.length ? `Falta: ${missing.join(", ")}` : "· Completos"} hintTone={missing.length ? "down" : "up"} />
        <Stat icon="clock" iconBg={dleft !== null && dleft < 0 ? "#FEE2E2" : "#EDE9FE"} iconColor={dleft !== null && dleft < 0 ? "#F04438" : "#4F46E5"} label="Fecha límite" value={c.deadline ? fmtDate(c.deadline) : "—"} hint={`· ${deadlineText(c.deadline)}`} hintTone={dleft !== null && dleft < 0 ? "down" : "neutral"} />
        <Stat icon="tasks" iconBg="#CCFBF1" iconColor="#0D9488" label="Tareas abiertas" value={openTasks.length} hint={openTasks.length ? `· ${openTasks.filter((t) => t.dueDate && daysUntil(t.dueDate)! < 0).length} vencidas` : "· Al día"} />
        <Stat icon="receipt" iconBg="#F5F3FF" iconColor="#7C3AED" label="Honorarios" value={c.feeCop ? cop(c.feeCop) : "—"} hint={c.paidAt ? "↑ Pagados" : c.feeCop ? "· Pendiente de pago" : "· Sin definir"} hintTone={c.paidAt ? "up" : "neutral"} />
      </div>

      {/* Tabs */}
      <nav className="f-tabs mb-4" aria-label="Secciones del cliente">
        {TABS.map(([k, l]) => (
          <Link key={k} href={tabHref(k)} className={`f-tab ${tab === k ? "active" : ""}`} aria-current={tab === k ? "page" : undefined}>
            {l}{badge[k] > 0 && <span className="ml-1.5 rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: "var(--ws-border)", color: "var(--t2)" }}>{badge[k]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "resumen" && (
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <div className="space-y-4">
            {nba.length > 0 && (
              <Panel title="Qué hacer ahora con este cliente" subtitle="La siguiente mejor acción, con su motivo" help="nba">
                <NbaList items={nba} canWrite={canWrite} compact />
              </Panel>
            )}
            <Panel title="Documentos base" subtitle={`${c.docsReceived} de 4 recibidos · ${COLOR_LABEL[c.color]}`}>
              <ul className="divide-y divide-slate-100">
                {c.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2 text-[13px]">
                    <span className="flex-1 font-medium">{DOC_LABEL[d.kind]}</span>
                    <Badge tone={d.status === "reviewed" ? "green" : d.status === "received" ? "sky" : "red"}>{d.status === "reviewed" ? "Revisado" : d.status === "received" ? "Recibido" : "Pendiente"}</Badge>
                  </li>
                ))}
              </ul>
              <Link href={tabHref("documentos")} className="mt-2 inline-block text-[12.5px] font-semibold" style={{ color: "var(--brand)" }}>Gestionar documentos →</Link>
            </Panel>
            <Panel title="Notas recientes" action={<Link href={tabHref("notas")} className="link-more">Ver todas →</Link>}>
              {notes.length === 0 ? <p className="text-[13px]" style={{ color: "var(--t3)" }}>Sin notas. Use la pestaña Notas para dejar acuerdos y pendientes.</p> : notes.slice(0, 2).map((n) => (
                <div key={n.id} className="border-b py-2 text-[13px] last:border-0" style={{ borderColor: "var(--ws-border-lt)" }}>
                  <div className="whitespace-pre-wrap">{n.body}</div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--t3)" }}>{n.author} · {timeAgo(n.at)}</div>
                </div>
              ))}
            </Panel>
          </div>
          <div className="space-y-4">
            <ProfilePanel c={c} people={people2} canWrite={canWrite} />
            {canWrite && (
              <Panel title="Estado de la declaración" help="client.stage">
                <div className="flex flex-wrap gap-2">
                  {([["pending", "Sin presentar"], ["in_preparation", "En preparación"], ["in_review", "En revisión"], ["presented", "✓ Presentada"]] as [Stage, string][]).map(([st, l]) => (
                    <form key={st} action={setStageAction}>
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="stage" value={st} />
                      <button className={st === c.stage ? "btn btn-primary btn-sm" : btnSmall} disabled={st === c.stage}>{l}</button>
                    </form>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === "documentos" && (
        <Panel title="Documentos base" subtitle="Solo 4 por cliente · se guardan cifrados" help="client.docs">
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
                          {can(s, "document:read") ? <a className="font-medium hover:underline" style={{ color: "var(--brand)" }} href={`/api/documents/${f.id}`}>{f.filename}</a> : f.filename}
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
      )}

      {tab === "tareas" && (
        <Panel title="Tareas de este cliente" help="client.tasks">
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
      )}

      {tab === "seguimiento" && (
        <Panel title="Seguimiento" help="client.followup" subtitle={c.stage === "presented" ? "Después de presentar: avisar, entregar y cobrar" : "Disponible cuando la declaración esté presentada"}>
          <ul className="divide-y divide-slate-100 text-sm">
            {([
              ["notified", "Cliente avisado", c.notifiedAt, "notify"],
              ["delivered", "Carpeta física entregada", c.deliveredAt, null],
              ["paid", `Honorarios pagados${c.feeCop ? ` (${cop(c.feeCop)})` : ""}`, c.paidAt, "collect"],
            ] as const).map(([mark, label, at, via]) => (
              <li key={mark} className="flex flex-wrap items-center gap-2 py-3">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] text-white ${at ? "bg-emerald-500" : "bg-slate-300"}`}>{at ? "✓" : ""}</span>
                <span className="flex-1 font-medium">{label}{at ? <span className="ml-2 text-xs font-normal text-slate-500">{fmtDate(at.toISOString().slice(0, 10))}</span> : null}</span>
                {canWrite && via && !at && c.stage === "presented" && <WhatsAppButton href={wa[via]} clientId={c.id} via={via} />}
                {canWrite && (
                  <form action={markClientAction}>
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="mark" value={mark} /><input type="hidden" name="on" value={at ? "false" : "true"} />
                    <button className={btnSmall} disabled={!at && c.stage !== "presented"}>{at ? "Deshacer" : "Marcar"}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "notas" && (
        <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
          {canWrite && <Panel title="Nueva nota" help="client.notes"><NoteForm clientId={c.id} /></Panel>}
          <Panel title={`Notas (${notes.length})`} className={canWrite ? "" : "xl:col-span-2"}>
            {notes.length === 0 && <p className="text-[13px]" style={{ color: "var(--t3)" }}>Todavía no hay notas para este cliente.</p>}
            {notes.map((n) => (
              <div key={n.id} className="flex gap-3 border-b py-3 last:border-0" style={{ borderColor: "var(--ws-border-lt)" }}>
                <Avatar name={n.author} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px]" style={{ color: "var(--t3)" }}><b style={{ color: "var(--t1)" }}>{n.author}</b> · {fmtDateTime(n.at)}</div>
                  <div className="mt-0.5 whitespace-pre-wrap text-[13.5px]">{n.body}</div>
                </div>
                {n.authorId === s.user.id && (
                  <form action={deleteNoteAction}>
                    <input type="hidden" name="noteId" value={n.id} /><input type="hidden" name="clientId" value={c.id} />
                    <button className="text-xs text-slate-400 hover:text-red-600" aria-label="Eliminar nota">Eliminar</button>
                  </form>
                )}
              </div>
            ))}
          </Panel>
        </div>
      )}

      {tab === "historial" && (
        <Panel title="Historial" subtitle="Quién hizo qué con este cliente">
          {history.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos todavía.</p> : history.map((h, i) => (
            <div key={i} className="act-item">
              <span className="act-dot" style={{ background: "var(--brand)" }} />
              <div>
                <div className="act-txt"><b style={{ color: "var(--t1)" }}>{h.who ?? "Sistema"}</b> {(ACTION_TEXT[h.action] ?? h.action).toLowerCase()}</div>
                <div className="act-time">{fmtDateTime(h.at)} · {timeAgo(h.at)}</div>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {canWrite && (
        <form action={deleteClientAction} className="mt-6">
          <input type="hidden" name="id" value={c.id} />
          <button className="text-xs text-slate-400 hover:text-red-600">Eliminar cliente</button>
        </form>
      )}
    </Shell>
  );
}

function ProfilePanel({ c, people, canWrite }: { c: NonNullable<Awaited<ReturnType<typeof getClient>>>; people: { id: string; name: string }[]; canWrite: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ["Cédula / NIT", c.docNumber ? `${c.docNumber}${c.docDv ? `-${c.docDv}` : ""}` : <span style={{ color: "var(--amber)" }}>Falta completarla{c.docHint ? ` (termina en ${c.docHint})` : ""}</span>],
    ["Correo", c.email ?? "—"],
    ["Teléfono", c.phone ?? "—"],
    ["Ciudad", c.city ?? "—"],
    ["Responsable", c.responsibleName ?? "Sin asignar"],
    ["Fecha límite", c.deadline ? `${fmtDate(c.deadline)} (${deadlineText(c.deadline)})` : "Sin fecha"],
    ["Honorarios", c.feeCop ? cop(c.feeCop) : "—"],
  ];
  return (
    <Panel title="Datos del cliente" help="client.profile" action={canWrite ? undefined : undefined}>
      <dl className="mb-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[13px]">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt style={{ color: "var(--t3)" }}>{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></div>))}
      </dl>
      {canWrite && (
        <details className="rounded-lg border p-3" style={{ borderColor: "var(--ws-border)" }}>
          <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--brand)" }}>✎ Editar datos</summary>
          <div className="mt-3">
            <EditClientForm c={{ id: c.id, needsDoc: !c.docNumber, name: c.name, email: c.email, phone: c.phone, city: c.city, deadline: c.deadline, responsibleId: c.responsibleId, feeCop: c.feeCop }} people={people} />
          </div>
        </details>
      )}
    </Panel>
  );
}

function StatusBtn({ clientId, kind, status, children }: { clientId: string; kind: string; status: string; children: React.ReactNode }) {
  return (
    <form action={setDocStatusAction}>
      <input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="status" value={status} />
      <button className={btnSmall}>{children}</button>
    </form>
  );
}

void btnGhost;

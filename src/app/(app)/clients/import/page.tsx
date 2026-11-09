import Link from "next/link";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { Badge, LinkButton, PageHeader, Panel, Stat, btnGhost, btnPrimary, inputCls } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { FIELD_LABELS, IMPORT_FIELDS } from "@/lib/clients/csv";
import { loadDraft, previewImport, recentBatches } from "@/lib/clients/import";
import { fmtDateTime } from "@/lib/format";
import { applyImportAction, rollbackImportAction, saveMappingAction } from "./actions";
import { UploadCsvForm } from "./upload-form";

export const dynamic = "force-dynamic";

const Q = z.object({
  batch: z.string().uuid().optional().catch(undefined),
  done: z.string().uuid().optional().catch(undefined),
  c: z.coerce.number().int().min(0).optional().catch(undefined),
  s: z.coerce.number().int().min(0).optional().catch(undefined),
  f: z.coerce.number().int().min(0).optional().catch(undefined),
  undone: z.coerce.number().int().min(0).optional().catch(undefined),
  expired: z.string().optional(),
  error: z.string().max(300).optional(),
});

const STEPS = ["Subir archivo", "Revisar y corregir", "Confirmar"];

function Steps({ at }: { at: 1 | 2 | 3 }) {
  return (
    <ol className="mb-6 flex items-center gap-3 text-sm font-semibold">
      {STEPS.map((l, i) => (
        <li key={l} className={`flex items-center gap-2 ${i + 1 === at ? "text-slate-900" : i + 1 < at ? "text-emerald-700" : "text-slate-400"}`}>
          <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i + 1 === at ? "bg-brand text-white" : i + 1 < at ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{i + 1 < at ? "✓" : i + 1}</span>
          {l}
          {i < 2 && <span className="mx-1 h-px w-8 bg-slate-300" />}
        </li>
      ))}
    </ol>
  );
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePermission("import:run");
  const raw = await searchParams;
  const q = Q.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));

  if (q.done) {
    return (
      <Shell session={s} active="/clients">
        <PageHeader title="Importación lista" />
        <Panel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Clientes creados" value={q.c ?? 0} tone="green" />
            <Stat label="Ya existían (omitidos)" value={q.s ?? 0} />
            <Stat label="Filas con error (omitidas)" value={q.f ?? 0} tone={q.f ? "red" : undefined} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton primary href="/clients">Ver clientes</LinkButton>
            <LinkButton href="/board">Ver tablero</LinkButton>
            <form action={rollbackImportAction}>
              <input type="hidden" name="batch" value={q.done} />
              <button className={btnGhost}>↩ Deshacer esta importación</button>
            </form>
          </div>
          <p className="mt-3 text-xs text-slate-500">Deshacer elimina solo los clientes que creó esta importación. Los que ya existían no se tocan.</p>
        </Panel>
      </Shell>
    );
  }

  const view = await withTenant(s.user.firmId, async (tx) => {
    if (!q.batch) return { kind: "upload" as const, batches: await recentBatches(tx, s.user.firmId) };
    const draft = await loadDraft(tx, s.user.firmId, s.user.id, q.batch);
    if (!draft) return { kind: "expired" as const };
    return { kind: "review" as const, draft, preview: await previewImport(tx, s.user.firmId, s.user.id, q.batch) };
  });

  if (view.kind === "expired") {
    return (
      <Shell session={s} active="/clients">
        <PageHeader title="Importar clientes" />
        <Panel><p className="mb-3 text-sm">Esta importación venció o no existe. Suba el archivo de nuevo.</p><LinkButton primary href="/clients/import">Empezar de nuevo</LinkButton></Panel>
      </Shell>
    );
  }

  if (view.kind === "upload") {
    return (
      <Shell session={s} active="/clients">
        <PageHeader title="Importar clientes desde CSV" subtitle="Cargue su base actual. Revisamos cada fila antes de guardar nada." />
        <Steps at={1} />
        {q.undone !== undefined && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Se deshizo la importación: se eliminaron {q.undone} clientes.</p>}
        {q.expired && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">La importación venció. Suba el archivo de nuevo.</p>}
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <Panel title="1. Suba su archivo"><UploadCsvForm /></Panel>
          <Panel title="Cómo preparar el archivo">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              <li>En Excel: <b>Archivo → Guardar como → CSV</b>.</li>
              <li>Necesita al menos el <b>nombre</b> y la <b>cédula o NIT</b> de cada cliente.</li>
              <li>Opcionales: tipo, correo, teléfono, ciudad, responsable y fecha límite.</li>
              <li>El sistema reconoce los nombres de columna más comunes y le deja corregirlos.</li>
              <li>Máximo 4 MB. Si un cliente ya existe, se omite.</li>
            </ul>
          </Panel>
        </div>
        {view.batches.length > 0 && (
          <Panel title="Importaciones recientes" className="mt-5">
            <ul className="divide-y divide-slate-100 text-sm">
              {view.batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="font-medium">{b.filename}</span>
                  <span className="text-slate-500">{fmtDateTime(b.createdAt)}</span>
                  <Badge tone={b.status === "applied" ? "green" : "slate"}>{b.status === "applied" ? `${b.created} creados` : "Deshecha"}</Badge>
                  {b.status === "applied" && (
                    <form action={rollbackImportAction} className="ml-auto">
                      <input type="hidden" name="batch" value={b.id} />
                      <button className="text-xs font-semibold text-slate-500 hover:text-red-600">Deshacer</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </Shell>
    );
  }

  const { draft, preview } = view;
  const p = preview!;
  const shown = p.rows.filter((r) => r.status !== "ok" || r.existing).slice(0, 60);
  const okRows = p.rows.filter((r) => r.status === "ok" && !r.existing).slice(0, 8);
  const sample = [...shown, ...okRows];
  return (
    <Shell session={s} active="/clients">
      <PageHeader title="Revisar la importación" subtitle={`${draft.filename} · ${draft.rows.length} filas`} />
      <Steps at={2} />
      {q.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{q.error}</p>}
      <Panel title="1. ¿Qué columna es cada dato?" className="mb-5">
        <form action={saveMappingAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="batch" value={q.batch} />
          {IMPORT_FIELDS.map((f) => (
            <label key={f} className="block text-sm font-medium text-slate-700">
              {FIELD_LABELS[f]}
              <select name={`map_${f}`} defaultValue={draft.mapping[f] ?? ""} className={`${inputCls} mt-1`}>
                <option value="">— No incluir —</option>
                {draft.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
          <div className="sm:col-span-2 lg:col-span-3"><button className={btnGhost}>Actualizar vista previa</button></div>
        </form>
      </Panel>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Filas leídas" value={p.total} />
        <Stat label="Listas para crear" value={p.ready} tone="green" hint={p.warnings ? `${p.warnings} con advertencias` : undefined} />
        <Stat label="Ya existen (se omiten)" value={p.existing} />
        <Stat label="Con errores (se omiten)" value={p.errors} tone={p.errors ? "red" : undefined} />
      </div>
      {!p.hasName || !p.hasDoc ? (
        <p role="alert" className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Indique arriba la columna del <b>nombre</b> y la de la <b>cédula o NIT</b> para continuar.</p>
      ) : null}
      {p.overLimit && <p role="alert" className="mb-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Con estas filas se superaría el límite de clientes del plan. Quite filas del archivo o amplíe el plan.</p>}
      <Panel title={`2. Vista previa (${shown.length ? "filas que requieren atención y algunas listas" : "primeras filas"})`} className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Fila</th><th className="pr-3">Nombre</th><th className="pr-3">Documento</th><th className="pr-3">Tipo</th><th className="pr-3">Ciudad</th><th>Estado</th></tr></thead>
            <tbody>
              {sample.map((r) => (
                <tr key={r.line} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-2 pr-3 tabular-nums text-slate-500">{r.line}</td>
                  <td className="pr-3 font-medium">{r.data?.name ?? "—"}</td>
                  <td className="pr-3 tabular-nums">{r.data ? `•••${r.data.docNumber.slice(-3)}` : "—"}</td>
                  <td className="pr-3">{r.data ? (r.data.kind === "natural" ? "Persona" : "Empresa") : "—"}</td>
                  <td className="pr-3">{r.data?.city ?? "—"}</td>
                  <td>
                    {r.existing ? <Badge>Ya existe</Badge> : r.status === "error" ? <Badge tone="red">Error</Badge> : r.status === "warning" ? <Badge tone="amber">Advertencia</Badge> : <Badge tone="green">Lista</Badge>}
                    {r.messages.map((m, i) => <div key={i} className="mt-0.5 text-xs text-slate-500">{m}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.total > sample.length && <p className="mt-3 text-xs text-slate-500">Se muestran las filas que requieren atención y algunas listas; las demás filas listas se crean igual.</p>}
      </Panel>
      <form action={applyImportAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="batch" value={q.batch} />
        <button className={btnPrimary} disabled={!p.hasName || !p.hasDoc || p.overLimit || p.ready === 0}>Crear {p.ready} clientes</button>
        <Link href="/clients/import" className={btnGhost}>Cancelar</Link>
        <span className="text-xs text-slate-500">Podrá deshacer la importación completa después.</span>
      </form>
    </Shell>
  );
}

import Link from "next/link";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { Dot, LinkButton, PageHeader, StageBadge } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { listClients } from "@/lib/clients/service";
import { deadlineText } from "@/lib/format";

export const dynamic = "force-dynamic";

const TABS = [
  ["all", "Todos"],
  ["natural", "Personas naturales"],
  ["empresa", "Empresas"],
  ["red", "🔴 Sin documentos"],
  ["mine", "Mis clientes"],
] as const;

const Query = z.object({ tab: z.enum(["all", "natural", "empresa", "red", "mine"]).catch("all"), q: z.string().max(100).catch(""), page: z.coerce.number().int().min(1).max(500).catch(1) });

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePermission("client:read");
  const raw = await searchParams;
  const q = Query.parse({ tab: raw.tab, q: Array.isArray(raw.q) ? raw.q[0] : raw.q, page: raw.page });
  const { rows, total } = await withTenant(s.user.firmId, (tx) => listClients(tx, s.user.firmId, { tab: q.tab, q: q.q, page: q.page, userId: s.user.id }));
  const pages = Math.max(1, Math.ceil(total / 50));
  const href = (over: Partial<{ tab: string; q: string; page: number }>) => {
    const p = new URLSearchParams();
    const v = { tab: q.tab, q: q.q, page: q.page, ...over };
    if (v.tab !== "all") p.set("tab", v.tab);
    if (v.q) p.set("q", v.q);
    if (v.page > 1) p.set("page", String(v.page));
    const qs = p.toString();
    return `/clients${qs ? `?${qs}` : ""}`;
  };
  return (
    <Shell session={s} active="/clients">
      <PageHeader
        title="Clientes"
        subtitle={`${total} ${total === 1 ? "cliente" : "clientes"}${q.q ? ` para “${q.q}”` : ""}`}
        actions={
          can(s, "client:write") && (
            <>
              {can(s, "import:run") && <LinkButton href="/clients/import">⬆ Importar CSV</LinkButton>}
              <LinkButton primary href="/clients/new">+ Nuevo cliente</LinkButton>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map(([k, label]) => (
            <Link key={k} href={href({ tab: k, page: 1 })} className={`rounded-full border px-3 py-1 text-sm ${q.tab === k ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {label}
            </Link>
          ))}
        </div>
        <form action="/clients" className="flex gap-2">
          {q.tab !== "all" && <input type="hidden" name="tab" value={q.tab} />}
          <input name="q" defaultValue={q.q} placeholder="Buscar por nombre o cédula / NIT" aria-label="Buscar" maxLength={100} className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <button className="rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50" type="submit">Buscar</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="w-8 px-4 py-3" />
              <th className="px-2 py-3">Cliente</th>
              <th className="px-2 py-3">Tipo</th>
              <th className="px-2 py-3">Docs</th>
              <th className="px-2 py-3">Declaración</th>
              <th className="px-2 py-3">Responsable</th>
              <th className="px-2 py-3">Fecha límite</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No hay clientes con ese filtro.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3"><Dot color={c.color} /></td>
                <td className="px-2 py-3">
                  <Link href={`/clients/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                  <div className="text-xs text-slate-500">•••{c.docHint}{c.city ? ` · ${c.city}` : ""}</div>
                </td>
                <td className="px-2 py-3">{c.kind === "natural" ? "Persona natural" : "Empresa"}</td>
                <td className="px-2 py-3 tabular-nums">{c.docsReceived}/4</td>
                <td className="px-2 py-3"><StageBadge stage={c.stage} /></td>
                <td className="px-2 py-3">{c.responsibleName ?? <span className="text-slate-400">Sin asignar</span>}</td>
                <td className="px-2 py-3 text-slate-600">{deadlineText(c.deadline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación">
          {q.page > 1 ? <Link className="font-semibold text-brand hover:underline" href={href({ page: q.page - 1 })}>← Anterior</Link> : <span />}
          <span className="text-slate-500">Página {q.page} de {pages}</span>
          {q.page < pages ? <Link className="font-semibold text-brand hover:underline" href={href({ page: q.page + 1 })}>Siguiente →</Link> : <span />}
        </nav>
      )}
    </Shell>
  );
}

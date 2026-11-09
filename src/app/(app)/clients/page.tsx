import Link from "next/link";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { Avatar, Dot, LinkButton, PageHeader, StageBadge } from "@/components/app-ui";
import { Icon } from "@/components/icons";
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
      <PageHeader help="clients"
        title="Clientes"
        subtitle={`${total} ${total === 1 ? "cliente" : "clientes"}${q.q ? ` para “${q.q}”` : ""}`}
        actions={
          can(s, "client:write") && (
            <>
              <LinkButton href="/board">Tablero</LinkButton>
              {can(s, "import:run") && <LinkButton href="/clients/import" icon="upload">Importar CSV</LinkButton>}
              <LinkButton primary href="/clients/new" icon="plus">Nuevo cliente</LinkButton>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="f-tabs">
          {TABS.map(([k, label]) => (
            <Link key={k} href={href({ tab: k, page: 1 })} className={`f-tab ${q.tab === k ? "active" : ""}`}>{label}</Link>
          ))}
        </div>
        <form action="/clients" className="flex gap-2">
          {q.tab !== "all" && <input type="hidden" name="tab" value={q.tab} />}
          <label className="search">
            <Icon name="search" />
            <input name="q" defaultValue={q.q} placeholder="Buscar por nombre o cédula / NIT" aria-label="Buscar" maxLength={100} />
          </label>
          <button className="btn btn-secondary" type="submit">Buscar</button>
        </form>
      </div>
      <div className="tbl-wrap">
        <table className="min-w-[820px]">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Cliente</th>
              <th>Cédula / NIT</th>
              <th>Responsable</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Documentos</th>
              <th>Fecha límite</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8}><div className="empty"><h3>No hay clientes con ese filtro</h3></div></td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Dot color={c.color} /></td>
                <td>
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5">
                    <Avatar name={c.name} size={32} />
                    <span>
                      <span className="block text-[13.5px] font-semibold hover:underline" style={{ color: "var(--t1)" }}>{c.name}</span>
                      <span className="block text-[11.5px]" style={{ color: "var(--t3)" }}>{c.city ?? "Sin ciudad"}</span>
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap text-[12.5px]" style={{ color: "var(--t3)" }}>•••{c.docHint}</td>
                <td>{c.responsibleName ? <span className="flex items-center gap-2"><Avatar name={c.responsibleName} size={24} />{c.responsibleName.split(" ")[0]}</span> : <span style={{ color: "var(--t4)" }}>Sin asignar</span>}</td>
                <td><span className={`badge ${c.kind === "natural" ? "b-brand" : "b-purple"}`}>{c.kind === "natural" ? "Persona natural" : "Empresa"}</span></td>
                <td><StageBadge stage={c.stage} /></td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="prog" style={{ width: 48, height: 4 }}><div className="prog-fill" style={{ width: `${c.docsReceived * 25}%`, background: c.docsReceived === 4 ? "var(--green)" : c.docsReceived === 0 ? "var(--red)" : "var(--amber)" }} /></div>
                    <span className="tabular-nums text-[12px]" style={{ color: "var(--t3)" }}>{c.docsReceived * 25}%</span>
                  </div>
                </td>
                <td className="whitespace-nowrap text-[12.5px]" style={{ color: "var(--t3)" }}>{deadlineText(c.deadline)}</td>
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

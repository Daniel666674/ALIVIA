import Link from "next/link";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { Avatar, Badge, PageHeader } from "@/components/app-ui";
import { Icon } from "@/components/icons";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { documentRows, pendingDocsCount } from "@/lib/clients/service";
import { DOC_LABEL } from "@/lib/clients/semaforo";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TABS = [["all", "Todos"], ["received", "Recibidos"], ["reviewed", "Revisados"], ["pending", "Pendientes"]] as const;
const Query = z.object({ tab: z.enum(["all", "received", "reviewed", "pending"]).catch("all"), q: z.string().max(100).catch(""), page: z.coerce.number().int().min(1).max(500).catch(1) });

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("document:read");
  const q = Query.parse(await searchParams);
  const { list, pending } = await withTenant(s.user.firmId, async (tx) => ({
    list: await documentRows(tx, s.user.firmId, { status: q.tab === "all" ? undefined : q.tab, q: q.q, page: q.page }),
    pending: await pendingDocsCount(tx, s.user.firmId),
  }));
  const pages = Math.max(1, Math.ceil(list.total / 50));
  const href = (o: Partial<{ tab: string; page: number }>) => {
    const p = new URLSearchParams();
    const v = { tab: q.tab, page: q.page, ...o };
    if (v.tab !== "all") p.set("tab", v.tab);
    if (q.q) p.set("q", q.q);
    if (v.page > 1) p.set("page", String(v.page));
    return `/documents${p.size ? `?${p}` : ""}`;
  };
  return (
    <Shell session={s} active="/documents">
      <PageHeader help="documents" title="Documentos" subtitle={`${pending} documentos pendientes de clientes sin presentar`} />
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <form action="/documents" className="search" style={{ minWidth: 260 }}>
          <Icon name="search" />
          <input name="q" defaultValue={q.q} placeholder="Buscar por cliente..." aria-label="Buscar" maxLength={100} />
          {q.tab !== "all" && <input type="hidden" name="tab" value={q.tab} />}
        </form>
        <div className="f-tabs">
          {TABS.map(([k, l]) => <Link key={k} href={href({ tab: k, page: 1 })} className={`f-tab ${q.tab === k ? "active" : ""}`}>{l}</Link>)}
        </div>
        <span className="ml-auto text-[12px]" style={{ color: "var(--t3)" }}>{list.total} resultado{list.total !== 1 ? "s" : ""}</span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Documento</th><th>Cliente</th><th>Fecha</th><th>Origen</th><th>Estado</th></tr></thead>
          <tbody>
            {list.rows.length === 0 && <tr><td colSpan={5}><div className="empty"><h3>Sin documentos</h3><p>Aquí aparecerán los documentos de sus clientes.</p></div></td></tr>}
            {list.rows.map((d) => (
              <tr key={d.id}>
                <td><div className="text-[13px] font-medium" style={{ color: "var(--t1)" }}>{DOC_LABEL[d.kind]}</div><div className="text-[11.5px]" style={{ color: "var(--t3)" }}>{d.kind === "dian_key" ? "Solo estado" : d.files ? `${d.files} archivo${d.files > 1 ? "s" : ""}` : "Sin archivo"}</div></td>
                <td><Link href={`/clients/${d.clientId}`} className="flex items-center gap-2 hover:underline"><Avatar name={d.clientName} size={22} /><span>{d.clientName}</span></Link></td>
                <td style={{ color: "var(--t3)" }}>{d.receivedAt ? fmtDateTime(d.receivedAt) : "—"}</td>
                <td><span className="badge b-gray">Manual</span></td>
                <td><Badge tone={d.status === "reviewed" ? "green" : d.status === "received" ? "sky" : "red"}>{d.status === "reviewed" ? "Revisado" : d.status === "received" ? "Recibido" : "Pendiente"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación">
          {q.page > 1 ? <Link className="font-semibold text-brand hover:underline" href={href({ page: q.page - 1 })}>← Anterior</Link> : <span />}
          <span style={{ color: "var(--t3)" }}>Página {q.page} de {pages}</span>
          {q.page < pages ? <Link className="font-semibold text-brand hover:underline" href={href({ page: q.page + 1 })}>Siguiente →</Link> : <span />}
        </nav>
      )}
    </Shell>
  );
}

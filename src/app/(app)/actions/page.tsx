import { withTenant } from "@/db/client";
import { PageHeader, Panel } from "@/components/app-ui";
import { NbaList } from "@/components/nba-list";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { loadNba } from "@/lib/clients/nba-view";
import { NBA_LABEL, type NbaKind } from "@/lib/nba";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const s = await requirePermission("client:read");
  const k = (await searchParams).k as NbaKind | undefined;
  const { items, total } = await withTenant(s.user.firmId, (tx) => loadNba(tx, s.user.firmId, { withTasks: can(s, "task:read") }));
  const counts = new Map<NbaKind, number>();
  for (const n of items) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const filtered = (k && k in NBA_LABEL ? items.filter((n) => n.kind === k) : items).slice(0, 80);
  return (
    <Shell session={s} active="/dashboard">
      <PageHeader title="Siguiente mejor acción" help="nba" subtitle={`${total} sugerencias ordenadas por urgencia · cada una explica por qué`} />
      <div className="f-tabs mb-4">
        <Link href="/actions" className={`f-tab ${!k ? "active" : ""}`}>Todas ({total})</Link>
        {(Object.keys(NBA_LABEL) as NbaKind[]).filter((x) => counts.get(x)).map((x) => (
          <Link key={x} href={`/actions?k=${x}`} className={`f-tab ${k === x ? "active" : ""}`}>{NBA_LABEL[x]} ({counts.get(x)})</Link>
        ))}
      </div>
      <Panel>
        {filtered.length === 0 ? <p className="py-6 text-center text-[13px]" style={{ color: "var(--t3)" }}>Nada pendiente por ahora. 🎉</p> : <NbaList items={filtered} canWrite={can(s, "client:write")} />}
      </Panel>
    </Shell>
  );
}

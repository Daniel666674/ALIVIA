import { withTenant } from "@/db/client";
import { Avatar, PageHeader, Stat } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { boardData, dashboardStats } from "@/lib/clients/service";
import { COLOR_LABEL } from "@/lib/clients/semaforo";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const s = await requirePermission("client:read");
  const { st, rows } = await withTenant(s.user.firmId, async (tx) => ({ st: await dashboardStats(tx, s.user.firmId), rows: await boardData(tx, s.user.firmId) }));
  const byPerson = new Map<string, { name: string; total: number; presented: number; docsOk: number; red: number }>();
  for (const r of rows) {
    const k = r.responsibleName ?? "Sin asignar";
    const e = byPerson.get(k) ?? { name: k, total: 0, presented: 0, docsOk: 0, red: 0 };
    e.total++;
    if (r.color === "green") e.presented++;
    if (r.received === 4) e.docsOk++;
    if (r.color === "red") e.red++;
    byPerson.set(k, e);
  }
  const pctDocs = st.total ? Math.round((rows.filter((r) => r.received === 4).length / st.total) * 100) : 0;
  const pctPres = st.total ? Math.round((st.presented / st.total) * 100) : 0;
  return (
    <Shell session={s} active="/reports">
      <PageHeader help="reports" title="Reportes" subtitle="Avance de la cartera de clientes" />
      <div className="mb-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="users" iconBg="#EDE9FE" iconColor="#4F46E5" label="Clientes" value={st.total} hint={`${st.natural} personas · ${st.empresas} empresas`} />
        <Stat icon="file" iconBg="#FEF3C7" iconColor="#F79009" label="Con documentos completos" value={`${pctDocs}%`} hint="4 de 4 documentos" />
        <Stat icon="check" iconBg="#DCFCE7" iconColor="#12B76A" label="Declaraciones presentadas" value={`${pctPres}%`} hint={`${st.presented} de ${st.total}`} hintTone="up" />
        <Stat icon="alert" iconBg="#FEE2E2" iconColor="#F04438" label="Sin ningún documento" value={st.colors.red} hint="clientes en rojo" hintTone={st.colors.red ? "down" : "up"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Responsable</th><th>Clientes</th><th>Docs completos</th><th>Presentadas</th><th>Sin documentos</th></tr></thead>
            <tbody>
              {byPerson.size === 0 && <tr><td colSpan={5}><div className="empty"><h3>Aún no hay datos</h3></div></td></tr>}
              {[...byPerson.values()].sort((a, b) => b.total - a.total).map((e) => (
                <tr key={e.name}><td><span className="flex items-center gap-2"><Avatar name={e.name} size={26} />{e.name}</span></td><td>{e.total}</td><td>{e.docsOk}</td><td>{e.presented}</td><td>{e.red}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="card">
          <div className="sec-hd"><div><h2 className="sec-title">Por estado</h2><p className="sec-sub">Semáforo de la cartera</p></div></div>
          {(["red", "yellow", "blue", "green"] as const).map((c) => {
            const p = st.total ? Math.round((st.colors[c] / st.total) * 100) : 0;
            const col = { red: "var(--red)", yellow: "#fbbf24", blue: "var(--blue)", green: "var(--green)" }[c];
            return (
              <div key={c} className="mb-3.5">
                <div className="mb-1 flex justify-between text-[12.5px]"><span>{COLOR_LABEL[c]}</span><b>{st.colors[c]} · {p}%</b></div>
                <div className="prog"><div className="prog-fill" style={{ width: `${p}%`, background: col }} /></div>
              </div>
            );
          })}
        </section>
      </div>
    </Shell>
  );
}

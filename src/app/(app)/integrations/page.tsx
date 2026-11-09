import { PageHeader } from "@/components/app-ui";
import { CatalogSection } from "@/components/catalog-cards";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { INTEGRATIONS, PORTAL_TIERS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const s = await requirePermission("dashboard:read");
  return (
    <Shell session={s} active="/integrations">
      <PageHeader help="integrations" title="Integraciones" subtitle={`${INTEGRATIONS.length} conexiones posibles con las herramientas de su firma · 0 conectadas en el demo`} />
      <CatalogSection items={INTEGRATIONS} />

      <section className="card mt-2">
        <div className="sec-hd"><div><h2 className="sec-title">Portal del cliente: cobrar el acceso a sus ~500 clientes</h2><p className="sec-sub">Una misma plataforma, tres niveles de servicio. Los precios los define la firma.</p></div></div>
        <div className="grid gap-3.5 lg:grid-cols-3">
          {PORTAL_TIERS.map((t) => (
            <div key={t.name} className="rounded-xl border p-4" style={{ borderColor: "var(--ws-border)" }}>
              <div className="text-[15px] font-semibold" style={{ color: "var(--t1)" }}>{t.name}</div>
              <div className="mb-2 text-[11.5px]" style={{ color: "var(--t3)" }}>{t.tag}</div>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px]" style={{ color: "var(--t2)" }}>{t.items.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className="mt-3 text-[12px]" style={{ color: "var(--t3)" }}>{t.grows}</p>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

import { PageHeader } from "@/components/app-ui";
import { CatalogSection } from "@/components/catalog-cards";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { AUTOMATIONS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const s = await requirePermission("dashboard:read");
  return (
    <Shell session={s} active="/automations">
      <PageHeader help="automations" title="Automatizaciones" subtitle={`${AUTOMATIONS.length} reglas que trabajan por usted · 0 activas en el demo`} />
      <div className="card mb-5 text-[13px]" style={{ background: "#f5f7ff", borderColor: "#c7d2fe", color: "var(--t2)" }}>
        Hoy el sistema <b>sugiere</b> la siguiente mejor acción y abre WhatsApp con el mensaje listo. Estas automatizaciones hacen ese trabajo solas. Marque <b>«Me interesa»</b> en las que más le ayudarían: así priorizamos qué se construye primero.
      </div>
      <CatalogSection items={AUTOMATIONS} />
    </Shell>
  );
}

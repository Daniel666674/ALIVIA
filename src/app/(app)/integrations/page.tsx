import { PageHeader } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const INTEGRATIONS = [
  ["G", "Gmail", "Importe facturas y soportes que llegan al correo", "#FDECEA", "#EA4335"],
  ["O", "Outlook", "Importe documentos desde Microsoft 365", "#E6F1FD", "#0072EF"],
  ["W", "WhatsApp", "Avisos al cliente cuando se presenta su declaración", "#E8F9EF", "#25D366"],
  ["D", "Google Drive", "Sincronice las carpetas de sus clientes", "#FEF5DC", "#F9AB00"],
  ["$", "Wompi", "Enlaces de pago y conciliación automática de honorarios", "#EDE9FE", "#4F46E5"],
  ["@", "Resend", "Envío de recordatorios por correo", "#F1F4F9", "#3C4A5C"],
];

export default async function IntegrationsPage() {
  const s = await requirePermission("dashboard:read");
  return (
    <Shell session={s} active="/integrations">
      <PageHeader help="integrations" title="Integraciones" subtitle="Conecte Alivia con las herramientas de su firma · 0 conectadas" />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map(([l, n, d, bg, c]) => (
          <div key={n} className="card">
            <div className="mb-3 flex items-center gap-3">
              <div className="int-logo" style={{ background: bg, color: c, width: 40, height: 40, borderRadius: 10, fontSize: 16 }}>{l}</div>
              <div className="flex-1 text-[14px] font-semibold" style={{ color: "var(--t1)" }}>{n}</div>
              <span className="badge b-gray">Próximamente</span>
            </div>
            <p className="text-[12.5px]" style={{ color: "var(--t3)" }}>{d}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

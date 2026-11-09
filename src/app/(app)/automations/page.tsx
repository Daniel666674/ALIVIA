import { PageHeader } from "@/components/app-ui";
import { Icon } from "@/components/icons";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const RULES = [
  ["Pedir documentos faltantes", "Si faltan documentos 10, 5 y 2 días antes de la fecha límite → correo al cliente con lo que falta y el enlace a su portal."],
  ["Avisar si el cliente no responde", "Si el cliente no sube nada en 5 días → tarea para su responsable."],
  ["Resumen diario del equipo", "Cada mañana a las 7:30 → correo con los pendientes del día a cada persona."],
];

export default async function AutomationsPage() {
  const s = await requirePermission("dashboard:read");
  return (
    <Shell session={s} active="/automations">
      <PageHeader help="automations" title="Automatizaciones" subtitle="Reglas que trabajan por usted, sin llamadas · 0 activas" />
      <div className="mb-4 grid gap-3.5">
        {RULES.map(([t, d]) => (
          <div key={t} className="card flex items-center gap-3.5">
            <div className="stat-icon !mb-0" style={{ background: "#F5F3FF", color: "#7C3AED" }}><Icon name="bolt" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold" style={{ color: "var(--t1)" }}>{t}</div>
              <div className="text-[12.5px]" style={{ color: "var(--t3)" }}>{d}</div>
            </div>
            <span className="badge b-gray">Próximamente</span>
          </div>
        ))}
      </div>
      <div className="card text-[13px]" style={{ background: "#f5f7ff", borderColor: "#c7d2fe", color: "var(--t2)" }}>
        Los recordatorios por correo se activan en la siguiente etapa del proyecto, cuando se configure el servicio de envío de correos.
      </div>
    </Shell>
  );
}

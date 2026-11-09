import { eq } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { firms, users } from "@/db/schema";
import { Badge, PageHeader, Panel } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { mfaRequired, requirePermission } from "@/lib/auth/session";
import { clientCount } from "@/lib/clients/service";

export const dynamic = "force-dynamic";

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const p = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-[13px]"><span>{label}</span><b>{used} de {limit}</b></div>
      <div className="prog"><div className="prog-fill" style={{ width: `${p}%`, background: p > 90 ? "var(--red)" : p > 70 ? "var(--amber)" : "var(--green)" }} /></div>
    </div>
  );
}

export default async function SettingsPage() {
  const s = await requirePermission("user:manage");
  const { firm, clients, seats } = await withTenant(s.user.firmId, async (tx) => ({
    firm: (await tx.select().from(firms).where(eq(firms.id, s.user.firmId)))[0]!,
    clients: await clientCount(tx, s.user.firmId),
    seats: (await tx.select({ id: users.id }).from(users).where(eq(users.status, "active"))).length,
  }));
  return (
    <Shell session={s} active="/settings">
      <PageHeader help="settings" title="Configuración" subtitle="Su firma, su plan y la seguridad de la cuenta" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Firma">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Nombre</div>
          <div className="mb-4 text-[14px] font-medium">{firm.name}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Plan</div>
          <div className="text-[14px] font-medium">Fase 1 · Lo esencial</div>
        </Panel>
        <Panel title="Uso del plan">
          <Usage label="Usuarios del equipo" used={seats} limit={firm.seatLimit} />
          <Usage label="Clientes" used={clients} limit={firm.clientLimit} />
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>Archivos PDF, JPG o PNG de hasta 4 MB por documento.</p>
        </Panel>
        <Panel title="Seguridad">
          <ul className="space-y-2.5 text-[13px]">
            <li className="flex items-center gap-2"><Badge tone={mfaRequired() ? "green" : "amber"}>{mfaRequired() ? "Obligatoria" : "Opcional"}</Badge> Verificación en dos pasos</li>
            <li className="flex items-center gap-2"><Badge tone="green">Activo</Badge> Datos de clientes y documentos cifrados</li>
            <li className="flex items-center gap-2"><Badge tone="green">Activo</Badge> Bloqueo tras intentos fallidos y sesiones que vencen solas</li>
            <li className="flex items-center gap-2"><Badge tone="green">Activo</Badge> Registro de auditoría que no se puede alterar</li>
          </ul>
        </Panel>
      </div>
    </Shell>
  );
}

import { withTenant } from "@/db/client";
import { PageHeader, Panel } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { firmUsers } from "@/lib/clients/service";
import { NewClientForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const s = await requirePermission("client:write");
  const people = await withTenant(s.user.firmId, (tx) => firmUsers(tx, s.user.firmId));
  return (
    <Shell session={s} active="/clients">
      <PageHeader title="Nuevo cliente" subtitle="Se crea con sus 4 documentos base pendientes" />
      <Panel>
        <NewClientForm people={people.map((p) => ({ id: p.id, name: p.name }))} />
      </Panel>
    </Shell>
  );
}

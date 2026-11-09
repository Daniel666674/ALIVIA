import "server-only";
import type { Tx } from "@/db/client";
import { listClients, firmName, getClient } from "@/lib/clients/service";
import type { Stage } from "@/lib/clients/semaforo";
import { addDaysIso, todayBogota } from "@/lib/format";

export type DocStatus = "pending" | "received" | "reviewed";
export type PortalModel = {
  sample: boolean;
  firm: string;
  clientId: string | null;
  name: string;
  kind: "natural" | "empresa";
  idHint: string;
  city: string;
  email: string;
  phone: string;
  responsible: string;
  deadline: string;
  feeCop: number;
  stage: Stage;
  docs: { bank_cert: DocStatus; rut: DocStatus; dian_key: DocStatus; id_doc: DocStatus };
  paid: boolean;
  today: string;
  filledFromExample: string[];
};

/**
 * Builds what the portal shows for one client. Whatever the real record lacks (no documents yet,
 * no fee, no deadline, no clients at all) is filled with believable example data so the demo never looks empty.
 */
export async function portalModel(tx: Tx, firmId: string, clientId: string | null): Promise<{ model: PortalModel; options: { id: string; name: string }[] }> {
  const firm = await firmName(tx, firmId);
  const list = await listClients(tx, firmId, { pageSize: 40 });
  const options = list.rows.map((c) => ({ id: c.id, name: c.name }));
  const pick = clientId ? options.find((o) => o.id === clientId)?.id ?? options[0]?.id : options[0]?.id;
  const real = pick ? await getClient(tx, firmId, pick) : null;
  const today = todayBogota();
  const filled: string[] = [];
  const fill = <T,>(v: T | null | undefined | "", example: T, label: string): T => {
    if (v === null || v === undefined || v === "") {
      filled.push(label);
      return example;
    }
    return v as T;
  };
  if (!real) {
    return {
      options,
      model: {
        sample: true, firm, clientId: null, name: "María Fernanda Rojas Díaz", kind: "natural", idHint: "042", city: "Bogotá",
        email: "maria.rojas@correo.com", phone: "310 555 0142", responsible: "Mónica Pérez", deadline: addDaysIso(today, 18), feeCop: 350_000,
        stage: "in_preparation", docs: { bank_cert: "received", rut: "reviewed", dian_key: "received", id_doc: "pending" }, paid: false, today, filledFromExample: ["cliente completo"],
      },
    };
  }
  const st = (k: string): DocStatus => (real.docs.find((d) => d.kind === k)?.status as DocStatus | undefined) ?? "pending";
  return {
    options,
    model: {
      sample: false, firm, clientId: real.id, name: real.name, kind: real.kind, idHint: real.docHint || "—",
      city: fill(real.city, "Bogotá", "ciudad"), email: fill(real.email, "cliente@correo.com", "correo"), phone: fill(real.phone, "310 555 0142", "teléfono"),
      responsible: fill(real.responsibleName, "Equipo contable", "responsable"), deadline: fill(real.deadline, addDaysIso(today, 18), "fecha límite"),
      feeCop: fill(real.feeCop, real.kind === "empresa" ? 1_200_000 : 350_000, "honorarios"), stage: real.stage,
      docs: { bank_cert: st("bank_cert"), rut: st("rut"), dian_key: st("dian_key"), id_doc: st("id_doc") }, paid: !!real.paidAt, today, filledFromExample: filled,
    },
  };
}

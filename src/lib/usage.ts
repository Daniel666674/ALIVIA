import { z } from "zod";

/** Replaces ids with ":id" and drops the query string so paths never carry client identifiers. */
export function normPath(p: string): string {
  const base = (p.split(/[?#]/)[0] ?? "/").slice(0, 120);
  return base.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id") || "/";
}

const Meta = z
  .record(z.string().regex(/^[a-z_]{1,20}$/), z.union([z.string().max(60), z.number().finite(), z.boolean()]))
  .refine((m) => Object.keys(m).length <= 8);

export const UsageBatch = z.object({
  events: z
    .array(z.object({ event: z.string().regex(/^[a-z_]+(\.[a-z_]+)?$/).max(40), path: z.string().max(200), meta: Meta.optional() }))
    .min(1)
    .max(30),
});
export type UsageEventIn = z.infer<typeof UsageBatch>["events"][number];

/** Pages the demo has, to show which ones nobody has opened yet. */
export const KNOWN_PAGES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/actions": "Siguiente mejor acción",
  "/clients": "Clientes",
  "/clients/:id": "Ficha de cliente",
  "/clients/import": "Importar clientes",
  "/documents": "Documentos",
  "/tasks": "Tareas",
  "/board": "Tablero",
  "/automations": "Automatizaciones",
  "/integrations": "Integraciones",
  "/reports": "Reportes",
  "/team": "Equipo",
  "/settings": "Configuración",
};

import "server-only";
import { desc, inArray, and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { auditLog, clients, tasks, users } from "@/db/schema";

const TEXT: Record<string, { text: string; dot: "green" | "brand" | "red" | "amber" | "blue" | "teal" }> = {
  "client.created": { text: "creó el cliente", dot: "green" },
  "client.updated": { text: "actualizó los datos de", dot: "blue" },
  "client.stage": { text: "cambió el estado de la declaración de", dot: "brand" },
  "client.deleted": { text: "eliminó un cliente", dot: "red" },
  "import.applied": { text: "importó clientes desde un archivo", dot: "teal" },
  "import.rolled_back": { text: "deshizo una importación", dot: "amber" },
  "document.uploaded": { text: "subió un documento", dot: "green" },
  "document.downloaded": { text: "descargó un documento", dot: "blue" },
  "document.status": { text: "cambió el estado de un documento de", dot: "brand" },
  "document.deleted": { text: "eliminó un documento", dot: "red" },
  "task.created": { text: "creó la tarea", dot: "brand" },
  "task.done": { text: "completó la tarea", dot: "green" },
  "task.deleted": { text: "eliminó una tarea", dot: "amber" },
};

export type ActivityItem = { id: number; who: string; verb: string; target: string | null; targetHref: string | null; at: Date; dot: string };

export async function recentActivity(tx: Tx, firmId: string, limit = 7): Promise<ActivityItem[]> {
  const rows = await tx
    .select({ id: auditLog.id, action: auditLog.action, at: auditLog.at, resourceType: auditLog.resourceType, resourceId: auditLog.resourceId, who: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.firmId, firmId), inArray(auditLog.action, Object.keys(TEXT))))
    .orderBy(desc(auditLog.at))
    .limit(limit);
  const clientIds = rows.filter((r) => r.resourceType === "client" && r.resourceId).map((r) => r.resourceId!);
  const taskIds = rows.filter((r) => r.resourceType === "task" && r.resourceId).map((r) => r.resourceId!);
  const cn = clientIds.length ? await tx.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds)) : [];
  const tn = taskIds.length ? await tx.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds)) : [];
  return rows.map((r) => {
    const t = TEXT[r.action]!;
    const c = r.resourceType === "client" ? cn.find((x) => x.id === r.resourceId) : undefined;
    const k = r.resourceType === "task" ? tn.find((x) => x.id === r.resourceId) : undefined;
    return {
      id: r.id,
      who: r.who ?? "Sistema",
      verb: t.text,
      target: c?.name ?? (k ? `“${k.title}”` : null),
      targetHref: c ? `/clients/${c.id}` : null,
      at: r.at,
      dot: t.dot,
    };
  });
}

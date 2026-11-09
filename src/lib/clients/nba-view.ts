import type { Tx } from "@/db/client";
import { listTasks } from "@/lib/clients/tasks";
import { clientPhones, firmName, nbaClients } from "@/lib/clients/service";
import { DOC_LABEL } from "@/lib/clients/semaforo";
import { computeNba, waLink, waMessage, waNumber, type Nba } from "@/lib/nba";
import { todayBogota } from "@/lib/format";

export type NbaView = Nba & { wa: { href: string | null } | null };

/** Computes the ranked actions and prepares the (manual) WhatsApp links. Phones are decrypted only for the rows returned. */
export async function loadNba(tx: Tx, firmId: string, opts: { limit?: number; onlyClientId?: string; withTasks?: boolean } = {}): Promise<{ items: NbaView[]; total: number }> {
  const [cs, ts, firm] = await Promise.all([
    nbaClients(tx, firmId, opts.onlyClientId),
    opts.withTasks === false || opts.onlyClientId ? Promise.resolve([]) : listTasks(tx, firmId, { status: "open" }),
    firmName(tx, firmId),
  ]);
  const all = computeNba(cs, ts.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, clientId: t.clientId, clientName: t.clientName, assigneeId: t.assigneeId })), { today: todayBogota() });
  const shown = opts.limit ? all.slice(0, opts.limit) : all;
  const ids = [...new Set(shown.filter((n) => n.whatsapp && n.clientId).map((n) => n.clientId!))];
  const phones = await clientPhones(tx, firmId, ids);
  const byId = new Map(cs.map((c) => [c.id, c]));
  const items = shown.map((n): NbaView => {
    if (!n.whatsapp || !n.clientId) return { ...n, wa: null };
    const c = byId.get(n.clientId)!;
    const num = waNumber(phones.get(n.clientId));
    if (!num) return { ...n, wa: { href: null } };
    const text = waMessage(n.whatsapp, { name: c.name, kind: c.kind, firm, missing: c.pendingKinds.map((k) => DOC_LABEL[k as keyof typeof DOC_LABEL]), fee: c.feeCop });
    return { ...n, wa: { href: waLink(num, text) } };
  });
  return { items, total: all.length };
}

/** Ready-made WhatsApp links for one client (notify / collect), or null when there is no valid phone. */
export async function waLinksFor(tx: Tx, firmId: string, clientId: string): Promise<{ request: string | null; notify: string | null; collect: string | null }> {
  const [[c], phones, firm] = await Promise.all([nbaClients(tx, firmId, clientId), clientPhones(tx, firmId, [clientId]), firmName(tx, firmId)]);
  const num = waNumber(phones.get(clientId));
  if (!c || !num) return { request: null, notify: null, collect: null };
  const base = { name: c.name, kind: c.kind, firm, fee: c.feeCop };
  const missing = c.pendingKinds.map((k) => DOC_LABEL[k as keyof typeof DOC_LABEL]);
  return { request: waLink(num, waMessage("request_docs", { ...base, missing })), notify: waLink(num, waMessage("notify", base)), collect: waLink(num, waMessage("collect", base)) };
}

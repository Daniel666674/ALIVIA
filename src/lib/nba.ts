import { DOC_LABEL } from "@/lib/clients/semaforo";

/**
 * Next Best Action engine: deterministic and explainable (every action carries its reason).
 * Pure function: no I/O, so it is trivially testable.
 */
export type NbaKind = "collect" | "notify" | "request_docs" | "present" | "prepare" | "review_docs" | "deliver" | "task_due" | "assign";

export type NbaClient = {
  id: string;
  name: string;
  kind: "natural" | "empresa";
  stage: "pending" | "in_preparation" | "in_review" | "presented";
  deadline: string | null; // YYYY-MM-DD
  responsibleId: string | null;
  docsReceived: number;
  toReview: number; // received but not yet reviewed
  pendingKinds: string[]; // doc kinds still pending
  lastRemindedAt: Date | null;
  notifiedAt: Date | null;
  deliveredAt: Date | null;
  paidAt: Date | null;
  feeCop: number | null;
};

export type NbaTask = { id: string; title: string; dueDate: string | null; clientId: string | null; clientName: string | null; assigneeId: string | null };

export type Nba = {
  key: string;
  kind: NbaKind;
  score: number;
  clientId: string | null;
  clientName: string | null;
  title: string;
  reason: string;
  /** Which one-click helper applies: open WhatsApp with a ready message, or just go to the client. */
  whatsapp?: "request_docs" | "notify" | "collect";
  taskId?: string;
};

export const NBA_LABEL: Record<NbaKind, string> = {
  collect: "Cobrar honorarios",
  notify: "Avisar que se presentó",
  request_docs: "Pedir documentos",
  present: "Presentar declaración",
  prepare: "Preparar declaración",
  review_docs: "Revisar documentos",
  deliver: "Entregar carpeta física",
  task_due: "Tarea vencida",
  assign: "Asignar responsable",
};

const DAY = 86_400_000;
const dayDiff = (iso: string, today: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
const ago = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);
const cop = (n: number) => `$${n.toLocaleString("es-CO")}`;

/** 0–40 points: the closer (or more overdue) the deadline, the more urgent. */
function urgency(deadline: string | null, today: string): { pts: number; text: string | null } {
  if (!deadline) return { pts: 0, text: null };
  const d = dayDiff(deadline, today);
  if (d < 0) return { pts: 40, text: `vencida hace ${-d} d` };
  if (d === 0) return { pts: 40, text: "vence hoy" };
  if (d <= 3) return { pts: 32, text: `vence en ${d} d` };
  if (d <= 7) return { pts: 20, text: `vence en ${d} d` };
  if (d <= 14) return { pts: 10, text: `vence en ${d} d` };
  return { pts: 0, text: null };
}

export function computeNba(clients: NbaClient[], tasks: NbaTask[], opts: { today: string; now?: Date }): Nba[] {
  const now = opts.now ?? new Date();
  const out: Nba[] = [];
  const push = (n: Nba) => out.push(n);

  for (const c of clients) {
    const u = urgency(c.deadline, opts.today);
    const dl = u.text ? `${u.text.charAt(0).toUpperCase()}${u.text.slice(1)}` : null;
    const missing = c.pendingKinds.map((k) => DOC_LABEL[k as keyof typeof DOC_LABEL] ?? k);

    if (c.stage === "presented") {
      if (c.feeCop && !c.paidAt) {
        push({ key: `collect:${c.id}`, kind: "collect", score: c.notifiedAt ? 76 : 70, clientId: c.id, clientName: c.name, whatsapp: "collect",
          title: `Cobrar honorarios a ${c.name}`, reason: `Declaración presentada · honorarios de ${cop(c.feeCop)} sin pagar${c.lastRemindedAt ? ` · último aviso hace ${ago(c.lastRemindedAt, now)} d` : ""}` });
      }
      if (!c.notifiedAt) {
        push({ key: `notify:${c.id}`, kind: "notify", score: 72, clientId: c.id, clientName: c.name, whatsapp: "notify",
          title: `Avisar a ${c.name} que se presentó su declaración`, reason: "Declaración presentada y el cliente aún no ha sido avisado" });
      }
      if (!c.deliveredAt) {
        push({ key: `deliver:${c.id}`, kind: "deliver", score: 55, clientId: c.id, clientName: c.name,
          title: `Entregar la carpeta física de ${c.name}`, reason: "Declaración presentada · la carpeta aún no se ha entregado" });
      }
      continue;
    }

    if (c.stage === "in_review") {
      push({ key: `present:${c.id}`, kind: "present", score: 65 + u.pts, clientId: c.id, clientName: c.name,
        title: `Presentar la declaración de ${c.name}`, reason: ["En revisión, lista para presentar", dl].filter(Boolean).join(" · ") });
      continue;
    }

    if (c.stage === "in_preparation") continue; // someone is already on it

    // stage === "pending"
    if (c.docsReceived < 4) {
      const reminded = c.lastRemindedAt ? ago(c.lastRemindedAt, now) : null;
      if (reminded !== null && reminded < 2) continue; // don't nag: contacted in the last 2 days
      const follow = reminded !== null;
      push({
        key: `docs:${c.id}`, kind: "request_docs", whatsapp: "request_docs", clientId: c.id, clientName: c.name,
        score: 40 + u.pts + (c.docsReceived === 0 ? 10 : 4) + (follow ? 6 : 0),
        title: `${follow ? "Insistir con" : "Pedir documentos a"} ${c.name}`,
        reason: [dl, `faltan ${missing.join(", ")}`, follow ? `último recordatorio hace ${reminded} d` : "sin recordatorio previo"].filter(Boolean).join(" · "),
      });
    } else {
      push({ key: `prep:${c.id}`, kind: "prepare", score: 60 + u.pts, clientId: c.id, clientName: c.name,
        title: `Preparar la declaración de ${c.name}`, reason: ["Documentos completos (4 de 4)", dl].filter(Boolean).join(" · ") });
    }
    if (c.toReview > 0) {
      push({ key: `review:${c.id}`, kind: "review_docs", score: 45 + Math.round(u.pts / 2), clientId: c.id, clientName: c.name,
        title: `Revisar ${c.toReview} documento${c.toReview > 1 ? "s" : ""} de ${c.name}`, reason: "Recibidos y todavía sin revisar" });
    }
    if (!c.responsibleId) {
      push({ key: `assign:${c.id}`, kind: "assign", score: 25 + Math.round(u.pts / 2), clientId: c.id, clientName: c.name,
        title: `Asignar un responsable a ${c.name}`, reason: ["Nadie tiene este cliente a cargo", dl].filter(Boolean).join(" · ") });
    }
  }

  for (const t of tasks) {
    if (!t.dueDate) continue;
    const d = dayDiff(t.dueDate, opts.today);
    if (d > 0) continue;
    push({ key: `task:${t.id}`, kind: "task_due", score: 80 + Math.min(10, -d), clientId: t.clientId, clientName: t.clientName, taskId: t.id,
      title: t.title, reason: d === 0 ? "La tarea vence hoy" : `La tarea venció hace ${-d} d` });
  }

  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es"));
}

/** Normalizes a Colombian mobile number for wa.me (57 + 10 digits). */
export function waNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  if (digits.length >= 11 && digits.length <= 15 && raw.trim().startsWith("+")) return digits;
  return null;
}

export function waMessage(kind: "request_docs" | "notify" | "collect", p: { name: string; kind: "natural" | "empresa"; firm: string; missing?: string[]; fee?: number | null }): string {
  const hello = p.kind === "natural" ? `Hola ${p.name.split(/\s+/)[0]}` : `Hola, equipo de ${p.name}`;
  if (kind === "request_docs") {
    const list = p.missing?.length ? p.missing.join(", ") : "algunos documentos";
    return `${hello}, le escribimos de ${p.firm}. Para preparar su declaración nos faltan: ${list}. ¿Nos los puede enviar? Muchas gracias.`;
  }
  if (kind === "notify") return `${hello}, le informamos que su declaración ya fue presentada ante la DIAN. En los próximos días le entregamos su carpeta. Gracias por confiar en ${p.firm}.`;
  return `${hello}, le recordamos el pago de los honorarios por su declaración${p.fee ? ` (${cop(p.fee)})` : ""}. ¿Nos confirma cuándo podría hacerlo? Muchas gracias. — ${p.firm}`;
}

export const waLink = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

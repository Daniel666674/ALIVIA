import Link from "next/link";
import type { NbaView } from "@/lib/clients/nba-view";
import { NBA_LABEL, type NbaKind } from "@/lib/nba";
import { WhatsAppButton } from "@/components/whatsapp-button";

const TONE: Record<NbaKind, string> = { collect: "b-teal", notify: "b-green", request_docs: "b-amber", present: "b-red", prepare: "b-blue", review_docs: "b-blue", deliver: "b-gray", task_due: "b-red", assign: "b-gray" };
const WA_LABEL = { request_docs: "Pedir por WhatsApp", notify: "Avisar por WhatsApp", collect: "Cobrar por WhatsApp" } as const;

export function NbaList({ items, canWrite, compact = false }: { items: NbaView[]; canWrite: boolean; compact?: boolean }) {
  return (
    <div>
      {items.map((n, i) => (
        <div key={n.key} className="nba-row">
          <span className="nba-rank">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${TONE[n.kind] ?? "b-gray"}`}>{NBA_LABEL[n.kind]}</span>
              <span className="truncate text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{n.title}</span>
            </div>
            <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--t3)" }}>{n.reason}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canWrite && n.whatsapp && n.clientId && n.wa && <WhatsAppButton href={n.wa.href} clientId={n.clientId} via={n.whatsapp} label={compact ? "WhatsApp" : WA_LABEL[n.whatsapp]} />}
            {n.clientId && <Link href={`/clients/${n.clientId}`} className="btn btn-secondary btn-sm">Abrir</Link>}
          </div>
        </div>
      ))}
    </div>
  );
}

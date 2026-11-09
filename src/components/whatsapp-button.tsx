"use client";

import { useTransition } from "react";
import { recordContactAction } from "@/app/(app)/clients/actions";

/** Opens WhatsApp with the message already written. Nothing is sent automatically: a person presses "enviar". */
export function WhatsAppButton({ href, clientId, via, label = "WhatsApp" }: { href: string | null; clientId: string; via: "request_docs" | "notify" | "collect"; label?: string }) {
  const [, start] = useTransition();
  if (!href) return <span className="btn btn-secondary btn-sm wa-btn" aria-disabled="true" title="Este cliente no tiene celular registrado">Sin celular</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-sm wa-btn"
      data-track={`wa.${via}`}
      onClick={() => start(() => { void recordContactAction(clientId, via); })}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6-.3.3c-.1.2-.2.3 0 .6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4Z" /></svg>
      {label}
    </a>
  );
}

import "server-only";
import { headers } from "next/headers";

export type RequestInfo = { ip: string | null; userAgent: string | null };

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

/** Client IP as set by Vercel's edge (not spoofable by the client). */
export async function requestInfo(): Promise<RequestInfo> {
  const h = await headers();
  const raw = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ip = raw && (IPV4.test(raw) || (raw.includes(":") && IPV6.test(raw))) ? raw : null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

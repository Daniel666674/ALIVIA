import "server-only";
import { withSystem } from "@/db/client";
import { audit } from "@/lib/audit";
import type { RequestInfo } from "./context";
import { rateLimit, type LimitName } from "@/lib/rate-limit";

export type FormState = { error?: string } | undefined;

/** Applies a rate limit; on denial records an audit event and returns a user-facing message. */
export async function limitOrMessage(name: LimitName, key: string, req: RequestInfo, firm?: { firmId: string; userId: string }): Promise<string | null> {
  const r = await rateLimit(name, key);
  if (r.ok) return null;
  await withSystem((tx) =>
    audit(tx, { action: "auth.rate_limited", firmId: firm?.firmId, userId: firm?.userId, req, meta: { limit: name } }),
  );
  return `Demasiados intentos. Intenta de nuevo en ${Math.ceil(r.retryAfterSec / 60)} min.`;
}


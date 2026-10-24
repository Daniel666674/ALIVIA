import "server-only";
import { auditLog } from "@/db/schema";
import type { Tx } from "@/db/client";
import type { RequestInfo } from "@/lib/auth/context";

export type AuditAction =
  | "auth.login.success" | "auth.login.failure" | "auth.login.locked" | "auth.logout"
  | "auth.mfa.success" | "auth.mfa.failure" | "auth.mfa.enrolled" | "auth.recovery.used"
  | "auth.password.changed" | "auth.session.revoked" | "auth.rate_limited";

export async function audit(
  tx: Tx,
  e: {
    action: AuditAction;
    firmId?: string | null;
    userId?: string | null;
    resourceType?: string;
    resourceId?: string;
    req?: RequestInfo;
    /** Non-sensitive facts only. Never passwords, tokens, codes, or raw emails. */
    meta?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLog).values({
    firmId: e.firmId ?? null,
    userId: e.userId ?? null,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    ip: e.req?.ip ?? null,
    userAgent: e.req?.userAgent ?? null,
    meta: e.meta ?? {},
  });
}

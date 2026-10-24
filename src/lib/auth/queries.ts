import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { sessions } from "@/db/schema";
import type { ResolvedSession } from "./session-core";

// NOTE: files marked "use server" expose every export as a public endpoint. Reads that take
// identity arguments live here (server-only), and derive identity from the verified session.
export function listMySessions(s: ResolvedSession) {
  return withTenant(s.user.firmId, (tx) =>
    tx
      .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(and(eq(sessions.userId, s.user.id), isNull(sessions.revokedAt))),
  );
}

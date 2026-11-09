import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { audit } from "@/lib/audit";
import { requestInfo } from "@/lib/auth/context";
import { getSession, nextStep } from "@/lib/auth/session";
import { can } from "@/lib/auth/session-core";
import { readFile } from "@/lib/clients/documents";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const deny = (status: number) => new NextResponse(null, { status, headers: { "cache-control": "no-store" } });

/** Authenticated, permission-checked, rate-limited, audited download. Always sent as an attachment. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || nextStep(s)) return deny(401);
  if (!can(s, "document:read")) return deny(403);
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) return deny(404);
  const limit = await rateLimit("vaultDownload", s.user.id);
  if (!limit.ok) return new NextResponse("Demasiadas descargas. Intente en un momento.", { status: 429, headers: { "retry-after": String(limit.retryAfterSec), "cache-control": "no-store" } });
  const req = await requestInfo();
  const file = await withTenant(s.user.firmId, async (tx) => {
    const f = await readFile(tx, s.user.firmId, id.data);
    if (f) await audit(tx, { action: "document.downloaded", firmId: s.user.firmId, userId: s.user.id, resourceType: "document", resourceId: id.data, req });
    return f;
  });
  if (!file) return deny(404);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

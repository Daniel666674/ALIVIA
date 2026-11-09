import { NextResponse } from "next/server";
import { withTenant } from "@/db/client";
import { usageEvents } from "@/db/schema";
import { env } from "@/env";
import { getSession, nextStep } from "@/lib/auth/session";
import { normPath, UsageBatch } from "@/lib/usage";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
const res = (status: number) => new NextResponse(null, { status, headers: { "cache-control": "no-store" } });

/** Telemetry ingest: authenticated, same-origin, small, validated, throttled. Stores no client data. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || nextStep(s)) return res(401);
  if (env().USAGE_EXCLUDE_EMAILS.includes(s.user.email.toLowerCase())) return res(204); // developers are not measured
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return res(403);
  const now = Date.now();
  const recent = (hits.get(s.user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return res(429);
  hits.set(s.user.id, [...recent, now]);
  const raw = await req.text();
  if (raw.length > 12_000) return res(413);
  let body;
  try {
    body = UsageBatch.safeParse(JSON.parse(raw));
  } catch {
    return res(400);
  }
  if (!body.success) return res(400);
  await withTenant(s.user.firmId, (tx) =>
    tx.insert(usageEvents).values(body.data.events.map((e) => ({ firmId: s.user.firmId, userId: s.user.id, event: e.event, path: normPath(e.path), meta: e.meta ?? {} }))),
  );
  return res(204);
}

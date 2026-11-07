import { beforeEach, describe, expect, it } from "vitest";
import { LIMITS, rateLimit, resetMemoryLimits } from "@/lib/rate-limit";

beforeEach(resetMemoryLimits);

describe("rate limiting (memory fallback)", () => {
  it("allows up to the max, then blocks with Retry-After", async () => {
    for (let i = 0; i < LIMITS.loginAccount.max; i++) expect((await rateLimit("loginAccount", "k")).ok).toBe(true);
    const r = await rateLimit("loginAccount", "k");
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
  it("buckets are independent per key and per limit", async () => {
    for (let i = 0; i < LIMITS.mfa.max; i++) await rateLimit("mfa", "a");
    expect((await rateLimit("mfa", "a")).ok).toBe(false);
    expect((await rateLimit("mfa", "b")).ok).toBe(true);
    expect((await rateLimit("loginIp", "a")).ok).toBe(true);
  });
});

import { afterAll, beforeAll } from "vitest";
import { dbLimit } from "@/lib/rate-limit";
import { rateLimitHits } from "@/db/schema";
import { createTestDb } from "./helpers/db";

describe("rate limiting (Postgres store)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => { t = await createTestDb(); });
  afterAll(() => t.close());

  it("enforces the window across calls and isolates keys", async () => {
    for (let i = 0; i < LIMITS.mfa.max; i++) expect((await t.system((tx) => dbLimit(tx, "mfa", "u1"))).ok).toBe(true);
    const blocked = await t.system((tx) => dbLimit(tx, "mfa", "u1"));
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect((await t.system((tx) => dbLimit(tx, "mfa", "u2"))).ok).toBe(true);
  });
  it("lets requests through again once hits age out", async () => {
    await t.admin.update(rateLimitHits).set({ at: new Date(Date.now() - 11 * 60_000) });
    expect((await t.system((tx) => dbLimit(tx, "mfa", "u1"))).ok).toBe(true);
  });
  it("is not reachable without system scope (RLS)", async () => {
    const rows = await t.tenant("00000000-0000-0000-0000-000000000000", (tx) => tx.select().from(rateLimitHits));
    expect(rows).toHaveLength(0);
  });
});

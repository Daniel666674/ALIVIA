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

import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

export const LIMITS = {
  /** Per IP + email: slows targeted guessing. */
  loginAccount: { max: 5, windowSec: 15 * 60 },
  /** Per IP: slows credential stuffing across many emails. */
  loginIp: { max: 20, windowSec: 60 * 60 },
  mfa: { max: 5, windowSec: 10 * 60 },
  passwordChange: { max: 5, windowSec: 15 * 60 },
  general: { max: 100, windowSec: 60 },
  vaultDownload: { max: 30, windowSec: 60 },
  csvImport: { max: 5, windowSec: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;
export type LimitResult = { ok: boolean; retryAfterSec: number };

const memory = new Map<string, number[]>();

function memoryLimit(name: LimitName, key: string): LimitResult {
  const { max, windowSec } = LIMITS[name];
  const now = Date.now();
  const k = `${name}:${key}`;
  const hits = (memory.get(k) ?? []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= max) {
    memory.set(k, hits);
    return { ok: false, retryAfterSec: Math.ceil((hits[0]! + windowSec * 1000 - now) / 1000) };
  }
  hits.push(now);
  memory.set(k, hits);
  return { ok: true, retryAfterSec: 0 };
}

const limiters = new Map<LimitName, Ratelimit>();
function upstash(name: LimitName): Ratelimit {
  let l = limiters.get(name);
  if (!l) {
    const e = env();
    l = new Ratelimit({
      redis: new Redis({ url: e.UPSTASH_REDIS_REST_URL!, token: e.UPSTASH_REDIS_REST_TOKEN! }),
      limiter: Ratelimit.slidingWindow(LIMITS[name].max, `${LIMITS[name].windowSec} s`),
      prefix: `alivia:rl:${name}`,
    });
    limiters.set(name, l);
  }
  return l;
}

/**
 * Check + consume one hit. Fails CLOSED: if the store is unreachable, the request is denied.
 * Without Upstash configured (dev/test only — production env validation requires it) falls back to memory.
 */
export async function rateLimit(name: LimitName, key: string): Promise<LimitResult> {
  const e = env();
  if (!e.UPSTASH_REDIS_REST_URL) return memoryLimit(name, key);
  try {
    const r = await upstash(name).limit(key);
    return { ok: r.success, retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  } catch {
    return { ok: false, retryAfterSec: 30 };
  }
}

export function resetMemoryLimits() {
  memory.clear();
}

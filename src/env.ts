import "server-only";
import { z } from "zod";

const b64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 random bytes, base64-encoded");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    FIELD_KEY_CURRENT: z.coerce.number().int().positive().default(1),
    FIELD_KEY_1: b64Key,
    FIELD_KEY_2: b64Key.optional(),
    BLIND_INDEX_KEY: b64Key,
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    APP_URL: z.string().url().default("http://localhost:3000"),
  })
  .superRefine((e, ctx) => {
    // Fail closed: production must never run without a shared rate-limit store.
    if (e.NODE_ENV === "production" && (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({ code: "custom", message: "Upstash Redis is required in production (rate limiting)" });
    }
    if (e.NODE_ENV === "production" && !e.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", message: "APP_URL must be https in production" });
    }
    const keyVar = `FIELD_KEY_${e.FIELD_KEY_CURRENT}` as keyof typeof e;
    if (!e[keyVar]) {
      ctx.addIssue({ code: "custom", message: `FIELD_KEY_CURRENT=${e.FIELD_KEY_CURRENT} but ${keyVar} is not set` });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated env, parsed lazily so `next build` doesn't need runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Log variable names only, never values.
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

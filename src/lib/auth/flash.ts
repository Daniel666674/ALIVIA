import "server-only";
import { cookies } from "next/headers";
import { env } from "@/env";
import { decryptField, encryptField } from "@/lib/crypto";

// One-time hand-off of freshly generated recovery codes across a redirect.
// Encrypted + HttpOnly + 2 min TTL; the codes themselves are only ever stored hashed in the DB.
const name = () => (env().NODE_ENV === "production" ? "__Host-alivia_flash" : "alivia_flash");
const aad = (userId: string) => `flash.recovery:${userId}`;

export async function setRecoveryFlash(userId: string, codes: string[]) {
  (await cookies()).set(name(), encryptField(JSON.stringify(codes), aad(userId)), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 120,
  });
}

export async function readRecoveryFlash(userId: string): Promise<string[] | null> {
  const v = (await cookies()).get(name())?.value;
  if (!v) return null;
  try {
    const parsed: unknown = JSON.parse(decryptField(v, aad(userId)));
    return Array.isArray(parsed) && parsed.every((c) => typeof c === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearRecoveryFlash() {
  (await cookies()).delete(name());
}

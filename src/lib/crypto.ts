import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Field-level encryption: AES-256-GCM.
 * Format: `v<keyVersion>.<iv b64url>.<ciphertext+tag b64url>`
 * AAD binds a ciphertext to its location (e.g. "users.totp_secret:<id>") so a value copied
 * to another row/column fails to decrypt.
 */

function fieldKey(version: number): Buffer {
  const e = env();
  const raw = e[`FIELD_KEY_${version}` as "FIELD_KEY_1" | "FIELD_KEY_2"];
  if (!raw) throw new Error(`Encryption key version ${version} not configured`);
  return Buffer.from(raw, "base64");
}

export function encryptField(plaintext: string, aad: string): string {
  const version = env().FIELD_KEY_CURRENT;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey(version), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}.${iv.toString("base64url")}.${Buffer.concat([ct, tag]).toString("base64url")}`;
}

export function decryptField(payload: string, aad: string): string {
  const [v, ivB64, dataB64, extra] = payload.split(".");
  if (!v || !ivB64 || !dataB64 || extra !== undefined || !/^v\d+$/.test(v)) {
    throw new Error("Malformed ciphertext");
  }
  const data = Buffer.from(dataB64, "base64url");
  if (data.length < 16) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(Number(v.slice(1))), Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}

/** Deterministic keyed hash for equality search on encrypted fields (e.g. NIT). */
export function blindIndex(value: string, purpose: string): string {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return createHmac("sha256", Buffer.from(env().BLIND_INDEX_KEY, "base64"))
    .update(`${purpose}\0${normalized}`)
    .digest("base64url");
}

/** SHA-256 of a high-entropy random token (sessions, recovery codes). Not for passwords. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

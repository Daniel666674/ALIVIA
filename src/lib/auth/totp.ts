import "server-only";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";

const ISSUER = "Alivia";
const PERIOD = 30;

function totp(secretBase32: string, label: string) {
  return new TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: Secret.fromBase32(secretBase32) });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export async function totpQrDataUrl(secretBase32: string, email: string): Promise<string> {
  return QRCode.toDataURL(totp(secretBase32, email).toString(), { margin: 1, width: 220 });
}

/**
 * Returns the matched time-step, or null. Window of ±1 step tolerates clock drift.
 * Caller must reject steps <= the user's stored `totpLastStep` (replay protection).
 */
export function verifyTotp(secretBase32: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secretBase32, "x").validate({ token: code, window: 1, timestamp: now });
  if (delta === null) return null;
  return Math.floor(now / 1000 / PERIOD) + delta;
}

export function currentTotp(secretBase32: string, now = Date.now()): string {
  return totp(secretBase32, "x").generate({ timestamp: now });
}

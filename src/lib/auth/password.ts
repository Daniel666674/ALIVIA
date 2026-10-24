import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP minimum for Argon2id: m=19 MiB, t=2, p=1 (library default algorithm is Argon2id).
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/**
 * Verify against a throwaway hash when the account doesn't exist, so response time doesn't
 * reveal whether an email is registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword("alivia-dummy-password-for-timing");
  await verifyPassword(await dummy, password);
}

const COMMON = new Set([
  "password1234", "123456789012", "qwertyuiop12", "contrasena123", "contraseña123",
  "administrador", "colombia2024", "colombia2025", "colombia2026", "alivia123456",
  "bienvenido123", "iloveyou1234", "letmein12345", "welcome12345",
]);

/** Returns an error message (Spanish, user-facing) or null if acceptable. */
export function passwordPolicyError(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < 12) return "La contraseña debe tener al menos 12 caracteres.";
  if (password.length > 128) return "La contraseña no puede superar 128 caracteres.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Esa contraseña es demasiado común.";
  if (/^(.)\1+$/.test(password)) return "La contraseña no puede repetir un solo carácter.";
  if (new Set(password).size < 6) return "Usa más variedad de caracteres.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "La contraseña no puede contener tu correo.";
  return null;
}

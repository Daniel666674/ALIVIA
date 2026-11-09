import type { CLIENT_KINDS } from "@/db/schema";

export type ClientKind = (typeof CLIENT_KINDS)[number];

const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** DIAN check digit (dígito de verificación) for a NIT body (digits only, up to 15). */
export function nitCheckDigit(body: string): number | null {
  if (!/^\d{1,15}$/.test(body)) return null;
  const digits = body.split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i]!, 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

export type ParsedDoc = { number: string; dv: string | null; dvOk: boolean | null };

/**
 * Normalizes "900.123.456-7", "900123456 7", "52.123.456" -> number without separators.
 * A trailing "-d" (or " d" after 9+ digits) is the check digit.
 */
export function parseDoc(raw: string): ParsedDoc | null {
  const s = raw.normalize("NFKC").trim();
  if (!s) return null;
  const m = s.match(/^([\d.\s,]+?)\s*[-–]\s*(\d)$/);
  let number: string;
  let dv: string | null = null;
  if (m) {
    number = m[1]!.replace(/\D/g, "");
    dv = m[2]!;
  } else {
    if (/[^\d.\s,-]/.test(s)) return null; // letters etc.
    number = s.replace(/\D/g, "");
  }
  if (number.length < 5 || number.length > 15) return null;
  const expected = dv !== null ? nitCheckDigit(number) : null;
  return { number, dv, dvOk: dv === null ? null : expected === Number(dv) };
}

const COMPANY_WORDS = /\b(s\.?\s?a\.?\s?s\.?|s\.?a\.?|ltda\.?|e\.?u\.?|s\.?\s?en\s?c|cia|y\s+cia|fundaci[oó]n|corporaci[oó]n|cooperativa|asociaci[oó]n|inversiones|comercializadora|constructora|distribuidora|cl[ií]nica|hotel|industrias)\b/i;

/** "Persona natural" vs "Empresa" from an explicit label, else from the document and name. */
export function inferKind(label: string | undefined, doc: ParsedDoc, name: string): ClientKind {
  const l = (label ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/jurid|empresa|sociedad|compan|\bpj\b|nit/.test(l) && !/natural/.test(l)) return "empresa";
  if (/natural|\bpn\b|persona|cedula|\bcc\b/.test(l)) return "natural";
  if (doc.dv !== null && doc.number.length >= 9) return "empresa";
  if (/^[89]\d{8}$/.test(doc.number)) return "empresa";
  if (COMPANY_WORDS.test(name)) return "empresa";
  return "natural";
}

export const lastDigits = (n: string, k = 3) => n.slice(-k);

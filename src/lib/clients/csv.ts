import { parse } from "csv-parse/sync";
import { inferKind, parseDoc, type ClientKind } from "./nit";

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export const IMPORT_FIELDS = ["name", "lastName", "doc", "docTail", "kind", "email", "phone", "city", "responsible", "deadline", "fee"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, string>>; // field -> CSV header

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Nombre o razón social",
  lastName: "Apellidos (opcional, se une al nombre)",
  doc: "Cédula o NIT",
  docTail: "Últimos dígitos de la cédula (si no hay cédula completa)",
  kind: "Tipo de cliente (opcional)",
  email: "Correo (opcional)",
  phone: "Teléfono o celular (opcional)",
  city: "Ciudad (opcional)",
  responsible: "Responsable (opcional)",
  deadline: "Fecha límite (opcional)",
  fee: "Honorarios en pesos (opcional)",
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["nombre", "nombres", "razon social", "nombre o razon social", "nombre completo", "cliente", "titular", "nombre cliente", "razon social nombre"],
  lastName: ["apellido", "apellidos", "primer apellido"],
  doc: ["nit", "cedula", "cc", "documento", "identificacion", "numero de documento", "nit cc", "nit o cedula", "no documento", "numero documento", "nit cedula", "c c", "id", "n i t"],
  docTail: ["ultimos dos digitos", "ultimos digitos", "ultimos 2 digitos", "ultimas cifras", "terminacion"],
  kind: ["tipo", "tipo de cliente", "tipo de persona", "clase", "tipo persona", "naturaleza"],
  email: ["correo", "email", "e mail", "correo electronico", "mail", "email contacto"],
  phone: ["telefono", "celular", "movil", "tel", "whatsapp", "telefono celular", "contacto"],
  city: ["ciudad", "municipio"],
  responsible: ["responsable", "asignado", "contador", "encargado", "asignado a"],
  deadline: ["fecha limite", "fecha declaracion", "fecha de declaracion", "vencimiento", "fecha de vencimiento", "fecha vencimiento", "fecha"],
  fee: ["honorarios", "valor honorarios", "valor", "tarifa", "fee", "valor declaracion", "valor del servicio"],
};

/** Decode bytes as UTF-8, falling back to Windows-1252 (what Excel exports for Spanish by default). */
export function decodeText(buf: Buffer): { text: string; encoding: "utf-8" | "windows-1252" } {
  let b = buf;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(b), encoding: "windows-1252" };
  }
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length - 1] as const);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ",";
}

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; delimiter: string; encoding: string; ignored: string[] };

/** Columns that look like passwords/keys are never stored: Alivia does not keep client credentials. */
export const SENSITIVE_HEADER = /clave|contrase|password|passwd|\bpin\b|secret|token/i;

export function parseCsv(buf: Buffer): ParsedCsv {
  if (buf.length === 0) throw new Error("El archivo está vacío.");
  const { text, encoding } = decodeText(buf);
  const delimiter = detectDelimiter(text);
  let records: string[][];
  try {
    records = parse(text, { delimiter, relax_column_count: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    throw new Error("No se pudo leer el archivo. Guárdelo como CSV (UTF-8) desde Excel e intente de nuevo.");
  }
  return recordsToParsed(records, delimiter, encoding);
}

/** Shared by CSV and XLSX: first row = headers, de-duplicated; every cell a trimmed string. */
export function recordsToParsed(records: string[][], delimiter: string, encoding: string): ParsedCsv {
  if (records.length < 2) throw new Error("El archivo no tiene filas de datos.");
  const rawHeaders = records[0]!.map((h, i) => (h || `Columna ${i + 1}`).trim());
  // De-duplicate header names so every column stays addressable.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
  const keep = headers.map((h) => !SENSITIVE_HEADER.test(norm(h)));
  const ignored = headers.filter((_, i) => !keep[i]);
  const dataRows = records.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas.`);
  const rows = dataRows.map((r) => Object.fromEntries(headers.flatMap((h, i) => (keep[i] ? [[h, (r[i] ?? "").toString()]] : []))));
  return { headers: headers.filter((_, i) => keep[i]), rows, delimiter, encoding, ignored };
}

const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOldXls = (b: Buffer) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
const pad = (n: number) => String(n).padStart(2, "0");

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v).trim();
}

/** Reads a CSV or an Excel (.xlsx) file; the type is detected from the file's bytes, not its name. */
export async function parseSpreadsheet(buf: Buffer): Promise<ParsedCsv> {
  if (buf.length === 0) throw new Error("El archivo está vacío.");
  if (isOldXls(buf)) throw new Error("Este es un Excel antiguo (.xls). Ábralo y guárdelo como .xlsx o CSV, e intente de nuevo.");
  if (!isZip(buf)) return parseCsv(buf);
  const { default: readXlsxFile } = await import("read-excel-file/node");
  let sheets;
  try {
    sheets = await readXlsxFile(buf);
  } catch {
    throw new Error("No se pudo leer el Excel. Verifique que no esté protegido con contraseña, o guárdelo como CSV.");
  }
  // First sheet that actually has data (the first one is sometimes a cover page).
  const sheet = sheets.find((sh) => sh.data.length >= 2) ?? sheets[0];
  if (!sheet || sheet.data.length < 2) throw new Error("El Excel no tiene filas de datos.");
  if (sheet.data.length > MAX_IMPORT_ROWS + 1) throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas.`);
  const records = sheet.data.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ""));
  return recordsToParsed(records, "xlsx", "xlsx");
}

/** Guess which CSV column feeds each field, using Spanish header synonyms. */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const exact = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(norm(h)));
    const partial = exact ?? (field === "kind" ? undefined : headers.find((h) => !used.has(h) && SYNONYMS[field].some((s) => s.length > 3 && norm(h).includes(s))));
    if (partial) {
      mapping[field] = partial;
      used.add(partial);
    }
  }
  return mapping;
}

export type RowResult = {
  line: number; // line in the original file (header = 1)
  status: "ok" | "warning" | "error";
  messages: string[];
  data?: {
    kind: ClientKind;
    name: string;
    docNumber: string | null;
    docTail: string | null;
    docDv: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    responsible: string | null;
    deadline: string | null;
    fee: number | null;
  };
};

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const CITIES = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga", "Cúcuta", "Pereira", "Manizales", "Ibagué", "Villavicencio", "Popayán", "Pasto", "Montería", "Neiva", "Armenia", "Santa Marta", "Tunja", "Valledupar", "Sincelejo", "Riohacha", "Florencia", "Yopal", "Quibdó", "Soacha", "Bello", "Envigado", "Itagüí", "Sabaneta", "Chía", "Zipaquirá", "Cajicá", "Mosquera", "Facatativá", "Fusagasugá", "Girardot", "Palmira", "Buenaventura", "Tuluá", "Rionegro", "Duitama", "Sogamoso", "Barrancabermeja", "Apartadó"];
const CITY_BY_KEY = new Map(CITIES.map((c) => [norm(c), c]));

const titleCase = (s: string) =>
  s === s.toUpperCase() || s === s.toLowerCase()
    ? s.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    : s;

export function validateRows(rows: Record<string, string>[], mapping: Mapping): RowResult[] {
  const seenDocs = new Map<string, number>();
  return rows.map((row, i): RowResult => {
    const line = i + 2;
    const get = (f: ImportField) => (mapping[f] ? (row[mapping[f]!] ?? "").trim() : "");
    const messages: string[] = [];
    let warn = false;

    let name = [get("name"), get("lastName")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (/^[=+\-@\t\r]/.test(name)) {
      name = name.replace(/^[=+\-@\t\r\s]+/, "");
      messages.push("Se limpió un carácter especial al inicio del nombre.");
      warn = true;
    }
    if (!name) return { line, status: "error", messages: ["Falta el nombre."] };
    if (name.length > 200) return { line, status: "error", messages: ["El nombre supera 200 caracteres."] };
    name = titleCase(name);

    const tailRaw = get("docTail").replace(/\D/g, "");
    const tail = tailRaw && tailRaw.length <= 4 ? tailRaw.padStart(2, "0") : "";
    let doc: ReturnType<typeof parseDoc> = null;
    if (get("doc")) {
      doc = parseDoc(get("doc"));
      if (!doc) return { line, status: "error", messages: ["La cédula o el NIT no es válido (use solo números)."] };
      if (doc.dvOk === false) {
        messages.push("El dígito de verificación no coincide; se guardó sin validar.");
        warn = true;
      }
      const prior = seenDocs.get(doc.number);
      if (prior !== undefined) return { line, status: "error", messages: [`Duplicado dentro del archivo (igual a la fila ${prior}).`] };
      seenDocs.set(doc.number, line);
    } else if (tail) {
      // No full id in the file: identify by name + last digits, and let the firm complete it later.
      const key = `n:${norm(name)}|${tail}`;
      const prior = seenDocs.get(key);
      if (prior !== undefined) return { line, status: "error", messages: [`Duplicado dentro del archivo (igual a la fila ${prior}).`] };
      seenDocs.set(key, line);
      messages.push("Sin cédula completa: se guardan los últimos dígitos; se completa después en la ficha.");
    } else {
      return { line, status: "error", messages: ["Falta la cédula o el NIT."] };
    }

    let email: string | null = null;
    const em = get("email").toLowerCase();
    if (em) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) && em.length <= 254) email = em;
      else {
        messages.push("Correo no válido; se omitió.");
        warn = true;
      }
    }
    let phone: string | null = null;
    const ph = get("phone");
    if (ph) {
      const cleaned = ph.replace(/[^\d+]/g, "");
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) phone = cleaned;
      else {
        messages.push("Teléfono no válido; se omitió.");
        warn = true;
      }
    }
    const cityRaw = get("city");
    const city = cityRaw ? (CITY_BY_KEY.get(norm(cityRaw)) ?? titleCase(cityRaw.slice(0, 80))) : null;

    let deadline: string | null = null;
    if (get("deadline")) {
      deadline = parseDate(get("deadline"));
      if (!deadline) {
        messages.push("Fecha límite no válida (use DD/MM/AAAA); se omitió.");
        warn = true;
      }
    }

    let fee: number | null = null;
    if (get("fee")) {
      const n = Number(get("fee").replace(/[^\d]/g, ""));
      if (Number.isFinite(n) && n > 0 && n < 10_000_000_000) fee = n;
      else {
        messages.push("Honorarios no válidos; se omitieron.");
        warn = true;
      }
    }

    return {
      line,
      status: warn ? "warning" : "ok",
      messages,
      data: {
        kind: inferKind(get("kind"), doc, name),
        name,
        docNumber: doc ? doc.number : null,
        docTail: doc ? null : tail,
        docDv: doc ? doc.dv : null,
        email,
        phone,
        city,
        responsible: get("responsible") || null,
        deadline,
        fee,
      },
    };
  });
}

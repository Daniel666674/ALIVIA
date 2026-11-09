import { parse } from "csv-parse/sync";
import { inferKind, parseDoc, type ClientKind } from "./nit";

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export const IMPORT_FIELDS = ["name", "lastName", "doc", "kind", "email", "phone", "city", "responsible", "deadline"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, string>>; // field -> CSV header

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Nombre o razón social",
  lastName: "Apellidos (opcional, se une al nombre)",
  doc: "Cédula o NIT",
  kind: "Tipo de cliente (opcional)",
  email: "Correo (opcional)",
  phone: "Teléfono o celular (opcional)",
  city: "Ciudad (opcional)",
  responsible: "Responsable (opcional)",
  deadline: "Fecha límite (opcional)",
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["nombre", "nombres", "razon social", "nombre o razon social", "nombre completo", "cliente", "titular", "nombre cliente", "razon social nombre"],
  lastName: ["apellido", "apellidos", "primer apellido"],
  doc: ["nit", "cedula", "cc", "documento", "identificacion", "numero de documento", "nit cc", "nit o cedula", "no documento", "numero documento", "nit cedula", "c c", "id", "n i t"],
  kind: ["tipo", "tipo de cliente", "tipo de persona", "clase", "tipo persona", "naturaleza"],
  email: ["correo", "email", "e mail", "correo electronico", "mail", "email contacto"],
  phone: ["telefono", "celular", "movil", "tel", "whatsapp", "telefono celular", "contacto"],
  city: ["ciudad", "municipio"],
  responsible: ["responsable", "asignado", "contador", "encargado", "asignado a"],
  deadline: ["fecha limite", "vencimiento", "fecha de vencimiento", "fecha vencimiento", "fecha"],
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

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; delimiter: string; encoding: string };

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
  if (records.length < 2) throw new Error("El archivo no tiene filas de datos.");
  const rawHeaders = records[0]!.map((h, i) => (h || `Columna ${i + 1}`).trim());
  // De-duplicate header names so every column stays addressable.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
  const dataRows = records.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas.`);
  const rows = dataRows.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").toString()])));
  return { headers, rows, delimiter, encoding };
}

/** Guess which CSV column feeds each field, using Spanish header synonyms. */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const exact = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(norm(h)));
    const partial = exact ?? headers.find((h) => !used.has(h) && SYNONYMS[field].some((s) => s.length > 3 && norm(h).includes(s)));
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
    docNumber: string;
    docDv: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    responsible: string | null;
    deadline: string | null;
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

    const doc = parseDoc(get("doc"));
    if (!get("doc")) return { line, status: "error", messages: ["Falta la cédula o el NIT."] };
    if (!doc) return { line, status: "error", messages: ["La cédula o el NIT no es válido (use solo números)."] };
    if (doc.dvOk === false) {
      messages.push("El dígito de verificación no coincide; se guardó sin validar.");
      warn = true;
    }
    const prior = seenDocs.get(doc.number);
    if (prior !== undefined) return { line, status: "error", messages: [`Duplicado dentro del archivo (igual a la fila ${prior}).`] };
    seenDocs.set(doc.number, line);

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

    return {
      line,
      status: warn ? "warning" : "ok",
      messages,
      data: {
        kind: inferKind(get("kind"), doc, name),
        name,
        docNumber: doc.number,
        docDv: doc.dv,
        email,
        phone,
        city,
        responsible: get("responsible") || null,
        deadline,
      },
    };
  });
}

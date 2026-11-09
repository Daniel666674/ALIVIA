import { describe, expect, it } from "vitest";
import { decodeText, detectDelimiter, parseCsv, suggestMapping, validateRows } from "@/lib/clients/csv";
import { inferKind, nitCheckDigit, parseDoc } from "@/lib/clients/nit";
import { colorFor } from "@/lib/clients/semaforo";

describe("NIT / cédula", () => {
  it("computes the DIAN check digit", () => {
    expect(nitCheckDigit("800197268")).toBe(4); // DIAN 800.197.268-4
    expect(nitCheckDigit("860002964")).toBe(4); // Banco de Bogotá 860.002.964-4
    expect(nitCheckDigit("890903938")).toBe(8); // Bancolombia 890.903.938-8
    expect(nitCheckDigit("abc")).toBeNull();
  });
  it("normalizes separators and extracts the DV", () => {
    expect(parseDoc("52.123.456")).toEqual({ number: "52123456", dv: null, dvOk: null });
    const p = parseDoc("860.002.964-4")!;
    expect(p).toMatchObject({ number: "860002964", dv: "4", dvOk: true });
    expect(parseDoc("860002964-5")!.dvOk).toBe(false);
  });
  it("rejects garbage", () => {
    expect(parseDoc("")).toBeNull();
    expect(parseDoc("ABC123")).toBeNull();
    expect(parseDoc("123")).toBeNull();
    expect(parseDoc("1234567890123456789")).toBeNull();
  });
  it("infers person vs company", () => {
    const co = parseDoc("900123456-1")!;
    const pn = parseDoc("79123456")!;
    expect(inferKind(undefined, co, "Algo")).toBe("empresa");
    expect(inferKind(undefined, pn, "Carlos Ruiz")).toBe("natural");
    expect(inferKind(undefined, pn, "Ferretería Vargas SAS")).toBe("empresa");
    expect(inferKind("Persona jurídica", pn, "x")).toBe("empresa");
    expect(inferKind("Persona natural", co, "x")).toBe("natural");
  });
});

describe("CSV parsing", () => {
  it("detects ; delimiter and Windows-1252 accents", () => {
    const latin1 = Buffer.from("Nombre;Cédula;Ciudad\nJosé Pérez;79123456;Bogotá\n", "latin1");
    const r = parseCsv(latin1);
    expect(r.delimiter).toBe(";");
    expect(r.encoding).toBe("windows-1252");
    expect(r.rows[0]).toMatchObject({ Nombre: "José Pérez", Ciudad: "Bogotá" });
  });
  it("reads UTF-8 with BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("nombre,nit\nÁngela,52123456\n")]);
    const r = parseCsv(buf);
    expect(r.encoding).toBe("utf-8");
    expect(r.headers).toEqual(["nombre", "nit"]);
  });
  it("de-duplicates repeated headers", () => {
    expect(parseCsv(Buffer.from("a,a,b\n1,2,3\n")).headers).toEqual(["a", "a (2)", "b"]);
  });
  it("rejects empty / header-only files", () => {
    expect(() => parseCsv(Buffer.from(""))).toThrow();
    expect(() => parseCsv(Buffer.from("a,b\n"))).toThrow();
  });
  it("detectDelimiter / decodeText basics", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(decodeText(Buffer.from("hola")).encoding).toBe("utf-8");
  });
});

describe("column mapping", () => {
  it("maps common Spanish headers", () => {
    const m = suggestMapping(["Razón Social", "NIT/CC", "Tipo de cliente", "Correo electrónico", "Celular", "Ciudad", "Contador", "Fecha límite"]);
    expect(m).toMatchObject({ name: "Razón Social", doc: "NIT/CC", kind: "Tipo de cliente", email: "Correo electrónico", phone: "Celular", city: "Ciudad", responsible: "Contador", deadline: "Fecha límite" });
  });
  it("does not map one column to two fields", () => {
    const m = suggestMapping(["Nombre", "Cédula"]);
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });
});

describe("row validation", () => {
  const mapping = { name: "n", doc: "d", email: "e", phone: "p", city: "c", deadline: "f" };
  it("accepts a clean row and normalizes fields", () => {
    const [r] = validateRows([{ n: "MARTA GÓMEZ SALAZAR", d: "52.123.456", e: " Marta@Correo.com ", p: "310 555 4242", c: "bogotá", f: "14/10/2026" }], mapping);
    expect(r!.status).toBe("ok");
    expect(r!.data).toMatchObject({ name: "Marta Gómez Salazar", docNumber: "52123456", email: "marta@correo.com", phone: "3105554242", city: "Bogotá", deadline: "2026-10-14", kind: "natural" });
  });
  it("flags missing name / bad doc as errors and bad optional fields as warnings", () => {
    const rs = validateRows(
      [
        { n: "", d: "52123456", e: "", p: "", c: "", f: "" },
        { n: "X", d: "abc", e: "", p: "", c: "", f: "" },
        { n: "Ok", d: "52123457", e: "no-es-correo", p: "12", c: "", f: "31/02/2026" },
      ],
      mapping,
    );
    expect(rs.map((r) => r.status)).toEqual(["error", "error", "warning"]);
    expect(rs[2]!.messages.length).toBe(3);
  });
  it("catches duplicates inside the file", () => {
    const rs = validateRows([{ n: "A", d: "52123456" }, { n: "B", d: "52.123.456" }], { name: "n", doc: "d" });
    expect(rs[1]!.status).toBe("error");
    expect(rs[1]!.messages[0]).toMatch(/fila 2/);
  });
  it("neutralizes spreadsheet-formula prefixes in names", () => {
    const [r] = validateRows([{ n: "=HYPERLINK(\"http://x\")", d: "52123456" }], { name: "n", doc: "d" });
    expect(r!.data!.name.startsWith("=")).toBe(false);
    expect(r!.status).toBe("warning");
  });
  it("joins first name and last name columns", () => {
    const [r] = validateRows([{ n: "Ana", l: "Pérez", d: "52123456" }], { name: "n", lastName: "l", doc: "d" });
    expect(r!.data!.name).toBe("Ana Pérez");
  });
});

describe("semáforo", () => {
  it("derives the color", () => {
    expect(colorFor("pending", 0)).toBe("red");
    expect(colorFor("pending", 2)).toBe("yellow");
    expect(colorFor("pending", 4)).toBe("blue");
    expect(colorFor("in_preparation", 0)).toBe("blue");
    expect(colorFor("presented", 0)).toBe("green");
  });
});

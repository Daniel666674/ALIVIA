import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSpreadsheet, suggestMapping } from "../src/lib/clients/csv";

const file = (n: string) => readFileSync(path.resolve(import.meta.dirname, "fixtures", n));

describe("Excel import", () => {
  it("reads an .xlsx (skips the cover sheet, formats dates and numeric ids)", async () => {
    const p = await parseSpreadsheet(file("clientes.xlsx"));
    expect(p.headers[0]).toBe("Nombre o Razón Social");
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]!["Cédula / NIT"]).toBe("1020304050");
    expect(p.rows[0]!["Fecha límite"]).toBe("12/10/2026");
    expect(p.rows[0]!["Honorarios"]).toBe("350000");
    expect(suggestMapping(p.headers)).toMatchObject({ name: "Nombre o Razón Social", doc: "Cédula / NIT", deadline: "Fecha límite", fee: "Honorarios" });
  });
  it("detects the type by content, so a renamed file still works", async () => {
    expect((await parseSpreadsheet(Buffer.from("Nombre;Cédula\nAna;123\n", "utf-8"))).rows).toHaveLength(1);
  });
  it("explains old .xls and corrupt files", async () => {
    await expect(parseSpreadsheet(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).rejects.toThrow(/\.xls/);
    await expect(parseSpreadsheet(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]))).rejects.toThrow(/No se pudo leer el Excel/);
  });
});

describe("files without full ids and with credential columns", () => {
  const csv = "Nombre,Ultimos dos digitos,Clave ingreso,FECHA DECLARACION,TELEFONO,TIPO DE ENTREGA\nANA PEREZ,2,Secreta123*,12/08/2026,3123571163,CHIA\nANA PEREZ,2,x,12/08/2026,,\nLUIS DIAZ,00,Otra*,13/08/2026,,\n";
  it("drops password columns, never maps delivery type as client type, accepts name + last digits", async () => {
    const p = await parseSpreadsheet(Buffer.from(csv));
    expect(p.ignored).toEqual(["Clave ingreso"]);
    expect(JSON.stringify(p.rows)).not.toContain("Secreta");
    const m = suggestMapping(p.headers);
    expect(m).toMatchObject({ name: "Nombre", docTail: "Ultimos dos digitos", deadline: "FECHA DECLARACION", phone: "TELEFONO" });
    expect(m.kind).toBeUndefined();
    const { validateRows } = await import("../src/lib/clients/csv");
    const r = validateRows(p.rows, m);
    expect(r[0]!.data).toMatchObject({ docNumber: null, docTail: "02", deadline: "2026-08-12" });
    expect(r[1]!.status).toBe("error"); // same name + digits in the file
    expect(r[2]!.data?.docTail).toBe("00");
  });
});

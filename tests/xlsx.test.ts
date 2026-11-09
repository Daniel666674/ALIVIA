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

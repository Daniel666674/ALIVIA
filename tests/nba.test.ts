import { describe, expect, it } from "vitest";
import { computeNba, waLink, waMessage, waNumber, type NbaClient } from "@/lib/nba";

const today = "2026-11-09";
const now = new Date("2026-11-09T15:00:00Z");
const base: NbaClient = { id: "c", name: "Cliente Demo", kind: "natural", stage: "pending", deadline: null, responsibleId: "u", docsReceived: 0, toReview: 0, pendingKinds: ["bank_cert", "rut", "dian_key", "id_doc"], lastRemindedAt: null, notifiedAt: null, deliveredAt: null, paidAt: null, feeCop: null };
const c = (o: Partial<NbaClient>) => ({ ...base, ...o });
const run = (list: NbaClient[]) => computeNba(list, [], { today, now });

describe("next best action", () => {
  it("asks for documents, with the reason, and ranks the nearest deadline first", () => {
    const out = run([c({ id: "far", name: "Lejano", deadline: "2026-12-20" }), c({ id: "near", name: "Cercano", deadline: "2026-11-11" })]);
    expect(out.map((n) => n.clientName)).toEqual(["Cercano", "Lejano"]);
    expect(out[0]).toMatchObject({ kind: "request_docs", whatsapp: "request_docs" });
    expect(out[0]!.reason).toContain("Vence en 2 d");
    expect(out[0]!.reason).toContain("Certificación bancaria");
  });
  it("does not nag a client contacted in the last 2 days, and switches to 'insistir' after that", () => {
    expect(run([c({ lastRemindedAt: new Date("2026-11-08T10:00:00Z") })])).toHaveLength(0);
    const [n] = run([c({ lastRemindedAt: new Date("2026-11-03T10:00:00Z") })]);
    expect(n!.title).toMatch(/^Insistir con/);
    expect(n!.reason).toContain("hace 6 d");
  });
  it("suggests preparing once all 4 documents are in, and reviewing what is still unreviewed", () => {
    const out = run([c({ docsReceived: 4, pendingKinds: [], toReview: 2 })]);
    expect(out.map((n) => n.kind)).toContain("prepare");
    expect(out.find((n) => n.kind === "review_docs")!.title).toMatch(/Revisar 2 documentos/);
  });
  it("after presenting: notify, collect (only if a fee exists) and deliver the folder", () => {
    const presented = c({ stage: "presented", feeCop: 1_600_000 });
    const kinds = run([presented]).map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(["collect", "notify", "deliver"]));
    expect(run([c({ stage: "presented" })]).map((n) => n.kind)).not.toContain("collect");
    const done = run([c({ stage: "presented", feeCop: 1_600_000, paidAt: new Date(), notifiedAt: new Date(), deliveredAt: new Date() })]);
    expect(done).toHaveLength(0);
  });
  it("tell the client first, then collect, then deliver; once told, collecting comes first", () => {
    expect(run([c({ stage: "presented", feeCop: 450_000 })]).map((n) => n.kind)).toEqual(["notify", "collect", "deliver"]);
    expect(run([c({ stage: "presented", feeCop: 450_000, notifiedAt: new Date() })]).map((n) => n.kind)).toEqual(["collect", "deliver"]);
  });
  it("in review -> present; in preparation -> nothing (someone is on it)", () => {
    expect(run([c({ stage: "in_review" })])[0]!.kind).toBe("present");
    expect(run([c({ stage: "in_preparation" })])).toHaveLength(0);
  });
  it("flags clients with no owner", () => {
    expect(run([c({ responsibleId: null, docsReceived: 4, pendingKinds: [] })]).map((n) => n.kind)).toContain("assign");
  });
  it("overdue tasks come first", () => {
    const out = computeNba([c({ deadline: null })], [{ id: "t", title: "Llamar a Andina", dueDate: "2026-11-07", clientId: null, clientName: null, assigneeId: null }], { today, now });
    expect(out[0]).toMatchObject({ kind: "task_due", reason: "La tarea venció hace 2 d" });
  });
});

describe("WhatsApp helpers", () => {
  it("normalizes Colombian numbers", () => {
    expect(waNumber("310 555 4242")).toBe("573105554242");
    expect(waNumber("+57 310 555 4242")).toBe("573105554242");
    expect(waNumber("573105554242")).toBe("573105554242");
    expect(waNumber("6012345678")).toBeNull(); // landline: no WhatsApp
    expect(waNumber(null)).toBeNull();
  });
  it("writes the message and encodes the link", () => {
    const m = waMessage("request_docs", { name: "Carlos Ruiz Mejía", kind: "natural", firm: "Firma Demo", missing: ["RUT", "Cédula"] });
    expect(m).toContain("Hola Carlos");
    expect(m).toContain("RUT, Cédula");
    expect(waLink("573105554242", m)).toMatch(/^https:\/\/wa\.me\/573105554242\?text=Hola%20Carlos/);
    expect(waMessage("collect", { name: "Ferretería SAS", kind: "empresa", firm: "F", fee: 1600000 })).toContain("equipo de Ferretería SAS");
  });
});

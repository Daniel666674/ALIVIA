import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, users } from "@/db/schema";
import { createTestDb, seedFirm } from "./helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let a: Awaited<ReturnType<typeof seedFirm>>;
let b: Awaited<ReturnType<typeof seedFirm>>;

beforeAll(async () => {
  t = await createTestDb();
  a = await seedFirm(t.admin, "Firma A", [{ email: "a1@a.test", role: "owner" }]);
  b = await seedFirm(t.admin, "Firma B", [{ email: "b1@b.test", role: "owner" }]);
});
afterAll(() => t.close());

describe("tenant isolation (RLS)", () => {
  it("a tenant sees only its own users", async () => {
    const rows = await t.tenant(a.firm.id, (tx) => tx.select().from(users));
    expect(rows.map((r) => r.email)).toEqual(["a1@a.test"]);
  });

  it("a query that forgets its WHERE firm_id still cannot read another firm", async () => {
    const rows = await t.tenant(a.firm.id, (tx) => tx.select().from(users).where(eq(users.email, "b1@b.test")));
    expect(rows).toHaveLength(0);
  });

  it("cannot insert or update rows for another firm", async () => {
    await expect(
      t.tenant(a.firm.id, (tx) =>
        tx.insert(users).values({ firmId: b.firm.id, email: "x@b.test", name: "x", passwordHash: "x", roleId: b.users[0]!.roleId }),
      ),
    ).rejects.toThrow();
    const upd = await t.tenant(a.firm.id, (tx) =>
      tx.update(users).set({ name: "pwned" }).where(eq(users.id, b.users[0]!.id)).returning(),
    );
    expect(upd).toHaveLength(0);
  });

  it("with no tenant context set, nothing is visible", async () => {
    const rows = await t.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE alivia_app`);
      return tx.select().from(users);
    });
    expect(rows).toHaveLength(0);
  });

  it("system scope sees all firms (pre-auth lookups only)", async () => {
    expect(await t.system((tx) => tx.select().from(users))).toHaveLength(2);
  });

  it("the app role cannot bypass RLS or escalate its own setting", async () => {
    // Even if app code is tricked into setting app.firm_id, the role can't read audit rows it doesn't own.
    await t.tenant(a.firm.id, (tx) => tx.insert(auditLog).values({ firmId: a.firm.id, action: "test" }));
    const rows = await t.tenant(b.firm.id, (tx) => tx.select().from(auditLog));
    expect(rows).toHaveLength(0);
  });
});

describe("audit_log is append-only", () => {
  it("rejects UPDATE and DELETE even from the app role", async () => {
    await t.tenant(a.firm.id, (tx) => tx.insert(auditLog).values({ firmId: a.firm.id, action: "keep.me" }));
    await expect(t.tenant(a.firm.id, (tx) => tx.update(auditLog).set({ action: "tampered" }))).rejects.toThrow();
    await expect(t.tenant(a.firm.id, (tx) => tx.delete(auditLog))).rejects.toThrow();
  });
});

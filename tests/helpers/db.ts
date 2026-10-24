import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/db/schema";
import { scopedTransaction, type Db } from "@/db/client";
import { DEFAULT_ROLES, PERMISSIONS } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";

export async function createTestDb() {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: path.resolve(import.meta.dirname, "../../src/db/migrations") });
  const db = pg as unknown as Db; // same query API; scopedTransaction only needs .transaction/.execute
  return {
    db,
    admin: pg, // owner/superuser handle: bypasses RLS, used only for fixtures
    tenant: <T>(firmId: string, fn: Parameters<typeof scopedTransaction<T>>[2]) => scopedTransaction(db, { firmId }, fn),
    system: <T>(fn: Parameters<typeof scopedTransaction<T>>[2]) => scopedTransaction(db, "system", fn),
    close: () => client.close(),
  };
}

export async function seedFirm(admin: ReturnType<typeof drizzle<typeof schema>>, name: string, emails: { email: string; role: keyof typeof DEFAULT_ROLES; password?: string }[]) {
  const [firm] = await admin.insert(schema.firms).values({ name }).returning();
  const perms = await admin.select().from(schema.permissions);
  const permByKey = new Map(perms.map((p) => [p.key, p.id]));
  if (perms.length === 0) {
    const inserted = await admin
      .insert(schema.permissions)
      .values(Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })))
      .returning();
    inserted.forEach((p) => permByKey.set(p.key, p.id));
  }
  const roleIds = new Map<string, string>();
  for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
    const [r] = await admin.insert(schema.roles).values({ firmId: firm!.id, key, name: def.name }).returning();
    roleIds.set(key, r!.id);
    await admin.insert(schema.rolePermissions).values(def.permissions.map((p) => ({ roleId: r!.id, permissionId: permByKey.get(p)! })));
  }
  const created = [];
  for (const u of emails) {
    const [row] = await admin
      .insert(schema.users)
      .values({
        firmId: firm!.id,
        email: u.email,
        name: u.email.split("@")[0]!,
        passwordHash: await hashPassword(u.password ?? "correct-horse-battery"),
        roleId: roleIds.get(u.role)!,
        mustChangePassword: false,
      })
      .returning();
    created.push(row!);
  }
  return { firm: firm!, users: created };
}

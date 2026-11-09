import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { z } from "zod";
import * as schema from "../../src/db/schema";
import { DEFAULT_ROLES, PERMISSIONS } from "../../src/lib/auth/permissions";
import { hashPassword } from "../../src/lib/auth/password";

export const UserSpec = z.string().transform((s, ctx) => {
  const [email, name, role] = s.split(":").map((x) => x.trim());
  const r = z
    .object({ email: z.string().email().transform((e) => e.trim().toLowerCase()), name: z.string().min(1), role: z.enum(["owner", "accountant", "assistant"]) })
    .safeParse({ email, name, role });
  if (!r.success) ctx.addIssue({ code: "custom", message: `Bad user spec "${s}" (use email:name:role)` });
  return r.data!;
});
export type Spec = z.output<typeof UserSpec>;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Idempotent: permissions catalog, firm, roles, and any users that don't exist yet. No business data. */
export async function runSeed(pool: Pool, firmName: string, specs: Spec[], disable: string[] = []) {
  const db = drizzle(pool, { schema });
  await db.transaction(async (tx) => {
  // Provisioning is the one legitimate cross-tenant writer; RLS is FORCEd even for the table owner.
  await tx.execute(sql`SELECT set_config('app.system', 'on', true)`);
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await tx.insert(schema.permissions).values({ key, description }).onConflictDoNothing();
  }
  const perms = new Map((await tx.select().from(schema.permissions)).map((p) => [p.key, p.id]));

  let [firm] = await tx.select().from(schema.firms).where(eq(schema.firms.name, firmName));
  if (!firm) [firm] = await tx.insert(schema.firms).values({ name: firmName }).returning();

  const roleIds = new Map<string, string>();
  for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
    let [role] = await tx.select().from(schema.roles).where(and(eq(schema.roles.firmId, firm!.id), eq(schema.roles.key, key)));
    if (!role) {
      [role] = await tx.insert(schema.roles).values({ firmId: firm!.id, key, name: def.name }).returning();
    }
    roleIds.set(key, role!.id);
    await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, role!.id));
    await tx.insert(schema.rolePermissions).values(def.permissions.map((p) => ({ roleId: role!.id, permissionId: perms.get(p)! })));
  }

  console.log(`\nFirm: ${firm!.name} (${firm!.id}) · seat limit: ${firm!.seatLimit}`);
  // Seats = ACTIVE users. Disable first so freed seats can be reused in the same run.
  for (const raw of disable) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    const [u] = await tx.select({ id: schema.users.id, status: schema.users.status }).from(schema.users).where(and(eq(schema.users.firmId, firm!.id), eq(schema.users.email, email)));
    if (!u) { console.log(`  none   ${email} (not found, nothing to disable)`); continue; }
    if (u.status === "active") {
      await tx.update(schema.users).set({ status: "disabled", updatedAt: new Date() }).where(eq(schema.users.id, u.id));
      await tx.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.userId, u.id));
      console.log(`  disable ${email}`);
    }
  }
  const activeCount = async () =>
    (await tx.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.firmId, firm!.id), eq(schema.users.status, "active")))).length;
  let seats = await activeCount();
  for (const u of specs) {
    const [existing] = await tx.select({ id: schema.users.id, roleId: schema.users.roleId, status: schema.users.status }).from(schema.users).where(eq(schema.users.email, u.email));
    if (existing) {
      if (existing.roleId !== roleIds.get(u.role)) {
        await tx.update(schema.users).set({ roleId: roleIds.get(u.role)!, updatedAt: new Date() }).where(eq(schema.users.id, existing.id));
        console.log(`  role   ${u.email} -> ${u.role}`);
      } else {
        console.log(`  skip   ${u.email} (already exists)`);
      }
      continue;
    }
    if (seats >= firm!.seatLimit) {
      console.log(`  SKIP   ${u.email} (the plan allows ${firm!.seatLimit} active users; raise firms.seat_limit or disable someone)`);
      continue;
    }
    seats++;
    const pw = tempPassword();
    await tx.insert(schema.users).values({
      firmId: firm!.id, email: u.email, name: u.name, roleId: roleIds.get(u.role)!, passwordHash: await hashPassword(pw), mustChangePassword: true,
    });
    console.log(`  create ${u.email}  role=${u.role}  temp-password=${pw}`);
  }
  // Safety net: never leave a firm without an active owner (the transaction rolls back).
  const owners = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.users.firmId, firm!.id), eq(schema.users.status, "active"), eq(schema.roles.key, "owner")));
  if (owners.length === 0) throw new Error("Refusing to finish: the firm would have no active owner.");
  console.log("\nTemporary passwords are shown only now. Users must change them and enroll 2FA at first login.\n");
  });
}

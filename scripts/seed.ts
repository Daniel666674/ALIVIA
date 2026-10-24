/**
 * Clean-database seed: permissions catalog, one firm, default roles and the demo users.
 * Usage:
 *   DATABASE_URL=... npm run db:seed -- --firm "Firma Demo" \
 *     --user ana@firma.co:"Ana Pérez":owner --user luis@firma.co:"Luis Gómez":accountant
 * Roles: owner | accountant | assistant. Safe to re-run: existing users are skipped.
 * Each NEW user gets a random temporary password, printed ONCE here and forced to change at first login.
 * No client/business data is created: the demo starts empty so a CSV can be imported.
 */
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "../src/db/schema";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/auth/permissions";
import { hashPassword } from "../src/lib/auth/password";

const { values } = parseArgs({ options: { firm: { type: "string" }, user: { type: "string", multiple: true } } });
const UserSpec = z.string().transform((s, ctx) => {
  const [email, name, role] = s.split(":");
  const r = z
    .object({ email: z.string().email().transform((e) => e.trim().toLowerCase()), name: z.string().min(1), role: z.enum(["owner", "accountant", "assistant"]) })
    .safeParse({ email, name, role });
  if (!r.success) ctx.addIssue({ code: "custom", message: `Bad --user "${s}" (use email:name:role)` });
  return r.data!;
});
const firmName = values.firm ?? "";
if (!firmName || !values.user?.length) throw new Error('Usage: --firm "Name" --user email:name:role [--user ...]');
const specs = values.user.map((u) => UserSpec.parse(u));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
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

  console.log(`\nFirm: ${firm!.name} (${firm!.id})`);
  for (const u of specs) {
    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, u.email));
    if (existing) {
      console.log(`  skip   ${u.email} (already exists)`);
      continue;
    }
    const pw = tempPassword();
    await tx.insert(schema.users).values({
      firmId: firm!.id, email: u.email, name: u.name, roleId: roleIds.get(u.role)!, passwordHash: await hashPassword(pw), mustChangePassword: true,
    });
    console.log(`  create ${u.email}  role=${u.role}  temp-password=${pw}`);
  }
  console.log("\nTemporary passwords are shown only now. Users must change them and enroll 2FA at first login.\n");
});
await pool.end();

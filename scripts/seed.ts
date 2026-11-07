/**
 * Clean-database seed (manual use). See scripts/lib/seed.ts.
 *   DATABASE_URL=... npm run db:seed -- --firm "Firma Demo" \
 *     --user ana@firma.co:"Ana Pérez":owner --user luis@firma.co:"Luis Gómez":accountant
 * Roles: owner | accountant | assistant. Re-runnable: existing users are skipped.
 * Each NEW user gets a random temporary password, printed ONCE and forced to change at first login.
 */
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { runSeed, UserSpec } from "./lib/seed";

const { values } = parseArgs({ options: { firm: { type: "string" }, user: { type: "string", multiple: true } } });
if (!values.firm || !values.user?.length) throw new Error('Usage: --firm "Name" --user email:name:role [--user ...]');
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
await runSeed(pool, values.firm, values.user.map((u) => UserSpec.parse(u)));
await pool.end();

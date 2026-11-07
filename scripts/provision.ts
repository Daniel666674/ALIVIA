/**
 * Runs on every Vercel build (see "vercel-build"): applies DB migrations, then optionally seeds.
 *  - DATABASE_URL_UNPOOLED (preferred, direct) or DATABASE_URL must point at Postgres; if neither is
 *    set the step is skipped so a first deploy before the database exists still builds.
 *  - SEED_FIRM + SEED_USERS ("email:name:role;email:name:role") create the demo firm/users that don't
 *    exist yet. Temp passwords are printed once in the build log. Remove SEED_USERS afterwards.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { runSeed, UserSpec } from "./lib/seed";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.warn("[provision] No DATABASE_URL set: skipping migrations and seed.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./src/db/migrations" });
  console.log("[provision] Migrations applied.");

  const users = (process.env.SEED_USERS ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  if (users.length) {
    await runSeed(pool, process.env.SEED_FIRM ?? "Firma Demo", users.map((u) => UserSpec.parse(u)));
  }
} finally {
  await pool.end();
}

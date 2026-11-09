import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** What query code receives: always a transaction already scoped to a tenant (or system). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

declare global {
  var __aliviaPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__aliviaPool) {
    globalThis.__aliviaPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: 5,
      ssl: env().NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
    });
  }
  return globalThis.__aliviaPool;
}

/** Test seam: run the same scoping logic against any drizzle db (e.g. PGlite). */
export async function scopedTransaction<T>(
  db: Db,
  scope: { firmId: string } | "system",
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // One round trip: drop to the RLS-subject role AND set the tenant scope (both transaction-local).
    // set_config is parameterized -> no string interpolation of the tenant id.
    await tx.execute(
      scope === "system"
        ? sql`SELECT set_config('role', 'alivia_app', true), set_config('app.system', 'on', true)`
        : sql`SELECT set_config('role', 'alivia_app', true), set_config('app.firm_id', ${scope.firmId}, true)`,
    );
    return fn(tx);
  });
}

/**
 * The ONLY way application code reaches the database. Every query runs inside a
 * transaction pinned to one firm, with Postgres RLS enforcing the same boundary.
 */
export function withTenant<T>(firmId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return scopedTransaction(drizzle(pool(), { schema }), { firmId }, fn);
}

/**
 * Cross-tenant access, needed only for pre-authentication lookups (login by email, session
 * by token hash). Keep usage confined to src/lib/auth/** (enforced by tests/architecture).
 */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return scopedTransaction(drizzle(pool(), { schema }), "system", fn);
}

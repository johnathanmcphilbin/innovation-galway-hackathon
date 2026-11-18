import { getPool } from "../src/db.js";

/** Serialise tests that share the local submissions table. */
export async function withDbLock(fn) {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(814260)");
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock(814260)").catch(() => {});
    client.release();
  }
}

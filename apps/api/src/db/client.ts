// Single shared `pg` connection pool for the whole API process. No ORM —
// per the Active Decisions Log, raw parameterized queries through `pg` were
// chosen over an ORM/query builder for this app's size. Every module that
// touches Postgres (routes, workers, agents) imports this same `db` pool.
import { Pool } from "pg";
import { env } from "../lib/env";

export const db = new Pool({
  connectionString: env.DATABASE_URL,
});

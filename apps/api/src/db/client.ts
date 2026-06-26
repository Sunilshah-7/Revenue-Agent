import { Pool } from "pg";
import { env } from "../lib/env";

export const db = new Pool({
  connectionString: env.DATABASE_URL,
});

// Operational endpoint only — not one of the six product REST endpoints in
// the API Contract. Used for Railway health checks / local sanity checks.
import { Hono } from "hono";

export const healthRouter = new Hono();

healthRouter.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

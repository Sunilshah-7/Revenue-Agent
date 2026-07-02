// Startup-time environment validation. Parsing throws (crashing the process
// immediately) if anything required is missing or, more importantly, if
// APP_ENV=local infrastructure isn't actually loopback-bound — this is the
// enforcement mechanism for the AGENTS.md/CLAUDE.md rule that routine dev
// and tests must never touch hosted Neon/Upstash/Groq.
import { z } from "zod";

const envSchema = z.object({
  // "local" flips on the superRefine guardrails below; "hosted" (default)
  // is the Railway/production posture with no loopback restriction.
  APP_ENV: z.enum(["local", "hosted"]).default("hosted"),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().min(1),
  // Upstash requires TLS; local Redis (docker-compose) does not, so this is
  // toggled per environment rather than hardcoded.
  REDIS_TLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // "mock" short-circuits lib/groq.ts to a deterministic canned completion
  // with no network call, so local dev/tests never spend Groq's metered
  // free-tier quota.
  GROQ_MODE: z.enum(["live", "mock"]).default("live"),
  GROQ_API_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
}).superRefine((values, context) => {
  // GROQ_API_KEY is conditionally required: only when a real API call will
  // actually be made.
  if (values.GROQ_MODE === "live" && !values.GROQ_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GROQ_API_KEY"],
      message: "GROQ_API_KEY is required when GROQ_MODE=live",
    });
  }

  // Everything past this point only applies to APP_ENV=local; hosted
  // deployments are intentionally not constrained to loopback hosts.
  if (values.APP_ENV !== "local") {
    return;
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  let databaseHost = "";

  try {
    databaseHost = new URL(values.DATABASE_URL).hostname;
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL must be a valid local PostgreSQL URL",
    });
  }

  // Rejects any DATABASE_URL whose host isn't loopback — this is what
  // stops a misconfigured local run from silently hitting hosted Neon.
  if (databaseHost && !loopbackHosts.has(databaseHost)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "APP_ENV=local only permits a loopback PostgreSQL host",
    });
  }

  // Same guardrail for Redis, against hitting hosted Upstash.
  if (!loopbackHosts.has(values.REDIS_HOST)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_HOST"],
      message: "APP_ENV=local only permits a loopback Redis host",
    });
  }

  // Local mode forces the Groq mock path unconditionally — there is no way
  // to run APP_ENV=local against the real Groq API even intentionally.
  if (values.GROQ_MODE !== "mock") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GROQ_MODE"],
      message: "APP_ENV=local requires GROQ_MODE=mock",
    });
  }
});

// Parsed once at import time; every other module imports this `env` object
// rather than reading process.env directly, so validation always runs
// before any route/worker code executes.
export const env = envSchema.parse(process.env);

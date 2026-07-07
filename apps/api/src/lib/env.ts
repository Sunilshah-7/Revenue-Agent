// Startup-time environment validation. Parsing throws (crashing the process
// immediately) if anything required is missing or, more importantly, if
// APP_ENV=local infrastructure isn't actually loopback-bound — this is the
// enforcement mechanism for the AGENTS.md/CLAUDE.md rule that routine dev
// and tests must never touch hosted Neon/Upstash/Groq.
import { z } from "zod";

const envSchema = z.object({
  // "local" flips on the superRefine loopback guardrails below for
  // DATABASE_URL/REDIS_HOST; "hosted" (default) is the Railway/production
  // posture with no loopback restriction. This is independent of whether
  // the Groq LLM call is mocked — see USE_MOCK_LLM.
  APP_ENV: z.enum(["local", "hosted"]).default("hosted"),
  // Bun/Node standard; used only to gate the Groq mock for automated test
  // runs (NODE_ENV=test) without requiring every test file to also set
  // USE_MOCK_LLM.
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
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
  // Explicit, opt-in escape hatch that short-circuits lib/groq.ts to a
  // deterministic canned completion with no network call. Defaults to
  // "false" everywhere (dev and prod alike) — it must be set on purpose in
  // a test/local env file, never inferred from APP_ENV or from a missing
  // GROQ_API_KEY, so a misconfigured dev/prod environment fails loudly
  // instead of silently serving mock output.
  USE_MOCK_LLM: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  GROQ_API_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
}).superRefine((values, context) => {
  const mockActive = values.NODE_ENV === "test" || values.USE_MOCK_LLM;

  // GROQ_API_KEY is conditionally required: only when a real API call will
  // actually be made. Every other environment (including APP_ENV=local
  // dev) must provide a real key and hit the real Groq API.
  if (!mockActive && !values.GROQ_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GROQ_API_KEY"],
      message:
        "GROQ_API_KEY is required unless NODE_ENV=test or USE_MOCK_LLM=true",
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
});

// Parsed once at import time; every other module imports this `env` object
// rather than reading process.env directly, so validation always runs
// before any route/worker code executes. A parse failure means the process
// cannot safely run (e.g. a missing GROQ_API_KEY outside mock mode) — log a
// readable summary of what's wrong and exit instead of letting a raw ZodError
// stack trace be the only signal, and instead of ever falling back to mock.
let parsedEnv: z.infer<typeof envSchema>;
try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  const details =
    error instanceof z.ZodError
      ? error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")
      : String(error);
  console.error(
    `[${new Date().toISOString()}] ERROR Invalid environment configuration, refusing to start:\n${details}`,
  );
  process.exit(1);
}

export const env = parsedEnv;

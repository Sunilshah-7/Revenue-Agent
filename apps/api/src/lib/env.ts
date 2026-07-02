import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "hosted"]).default("hosted"),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().min(1),
  REDIS_TLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  GROQ_MODE: z.enum(["live", "mock"]).default("live"),
  GROQ_API_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
}).superRefine((values, context) => {
  if (values.GROQ_MODE === "live" && !values.GROQ_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GROQ_API_KEY"],
      message: "GROQ_API_KEY is required when GROQ_MODE=live",
    });
  }

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

  if (databaseHost && !loopbackHosts.has(databaseHost)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "APP_ENV=local only permits a loopback PostgreSQL host",
    });
  }

  if (!loopbackHosts.has(values.REDIS_HOST)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_HOST"],
      message: "APP_ENV=local only permits a loopback Redis host",
    });
  }

  if (values.GROQ_MODE !== "mock") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GROQ_MODE"],
      message: "APP_ENV=local requires GROQ_MODE=mock",
    });
  }
});

export const env = envSchema.parse(process.env);

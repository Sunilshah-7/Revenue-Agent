import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().min(1),
  REDIS_TLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  GROQ_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);

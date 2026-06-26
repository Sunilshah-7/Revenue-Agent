import IORedis, { type RedisOptions } from "ioredis";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

const redisOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  tls: env.REDIS_TLS ? {} : undefined,
  connectTimeout: 10_000,
  maxRetriesPerRequest: null as null,
};

export const redisConnection = redisOptions;

export const redisPublisher = new IORedis(redisOptions);
export const redisSubscriber = new IORedis(redisOptions);

redisPublisher.on("error", (error) => {
  logger.error("Redis publisher error", error.message);
});

redisSubscriber.on("error", (error) => {
  logger.error("Redis subscriber error", error.message);
});

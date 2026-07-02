// Redis is used for two distinct purposes in this app: BullMQ's job queues
// (embed/research/write) and pub/sub session events (status/token/error/done
// forwarded to WebSocket clients, see ws/session.ts). All three uses share
// this same connection config, but BullMQ and pub/sub each need their own
// physical IORedis connection instances.
import IORedis, { type RedisOptions } from "ioredis";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

const redisOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  tls: env.REDIS_TLS ? {} : undefined,
  connectTimeout: 10_000,
  // Required by BullMQ: it manages its own retry/backoff for blocking
  // commands, so ioredis-level retry limits must be disabled or BullMQ's
  // blocking reads (BRPOPLPUSH etc.) can error out prematurely.
  maxRetriesPerRequest: null as null,
};

// Exported as plain options (not a live connection) because BullMQ's
// Queue/Worker/QueueEvents constructors each open their own connection from
// a config object — see workers/queue.ts.
export const redisConnection = redisOptions;

// Separate publisher/subscriber clients: a single ioredis connection cannot
// both issue commands and stay in Redis's subscribe mode at once, so pub/sub
// always needs two connections minimum.
export const redisPublisher = new IORedis(redisOptions);
export const redisSubscriber = new IORedis(redisOptions);

redisPublisher.on("error", (error) => {
  logger.error("Redis publisher error", error.message);
});

redisSubscriber.on("error", (error) => {
  logger.error("Redis subscriber error", error.message);
});

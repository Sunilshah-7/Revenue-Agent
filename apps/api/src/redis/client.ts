import IORedis from "ioredis";
import { env } from "../lib/env";

const redisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null as null,
};

export const redisConnection = redisOptions;

export const redisPublisher = new IORedis(redisOptions);
export const redisSubscriber = new IORedis(redisOptions);

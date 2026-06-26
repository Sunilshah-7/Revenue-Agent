import { Queue, QueueEvents } from "bullmq";
import { redisConnection } from "../redis/client";

export const embedQueue = new Queue("embed", { connection: redisConnection });
export const researchQueue = new Queue("research", {
  connection: redisConnection,
});
export const writerQueue = new Queue("write", { connection: redisConnection });

export const researchQueueEvents = new QueueEvents("research", {
  connection: redisConnection,
});

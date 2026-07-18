import { createHash } from "node:crypto";

import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

export const queueNames = [
  "outbox",
  "collage-lifecycle",
  "payment-scheduling",
  "payment-processing",
  "payment-reconciliation",
  "payout-processing",
  "payout-reconciliation",
  "reminders",
  "telegram-notifications",
  "maintenance",
] as const;

export type QueueName = (typeof queueNames)[number];

const jobKeyPartSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[\w.-]+$/u);

export const deterministicJobId = (
  operation: string,
  ...identityParts: readonly string[]
): string => {
  const safeOperation = jobKeyPartSchema.parse(operation);
  if (identityParts.length === 0) {
    throw new Error("A deterministic job ID requires identity parts");
  }
  const canonicalIdentity = identityParts
    .map((part) => jobKeyPartSchema.parse(part))
    .join("\u001f");
  const digest = createHash("sha256")
    .update(canonicalIdentity)
    .digest("hex")
    .slice(0, 32);
  return `${safeOperation}-${digest}`;
};

export const outboxJobSchema = z.object({
  eventId: z.uuid(),
});

export const contributionJobSchema = z.object({
  contributionId: z.uuid(),
});

export const payoutJobSchema = z.object({
  payoutId: z.uuid(),
});

export const telegramNotificationJobSchema = z.object({
  deliveryId: z.uuid(),
});

export const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1_000,
    jitter: 0.5,
  },
  removeOnComplete: { age: 86_400, count: 5_000 },
  removeOnFail: { age: 604_800, count: 10_000 },
} as const satisfies JobsOptions;

export const createRedisConnection = (redisUrl: string): Redis =>
  new Redis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

export const createQueue = <Data>(name: QueueName, connection: Redis) =>
  new Queue<Data>(name, {
    connection,
    defaultJobOptions,
  });

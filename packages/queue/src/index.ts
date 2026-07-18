import { createHash } from "node:crypto";

import {
  Queue,
  Worker,
  type JobsOptions,
  type Processor,
  type WorkerOptions,
} from "bullmq";
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
export type QueueWorker<Data> = Worker<Data>;

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

export const telegramNotificationTypeSchema = z.enum([
  "registration.completed",
  "collage.started",
  "contribution.payment_failed",
  "contribution.reminder",
  "member.left",
  "cycle.blocked",
  "payout.processing",
  "payout.succeeded",
  "payout.failed",
  "collage.completed",
]);

export const telegramNotificationJobSchema = z.object({
  deliveryId: z.uuid(),
  type: telegramNotificationTypeSchema,
  operation: z.enum([
    "send-group-message",
    "edit-pinned-status",
    "pin-status-message",
    "send-private-message",
  ]),
  telegramChatId: z.string().regex(/^-?\d+$/u),
  telegramMessageId: z.string().regex(/^\d+$/u).optional(),
  text: z.string().min(1).max(4_096),
  parseMode: z.literal("HTML"),
  buttons: z
    .array(
      z.object({
        label: z.string().min(1).max(64),
        url: z.url(),
      }),
    )
    .max(8)
    .default([]),
});

export type TelegramNotificationJob = z.infer<
  typeof telegramNotificationJobSchema
>;

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

export const createWorker = <Data>(
  name: QueueName,
  connection: Redis,
  processor: Processor<Data>,
  options: Omit<WorkerOptions, "connection"> = {},
) =>
  new Worker<Data>(name, processor, {
    ...options,
    connection,
  });

import type { WorkerEnvironment } from "@collage/config";
import { checkDatabaseReadiness, createPrismaClient } from "@collage/database";
import { createLogger } from "@collage/logger";
import { MonnifyClient } from "@collage/monnify";
import {
  contributionJobSchema,
  createQueue,
  createRedisConnection,
  createWorker,
  deterministicJobId,
  lifecycleJobSchema,
  maintenanceJobSchema,
  outboxJobSchema,
  payoutJobSchema,
  queueNames,
  reconciliationJobSchema,
  reminderJobSchema,
  type QueueName,
} from "@collage/queue";
import type { Queue, Worker } from "bullmq";

import { WorkerEngine } from "./engine.js";
import { WorkerMetrics } from "./metrics.js";
import { TransactionalOutboxPublisher } from "./outbox.js";
import type { JobScheduler, ScheduledJob } from "./ports.js";
import { DisabledWorkerProvider, type WorkerProvider } from "./provider.js";

class BullJobScheduler implements JobScheduler {
  constructor(private readonly queues: ReadonlyMap<QueueName, Queue>) {}

  async enqueue(job: ScheduledJob): Promise<void> {
    const queue = this.queues.get(job.queue);
    if (queue === undefined)
      throw new Error(`Queue is unavailable: ${job.queue}`);
    const policy =
      job.queue === "payment-reconciliation" ||
      job.queue === "payout-reconciliation"
        ? { attempts: 20, backoff: { type: "fixed", delay: 30_000 } }
        : job.queue === "payment-processing" ||
            job.queue === "payout-processing"
          ? { attempts: 5, backoff: { type: "exponential", delay: 5_000 } }
          : { attempts: 5, backoff: { type: "exponential", delay: 1_000 } };
    await queue.add(job.name, job.data, {
      jobId: job.id,
      ...policy,
      ...(job.delayMs === undefined ? {} : { delay: job.delayMs }),
    });
  }
}

export interface WorkerRuntime {
  readonly close: () => Promise<void>;
  readonly isReady: () => Promise<boolean>;
  readonly metrics: WorkerMetrics;
}

export const createWorkerRuntime = async (
  environment: WorkerEnvironment,
): Promise<WorkerRuntime> => {
  const logger = createLogger("worker", {
    level: environment.LOG_LEVEL,
  });
  const client = createPrismaClient(environment.DATABASE_URL);
  const redis = createRedisConnection(environment.REDIS_URL);
  await redis.connect();
  const queues = new Map<QueueName, Queue>(
    queueNames.map((name) => [name, createQueue(name, redis)]),
  );
  const scheduler = new BullJobScheduler(queues);
  const provider: WorkerProvider = environment.PROVIDER_CALLS_ENABLED
    ? new MonnifyClient({
        apiKey: environment.MONNIFY_API_KEY,
        baseUrl: environment.MONNIFY_BASE_URL,
        contractCode: environment.MONNIFY_CONTRACT_CODE,
        secretKey: environment.MONNIFY_SECRET_KEY,
        ...(environment.MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER === undefined
          ? {}
          : {
              sourceWalletAccountNumber:
                environment.MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER,
            }),
      })
    : new DisabledWorkerProvider();
  const engine = new WorkerEngine({
    client,
    encryption: {
      activeKeyId: environment.APP_ENCRYPTION_KEY_ID,
      keys: {
        [environment.APP_ENCRYPTION_KEY_ID]: Buffer.from(
          environment.APP_ENCRYPTION_KEY_BASE64,
          "base64",
        ),
      },
    },
    hashKey: Buffer.from(environment.APP_HASH_PEPPER, "utf8"),
    maximumChargeAttempts: environment.WORKER_MAX_AUTOMATIC_CHARGE_ATTEMPTS,
    pendingPollMs: environment.WORKER_PENDING_POLL_SECONDS * 1_000,
    provider,
    providerEnabled: environment.PROVIDER_CALLS_ENABLED,
    providerEnvironment: environment.MONNIFY_ENV,
    providerRedirectUrl: `${environment.MINI_APP_PUBLIC_URL.replace(/\/$/u, "")}/payment-return`,
    scheduler,
    staleOperationMs: environment.WORKER_STALE_OPERATION_MINUTES * 60_000,
  });
  const outbox = new TransactionalOutboxPublisher(client, scheduler);
  const metrics = new WorkerMetrics();
  const workers: Worker[] = [];

  const register = (
    queue: QueueName,
    concurrency: number,
    processor: (data: unknown, correlationId: string) => Promise<void>,
  ): void => {
    const worker = createWorker<unknown>(
      queue,
      redis,
      async (job) => {
        const correlationId = `worker:${queue}:${job.id ?? randomUUID()}`;
        metrics.started(queue);
        logger.info(
          { correlationId, jobId: job.id, jobName: job.name, queue },
          "Worker job started",
        );
        try {
          await processor(job.data, correlationId);
          metrics.finished(queue, true);
          logger.info(
            { correlationId, jobId: job.id, jobName: job.name, queue },
            "Worker job completed",
          );
        } catch (error) {
          metrics.finished(queue, false);
          logger.error(
            {
              correlationId,
              error,
              jobId: job.id,
              jobName: job.name,
              queue,
            },
            "Worker job failed",
          );
          throw error;
        }
      },
      { concurrency },
    );
    workers.push(worker);
  };

  register("outbox", environment.WORKER_OUTBOX_CONCURRENCY, async (data) => {
    outboxJobSchema.parse(data);
    await outbox.publishBatch();
  });
  register(
    "collage-lifecycle",
    environment.WORKER_LIFECYCLE_CONCURRENCY,
    async (data, correlationId) => {
      const job = lifecycleJobSchema.parse(data);
      switch (job.operation) {
        case "start-collage":
          await engine.startCollage(job.collageId, correlationId);
          break;
        case "open-cycle":
          await engine.scheduleOpenCycle(job.cycleId);
          break;
        case "deadline":
        case "grace-ended":
          await engine.evaluateCycle(job.cycleId, correlationId);
          break;
        case "complete-cycle":
          await engine.completeCycle(job.cycleId, correlationId);
          break;
      }
    },
  );
  const chargeProcessor = async (
    data: unknown,
    correlationId: string,
  ): Promise<void> => {
    const job = contributionJobSchema.parse(data);
    if (job.operation === "charge")
      await engine.chargeContribution(job.contributionId, correlationId);
    else if (job.operation === "evaluate") {
      const contribution = await client.cycleContribution.findUniqueOrThrow({
        where: { id: job.contributionId },
        select: { cycleId: true },
      });
      await engine.evaluateCycle(contribution.cycleId, correlationId);
    }
  };
  register(
    "payment-scheduling",
    environment.WORKER_PAYMENT_CONCURRENCY,
    chargeProcessor,
  );
  register(
    "payment-processing",
    environment.WORKER_PAYMENT_CONCURRENCY,
    chargeProcessor,
  );
  register(
    "payment-reconciliation",
    environment.WORKER_PAYMENT_CONCURRENCY,
    async (data, correlationId) => {
      const job = reconciliationJobSchema.parse(data);
      if (job.operation === "payment")
        await engine.pollPaymentAttempt(job.attemptId, correlationId);
      else if (job.operation === "webhook")
        await engine.processWebhook(job.webhookEventId, correlationId);
      else if (job.operation === "sweep") await engine.recoverStaleOperations();
    },
  );
  register(
    "payout-processing",
    environment.WORKER_PAYOUT_CONCURRENCY,
    async (data, correlationId) => {
      const job = payoutJobSchema.parse(data);
      if (job.operation === "initiate")
        await engine.initiatePayout(job.payoutId, correlationId);
      if (job.operation === "retry")
        await engine.initiatePayout(job.payoutId, correlationId, true);
    },
  );
  register(
    "payout-reconciliation",
    environment.WORKER_PAYOUT_CONCURRENCY,
    async (data, correlationId) => {
      const job = reconciliationJobSchema.parse(data);
      if (job.operation === "payout")
        await engine.pollPayoutAttempt(job.attemptId, correlationId);
      else if (job.operation === "sweep") await engine.recoverStaleOperations();
    },
  );
  register(
    "reminders",
    environment.WORKER_REMINDER_CONCURRENCY,
    async (data) => {
      const job = reminderJobSchema.parse(data);
      await engine.sendReminder(job.cycleId, new Date(job.scheduledFor));
    },
  );
  register("maintenance", 1, async (data) => {
    const job = maintenanceJobSchema.parse(data);
    if (job.operation === "reconcile-ledger")
      await engine.reconcileLedger("worker:scheduled-reconciliation");
    else await engine.recoverStaleOperations();
  });

  const outboxQueue = queues.get("outbox");
  const maintenanceQueue = queues.get("maintenance");
  if (outboxQueue === undefined || maintenanceQueue === undefined)
    throw new Error("Required recurring queues are unavailable");
  await outboxQueue.upsertJobScheduler(
    "transactional-outbox-publisher",
    { every: 1_000 },
    {
      name: "publish-outbox",
      data: { operation: "publish-batch" },
      opts: { attempts: 10 },
    },
  );
  await maintenanceQueue.upsertJobScheduler(
    "stale-operation-recovery",
    { every: 60_000 },
    {
      name: "recover-stale",
      data: { operation: "recover-stale" },
      opts: { attempts: 3 },
    },
  );
  const startingCollages = await client.collage.findMany({
    where: { state: "STARTING" },
    select: { id: true },
    take: 500,
  });
  for (const collage of startingCollages) {
    await scheduler.enqueue({
      queue: "collage-lifecycle",
      name: "recover-start-collage",
      id: deterministicJobId("recover-start-collage-v2", collage.id),
      data: { operation: "start-collage", collageId: collage.id },
    });
  }
  await maintenanceQueue.upsertJobScheduler(
    "ledger-reconciliation",
    { every: 5 * 60_000 },
    {
      name: "reconcile-ledger",
      data: { operation: "reconcile-ledger" },
      opts: { attempts: 3 },
    },
  );

  return {
    metrics,
    isReady: async () => {
      await Promise.all([checkDatabaseReadiness(client), redis.ping()]);
      return workers.every((worker) => !worker.closing);
    },
    close: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      await client.$disconnect();
      redis.disconnect();
    },
  };
};
import { randomUUID } from "node:crypto";

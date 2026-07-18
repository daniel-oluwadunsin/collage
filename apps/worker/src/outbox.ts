import {
  claimOutboxEvents,
  markOutboxEventFailed,
  markOutboxEventPublished,
  type Prisma,
  type PrismaClient,
  withSerializableTransaction,
} from "@collage/database";
import { deterministicJobId } from "@collage/queue";
import { z } from "zod";

import type { JobScheduler, ScheduledJob } from "./ports.js";

const routeEvent = (event: {
  readonly aggregateId: string;
  readonly eventType: string;
  readonly id: string;
  readonly payload: Prisma.JsonValue;
}): ScheduledJob | undefined => {
  switch (event.eventType) {
    case "collage.start.requested": {
      const { collageId } = z
        .object({ collageId: z.uuid() })
        .parse(event.payload);
      return {
        queue: "collage-lifecycle",
        name: "start-collage",
        id: deterministicJobId("start-collage", collageId),
        data: { operation: "start-collage", collageId },
      };
    }
    case "cycle.opened": {
      const { cycleId } = z.object({ cycleId: z.uuid() }).parse(event.payload);
      return {
        queue: "collage-lifecycle",
        name: "open-cycle",
        id: deterministicJobId("open-cycle", cycleId),
        data: { operation: "open-cycle", cycleId },
      };
    }
    case "contribution.paid": {
      const { cycleId } = z.object({ cycleId: z.uuid() }).parse(event.payload);
      return {
        queue: "collage-lifecycle",
        name: "evaluate-cycle",
        id: deterministicJobId("evaluate-cycle", cycleId, event.id),
        data: { operation: "deadline", cycleId },
      };
    }
    case "payment.status-check.requested": {
      const { attemptId } = z
        .object({ attemptId: z.uuid() })
        .parse(event.payload);
      return {
        queue: "payment-reconciliation",
        name: "poll-payment",
        id: deterministicJobId("poll-payment-requested", attemptId, event.id),
        data: { operation: "payment", attemptId },
      };
    }
    case "payout.ready": {
      const { payoutId } = z
        .object({ payoutId: z.uuid() })
        .parse(event.payload);
      return {
        queue: "payout-processing",
        name: "initiate-payout",
        id: deterministicJobId("initiate-payout", payoutId),
        data: { operation: "initiate", payoutId },
      };
    }
    case "payout.retry.requested": {
      const { payoutId } = z
        .object({ payoutId: z.uuid() })
        .parse(event.payload);
      return {
        queue: "payout-processing",
        name: "retry-payout",
        id: deterministicJobId("retry-payout", payoutId, event.id),
        data: { operation: "retry", payoutId },
      };
    }
    case "payout.succeeded": {
      const { cycleId } = z.object({ cycleId: z.uuid() }).parse(event.payload);
      return {
        queue: "collage-lifecycle",
        name: "complete-cycle",
        id: deterministicJobId("complete-cycle", cycleId),
        data: { operation: "complete-cycle", cycleId },
      };
    }
    case "monnify.webhook.received": {
      const { webhookEventId } = z
        .object({ webhookEventId: z.uuid() })
        .parse(event.payload);
      return {
        queue: "payment-reconciliation",
        name: "process-webhook",
        id: deterministicJobId("process-webhook", webhookEventId),
        data: { operation: "webhook", webhookEventId },
      };
    }
    case "collage.reconciliation.requested":
      return {
        queue: "maintenance",
        name: "reconcile-ledger",
        id: deterministicJobId("reconcile-ledger", event.aggregateId, event.id),
        data: { operation: "reconcile-ledger" },
      };
    default:
      return undefined;
  }
};

const notificationForEvent = async (
  client: PrismaClient,
  event: {
    readonly aggregateId: string;
    readonly eventType: string;
    readonly id: string;
  },
): Promise<ScheduledJob | undefined> => {
  const definitions: Readonly<
    Record<
      string,
      {
        readonly type:
          | "registration.completed"
          | "collage.started"
          | "contribution.payment_failed"
          | "member.left"
          | "cycle.blocked"
          | "payout.processing"
          | "payout.succeeded"
          | "payout.failed"
          | "collage.completed";
        readonly text: string;
      }
    >
  > = {
    "registration.completed": {
      type: "registration.completed",
      text: "Registration completed.",
    },
    "collage.started": {
      type: "collage.started",
      text: "The Collage has started. Cycle 1 is now collecting.",
    },
    "contribution.manual-payment-required": {
      type: "contribution.payment_failed",
      text: "Automatic collection could not be completed. Manual payment is now required.",
    },
    "member.left": {
      type: "member.left",
      text: "A registered member left Telegram. Existing contribution obligations remain active.",
    },
    "cycle.blocked": {
      type: "cycle.blocked",
      text: "This cycle is blocked because contributions remain unpaid after grace. No payout or next cycle will proceed.",
    },
    "payout.ready": {
      type: "payout.processing",
      text: "All contributions reconcile. The cycle payout is processing.",
    },
    "payout.succeeded": {
      type: "payout.succeeded",
      text: "The cycle payout succeeded.",
    },
    "payout.failed": {
      type: "payout.failed",
      text: "The cycle payout failed. The recipient can update their account and request a safe retry.",
    },
    "collage.completed": {
      type: "collage.completed",
      text: "All cycles and payouts are complete. This Collage is finished.",
    },
  };
  const definition = definitions[event.eventType];
  if (definition === undefined) return undefined;
  let telegramChatId: string | undefined;
  let operation: "send-group-message" | "send-private-message" =
    "send-group-message";
  if (event.eventType === "contribution.manual-payment-required") {
    const contribution = await client.cycleContribution.findUnique({
      where: { id: event.aggregateId },
      select: { member: { select: { telegramUserId: true } } },
    });
    telegramChatId = contribution?.member.telegramUserId;
    operation = "send-private-message";
  } else if (event.eventType.startsWith("payout.")) {
    const payout = await client.payout.findUnique({
      where: { id: event.aggregateId },
      select: {
        cycle: {
          select: {
            collage: {
              select: { chat: { select: { telegramChatId: true } } },
            },
          },
        },
      },
    });
    telegramChatId = payout?.cycle.collage.chat.telegramChatId;
  } else if (event.eventType.startsWith("cycle.")) {
    const cycle = await client.cycle.findUnique({
      where: { id: event.aggregateId },
      select: {
        collage: {
          select: { chat: { select: { telegramChatId: true } } },
        },
      },
    });
    telegramChatId = cycle?.collage.chat.telegramChatId;
  } else if (event.eventType === "member.left") {
    const member = await client.collageMember.findUnique({
      where: { id: event.aggregateId },
      select: {
        collage: {
          select: { chat: { select: { telegramChatId: true } } },
        },
      },
    });
    telegramChatId = member?.collage.chat.telegramChatId;
  } else {
    const collage = await client.collage.findUnique({
      where: { id: event.aggregateId },
      select: { chat: { select: { telegramChatId: true } } },
    });
    telegramChatId = collage?.chat.telegramChatId;
  }
  if (telegramChatId === undefined) return undefined;
  return {
    queue: "telegram-notifications",
    name: definition.type,
    id: deterministicJobId("telegram-notification", event.id),
    data: {
      deliveryId: event.id,
      type: definition.type,
      operation,
      telegramChatId,
      text: definition.text,
      parseMode: "HTML",
      buttons: [],
    },
  };
};

export class TransactionalOutboxPublisher {
  constructor(
    private readonly client: PrismaClient,
    private readonly scheduler: JobScheduler,
  ) {}

  async publishBatch(limit = 100): Promise<number> {
    const events = await withSerializableTransaction(
      this.client,
      (transaction) => claimOutboxEvents(transaction, limit),
    );
    let published = 0;
    for (const event of events) {
      try {
        const [job, notification] = await Promise.all([
          Promise.resolve(routeEvent(event)),
          notificationForEvent(this.client, event),
        ]);
        if (job !== undefined) await this.scheduler.enqueue(job);
        if (notification !== undefined)
          await this.scheduler.enqueue(notification);
        await withSerializableTransaction(this.client, (transaction) =>
          markOutboxEventPublished(transaction, event.id),
        );
        published += 1;
      } catch (error) {
        const code =
          error instanceof z.ZodError
            ? "OUTBOX_PAYLOAD_INVALID"
            : "OUTBOX_PUBLISH_FAILED";
        await withSerializableTransaction(this.client, (transaction) =>
          markOutboxEventFailed(transaction, event.id, code),
        );
        throw error;
      }
    }
    return published;
  }
}

import type { Prisma } from "../generated/client/client.js";
import type { OutboxEvent } from "../generated/client/client.js";
import type { TransactionClient } from "./transaction.js";

export interface AuditRecord {
  readonly action: string;
  readonly actorId?: string;
  readonly actorType: string;
  readonly correlationId: string;
  readonly entityId: string;
  readonly entityType: string;
  readonly safeMetadata: Prisma.InputJsonValue;
  readonly source: string;
}

export const appendAuditLog = (
  transaction: TransactionClient,
  record: AuditRecord,
) =>
  transaction.auditLog.create({
    data: {
      actorType: record.actorType,
      actorId: record.actorId ?? null,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      correlationId: record.correlationId,
      source: record.source,
      safeMetadata: record.safeMetadata,
    },
  });

export interface OutboxRecord {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly aggregateVersion: number;
  readonly causationId?: string;
  readonly correlationId: string;
  readonly eventType: string;
  readonly payload: Prisma.InputJsonValue;
  readonly schemaVersion?: number;
}

export const appendOutboxEvent = (
  transaction: TransactionClient,
  record: OutboxRecord,
) =>
  transaction.outboxEvent.create({
    data: {
      eventType: record.eventType,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      aggregateVersion: record.aggregateVersion,
      schemaVersion: record.schemaVersion ?? 1,
      correlationId: record.correlationId,
      causationId: record.causationId ?? null,
      payload: record.payload,
    },
  });

interface OutboxId {
  readonly id: string;
}

export const claimOutboxEvents = async (
  transaction: TransactionClient,
  limit = 100,
): Promise<readonly OutboxEvent[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Outbox claim size must be between 1 and 500");
  }
  const claimed = await transaction.$queryRaw<OutboxId[]>`
    SELECT "id"
    FROM "outbox_events"
    WHERE "publishedAt" IS NULL
    ORDER BY "occurredAt", "id"
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
  const ids = claimed.map(({ id }) => id);
  if (ids.length === 0) {
    return [];
  }
  await transaction.outboxEvent.updateMany({
    where: { id: { in: ids } },
    data: { publishAttempts: { increment: 1 }, lastErrorCode: null },
  });
  return transaction.outboxEvent.findMany({
    where: { id: { in: ids } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
};

export const markOutboxEventPublished = (
  transaction: TransactionClient,
  eventId: string,
  publishedAt = new Date(),
) =>
  transaction.outboxEvent.updateMany({
    where: { id: eventId, publishedAt: null },
    data: { publishedAt, lastErrorCode: null },
  });

export const markOutboxEventFailed = (
  transaction: TransactionClient,
  eventId: string,
  safeErrorCode: string,
) =>
  transaction.outboxEvent.updateMany({
    where: { id: eventId, publishedAt: null },
    data: { lastErrorCode: safeErrorCode.slice(0, 128) },
  });

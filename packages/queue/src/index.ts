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

export const deterministicJobId = (
  operation: string,
  entityId: string,
): string => `${operation}:${entityId}`;

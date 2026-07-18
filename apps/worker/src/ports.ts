export interface ScheduledJob {
  readonly data: Readonly<Record<string, unknown>>;
  readonly delayMs?: number;
  readonly id: string;
  readonly name: string;
  readonly queue:
    | "collage-lifecycle"
    | "maintenance"
    | "payment-processing"
    | "payment-reconciliation"
    | "payment-scheduling"
    | "payout-processing"
    | "payout-reconciliation"
    | "reminders"
    | "telegram-notifications";
}

export interface JobScheduler {
  enqueue(job: ScheduledJob): Promise<void>;
}

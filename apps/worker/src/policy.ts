import type {
  PaymentOutcome,
  ProviderFailure,
  TransferOutcome,
} from "@collage/monnify";

export type OperationDecision =
  | { readonly kind: "succeeded" }
  | { readonly kind: "poll"; readonly delayMs: number }
  | { readonly kind: "retry"; readonly delayMs: number }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "terminal"; readonly reason: string };

const retryCadenceMs = [60_000, 5 * 60_000, 30 * 60_000] as const;

export const retryDelay = (attemptNumber: number): number =>
  retryCadenceMs[
    Math.min(Math.max(attemptNumber - 1, 0), retryCadenceMs.length - 1)
  ] ?? 30 * 60_000;

export const classifyPaymentOutcome = (
  outcome: PaymentOutcome,
  attemptNumber: number,
  maximumAttempts: number,
  pendingPollMs: number,
): OperationDecision => {
  switch (outcome) {
    case "paid":
      return { kind: "succeeded" };
    case "pending":
    case "unknown":
      return { kind: "poll", delayMs: pendingPollMs };
    case "failed":
      return attemptNumber < maximumAttempts
        ? { kind: "retry", delayMs: retryDelay(attemptNumber) }
        : { kind: "manual", reason: "automatic-attempts-exhausted" };
    case "expired":
      return { kind: "manual", reason: "provider-operation-expired" };
    case "reversed":
      return { kind: "terminal", reason: "provider-operation-reversed" };
  }
};

export const classifyTransferOutcome = (
  outcome: TransferOutcome,
  pendingPollMs: number,
): OperationDecision => {
  switch (outcome) {
    case "successful":
      return { kind: "succeeded" };
    case "pending":
    case "pending_authorization":
    case "in_progress":
    case "unknown":
      return { kind: "poll", delayMs: pendingPollMs };
    case "failed":
    case "expired":
      return { kind: "terminal", reason: `provider-transfer-${outcome}` };
    case "reversed":
      return { kind: "terminal", reason: "provider-transfer-reversed" };
  }
};

export const classifyProviderFailure = (
  failure: ProviderFailure,
  pendingPollMs: number,
): OperationDecision => {
  if (
    failure.kind === "timeout" ||
    failure.kind === "unknown" ||
    failure.kind === "rate_limited" ||
    failure.kind === "retryable"
  ) {
    return { kind: "poll", delayMs: pendingPollMs };
  }
  return { kind: "terminal", reason: failure.code };
};

export interface DeadlineDecisionInput {
  readonly allPaid: boolean;
  readonly now: Date;
  readonly deadlineAt: Date;
  readonly graceEndsAt: Date;
}

export const evaluateDeadline = (
  input: DeadlineDecisionInput,
): "collecting" | "ready" | "overdue" | "blocked" => {
  if (input.allPaid) return "ready";
  if (input.now >= input.graceEndsAt) return "blocked";
  if (input.now >= input.deadlineAt) return "overdue";
  return "collecting";
};

export type ProviderOutcome =
  | "successful"
  | "pending"
  | "retryable_failure"
  | "terminal_failure"
  | "unknown";

export interface ProviderReference {
  readonly reference: string;
  readonly outcome: ProviderOutcome;
}

export const MONNIFY_ADAPTER_IMPLEMENTED = false;

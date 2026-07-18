export type ProviderOutcome =
  | "successful"
  | "pending"
  | "retryable_failure"
  | "terminal_failure"
  | "unknown";

export type PaymentOutcome =
  "paid" | "pending" | "failed" | "expired" | "reversed" | "unknown";

export type MandateOutcome =
  | "pending"
  | "pending_authorization"
  | "pending_activation"
  | "activated"
  | "authorization_expired"
  | "expired"
  | "cancelled"
  | "suspended"
  | "failed"
  | "unknown";

export type TransferOutcome =
  | "pending"
  | "pending_authorization"
  | "in_progress"
  | "successful"
  | "failed"
  | "reversed"
  | "expired"
  | "unknown";

export interface ProviderFailure {
  readonly code: string;
  readonly kind:
    | "authentication"
    | "conflict"
    | "invalid_request"
    | "rate_limited"
    | "retryable"
    | "terminal"
    | "timeout"
    | "unknown";
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
}

export class MonnifyError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(failure.message);
    this.name = "MonnifyError";
  }
}

export interface Bank {
  readonly code: string;
  readonly name: string;
}

export interface AccountValidation {
  readonly accountName: string;
  readonly accountNumber: string;
  readonly bankCode: string;
}

export interface CheckoutInitialization {
  readonly checkoutUrl: string;
  readonly paymentReference: string;
  readonly transactionReference: string;
}

export interface TransactionVerification {
  readonly amountPaidMinor: bigint;
  readonly cardToken?: string;
  readonly currency: string;
  readonly outcome: PaymentOutcome;
  readonly paymentMethod?: string;
  readonly paymentReference: string;
  readonly rawStatus: string;
  readonly transactionReference: string;
}

export interface MandateResult {
  readonly authorizationLink?: string;
  readonly mandateCode?: string;
  readonly mandateReference: string;
  readonly outcome: MandateOutcome;
  readonly rawStatus: string;
}

export interface MandateDebitResult {
  readonly outcome: PaymentOutcome;
  readonly paymentReference: string;
  readonly rawStatus: string;
  readonly transactionReference?: string;
}

export interface TransferResult {
  readonly amountMinor: bigint;
  readonly outcome: TransferOutcome;
  readonly rawStatus: string;
  readonly reference: string;
  readonly transactionReference?: string;
}

export interface WalletBalance {
  readonly accountNumber: string;
  readonly availableBalanceMinor: bigint;
  readonly currency: string;
  readonly ledgerBalanceMinor: bigint;
}

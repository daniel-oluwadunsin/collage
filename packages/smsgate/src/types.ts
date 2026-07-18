export type SmsGateAuthenticationMode = "basic" | "jwt";
export type SmsGateDeploymentMode = "cloud" | "local" | "private";

export type SmsGateMessageState =
  "Pending" | "Processed" | "Sent" | "Delivered" | "Failed";

export interface SmsGateConfig {
  /**
   * Local server origin or full cloud/private third-party API prefix.
   */
  readonly apiBaseUrl: string;
  readonly authenticationMode: SmsGateAuthenticationMode;
  readonly deploymentMode: SmsGateDeploymentMode;
  readonly password: string;
  readonly tokenTtlSeconds?: number;
  readonly timeoutMilliseconds?: number;
  readonly username: string;
}

export interface SmsGateSendMessageInput {
  readonly deviceId?: string;
  readonly id: string;
  readonly phoneNumber: string;
  readonly priority?: number;
  readonly simNumber?: number;
  readonly text: string;
  readonly ttlSeconds: number;
  readonly withDeliveryReport?: boolean;
}

export interface SmsGateMessageResult {
  readonly deviceId: string;
  readonly id: string;
  readonly state: SmsGateMessageState;
}

export interface SmsGateFailure {
  readonly code: string;
  readonly kind:
    | "authentication"
    | "conflict"
    | "invalid_request"
    | "rate_limited"
    | "retryable"
    | "timeout"
    | "unknown";
  readonly message: string;
  readonly outcomeUnknown: boolean;
  readonly retryable: boolean;
  readonly status?: number;
}

export class SmsGateError extends Error {
  constructor(readonly failure: SmsGateFailure) {
    super(failure.message);
    this.name = "SmsGateError";
  }
}

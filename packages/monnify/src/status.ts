import type {
  MandateOutcome,
  PaymentOutcome,
  ProviderFailure,
  TransferOutcome,
} from "./types.js";

export const mapPaymentStatus = (status: string): PaymentOutcome => {
  switch (status.toUpperCase()) {
    case "PAID":
    case "OVERPAID":
      return "paid";
    case "PENDING":
    case "AWAITING_PAYMENT":
    case "PROCESSING":
      return "pending";
    case "FAILED":
      return "failed";
    case "EXPIRED":
    case "ABANDONED":
      return "expired";
    case "REVERSED":
    case "REFUNDED":
      return "reversed";
    default:
      return "unknown";
  }
};

export const mapMandateStatus = (status: string): MandateOutcome => {
  switch (status.toUpperCase().replaceAll("_", " ")) {
    case "PENDING":
      return "pending";
    case "PENDING AUTHORIZATION":
      return "pending_authorization";
    case "PENDING ACTIVATION":
      return "pending_activation";
    case "ACTIVATED":
    case "ACTIVE":
      return "activated";
    case "AUTHORIZATION EXPIRED":
      return "authorization_expired";
    case "EXPIRED":
      return "expired";
    case "CANCELLED":
      return "cancelled";
    case "SUSPENDED":
      return "suspended";
    case "FAILED":
      return "failed";
    default:
      return "unknown";
  }
};

export const mapTransferStatus = (status: string): TransferOutcome => {
  switch (status.toUpperCase()) {
    case "PENDING":
    case "AWAITING_PROCESSING":
      return "pending";
    case "PENDING_AUTHORIZATION":
    case "OTP_EMAIL_DISPATCH_FAILED":
      return "pending_authorization";
    case "IN_PROGRESS":
      return "in_progress";
    case "SUCCESS":
    case "COMPLETED":
      return "successful";
    case "FAILED":
      return "failed";
    case "REVERSED":
      return "reversed";
    case "EXPIRED":
      return "expired";
    default:
      return "unknown";
  }
};

export const classifyProviderError = (
  status: number | undefined,
  code: string,
  message = "Monnify request failed.",
): ProviderFailure => {
  if (status === 401 || status === 403) {
    return {
      code,
      kind: "authentication",
      message,
      retryable: false,
      status,
    };
  }
  if (status === 409 || code === "D05" || code === "D07") {
    return {
      code,
      kind: "conflict",
      message,
      retryable: false,
      ...(status === undefined ? {} : { status }),
    };
  }
  if (status === 429) {
    return { code, kind: "rate_limited", message, retryable: true, status };
  }
  if (
    status !== undefined &&
    (status >= 500 || code === "99" || /timeout|malfunction/iu.test(message))
  ) {
    return { code, kind: "retryable", message, retryable: true, status };
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      code,
      kind: "invalid_request",
      message,
      retryable: false,
      status,
    };
  }
  return {
    code,
    kind: "unknown",
    message,
    retryable: false,
    ...(status === undefined ? {} : { status }),
  };
};

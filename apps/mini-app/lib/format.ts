export const formatMoney = (minor: string): string => {
  const amount = BigInt(minor);
  const major = amount / 100n;
  const fraction = amount % 100n;
  const formattedMajor = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(major);
  return fraction === 0n
    ? formattedMajor
    : `${formattedMajor}.${fraction.toString().padStart(2, "0")}`;
};

export const frequencyLabel = (
  frequency: "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY",
  interval = 1,
): string => {
  const unit = frequency.toLowerCase().replace(/ly$/u, "");
  return interval === 1
    ? frequency.toLowerCase()
    : `every ${String(interval)} ${unit}s`;
};

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export const terminalAuthorizationStates = new Set([
  "SUCCEEDED",
  "FAILED_TERMINAL",
  "EXPIRED",
  "CANCELLED",
  "activated",
  "failed",
  "expired",
  "authorization_expired",
]);

export const successfulAuthorizationStates = new Set([
  "SUCCEEDED",
  "activated",
]);

export const terminalPaymentStates = new Set([
  "SUCCEEDED",
  "FAILED_TERMINAL",
  "EXPIRED",
  "REVERSED",
]);

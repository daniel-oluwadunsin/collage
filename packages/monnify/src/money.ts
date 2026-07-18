import { MonnifyError } from "./types.js";

export const minorToMajorDecimal = (minor: bigint): string => {
  if (minor < 0n) {
    throw new MonnifyError({
      code: "INVALID_AMOUNT",
      kind: "invalid_request",
      message: "Provider amount cannot be negative.",
      retryable: false,
    });
  }
  const naira = minor / 100n;
  const kobo = (minor % 100n).toString().padStart(2, "0");
  return `${naira.toString()}.${kobo}`;
};

export const providerAmountToMinor = (value: unknown): bigint => {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new MonnifyError({
      code: "INVALID_PROVIDER_AMOUNT",
      kind: "unknown",
      message: "Monnify returned an invalid amount.",
      retryable: false,
    });
  }
  const decimal = String(value);
  const match = /^(?<whole>\d+)(?:\.(?<fraction>\d{1,2}))?$/u.exec(decimal);
  if (match?.groups === undefined) {
    throw new MonnifyError({
      code: "INVALID_PROVIDER_AMOUNT",
      kind: "unknown",
      message: "Monnify returned an amount with unsupported precision.",
      retryable: false,
    });
  }
  return (
    BigInt(match.groups.whole ?? "0") * 100n +
    BigInt((match.groups.fraction ?? "").padEnd(2, "0"))
  );
};

export const serializeProviderJson = (value: unknown): string => {
  if (typeof value === "bigint") {
    return minorToMajorDecimal(value);
  }
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Provider JSON numbers must be safe integers");
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeProviderJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${serializeProviderJson(nested)}`,
      )
      .join(",")}}`;
  }
  throw new Error(`Unsupported provider JSON value: ${typeof value}`);
};

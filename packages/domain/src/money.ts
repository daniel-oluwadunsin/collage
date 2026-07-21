import { DomainInvariantError } from "./errors.js";

declare const moneyMinorBrand: unique symbol;

export type MoneyMinor = bigint & { readonly [moneyMinorBrand]: true };

export const asMoneyMinor = (value: bigint): MoneyMinor => {
  if (value < 0n) {
    throw new DomainInvariantError(
      "MONEY_NEGATIVE",
      "Money minor units cannot be negative.",
    );
  }
  return value as MoneyMinor;
};

export const parseMoneyDecimal = (
  value: string,
  fractionDigits = 2,
): MoneyMinor => {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new DomainInvariantError(
      "MONEY_INVALID_DECIMAL",
      "Money must be an unsigned decimal string.",
    );
  }

  const [whole = "", fraction = ""] = value.split(".");
  if (fraction.length > fractionDigits) {
    throw new DomainInvariantError(
      "MONEY_UNSUPPORTED_PRECISION",
      `Money supports at most ${fractionDigits.toString()} decimal places.`,
    );
  }

  const scale = 10n ** BigInt(fractionDigits);
  const paddedFraction = fraction.padEnd(fractionDigits, "0");
  return asMoneyMinor(BigInt(whole) * scale + BigInt(paddedFraction || "0"));
};

export const formatMoneyDecimal = (
  value: MoneyMinor,
  fractionDigits = 2,
): string => {
  const scale = 10n ** BigInt(fractionDigits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(fractionDigits, "0");
  return fractionDigits === 0
    ? whole.toString()
    : `${whole.toString()}.${fraction}`;
};

/** Formats minor units for people without converting the bigint through Number. */
export const formatMoneyDisplay = (
  currency: string,
  value: bigint,
  fractionDigits = 2,
): string => {
  if (!Number.isSafeInteger(fractionDigits) || fractionDigits < 0) {
    throw new DomainInvariantError(
      "MONEY_INVALID_FRACTION_DIGITS",
      "Money fraction digits must be a non-negative safe integer.",
    );
  }
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(fractionDigits);
  const whole = (absolute / scale)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const fraction = absolute % scale;
  const fractionText =
    fractionDigits > 0 && fraction > 0n
      ? `.${fraction.toString().padStart(fractionDigits, "0")}`
      : "";
  const symbol = currency.toUpperCase() === "NGN" ? "₦" : `${currency} `;
  return `${value < 0n ? "-" : ""}${symbol}${whole}${fractionText}`;
};

export const serializeMoneyMinor = (value: MoneyMinor): string =>
  value.toString();

export const addMoney = (left: MoneyMinor, right: MoneyMinor): MoneyMinor =>
  asMoneyMinor(left + right);

export const subtractMoney = (
  left: MoneyMinor,
  right: MoneyMinor,
): MoneyMinor => {
  if (right > left) {
    throw new DomainInvariantError(
      "MONEY_UNDERFLOW",
      "Money subtraction cannot produce a negative amount.",
    );
  }
  return asMoneyMinor(left - right);
};

export const multiplyMoney = (
  value: MoneyMinor,
  multiplier: number,
): MoneyMinor => {
  if (!Number.isSafeInteger(multiplier) || multiplier < 0) {
    throw new DomainInvariantError(
      "MONEY_INVALID_MULTIPLIER",
      "Money multiplier must be a non-negative safe integer.",
    );
  }
  return asMoneyMinor(value * BigInt(multiplier));
};

export const isNonNegativeMoney = (value: MoneyMinor): boolean => value >= 0n;

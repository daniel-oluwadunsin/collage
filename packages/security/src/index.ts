export * from "./crypto.js";
export * from "./internal-auth.js";
export * from "./launch-token.js";

declare const correlationIdBrand: unique symbol;

export type CorrelationId = string & {
  readonly [correlationIdBrand]: true;
};

export const asCorrelationId = (value: string): CorrelationId =>
  value as CorrelationId;

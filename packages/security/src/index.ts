declare const correlationIdBrand: unique symbol;

export type CorrelationId = string & {
  readonly [correlationIdBrand]: true;
};

export const asCorrelationId = (value: string): CorrelationId =>
  value as CorrelationId;

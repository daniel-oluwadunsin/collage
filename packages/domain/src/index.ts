declare const moneyMinorBrand: unique symbol;

export type MoneyMinor = bigint & { readonly [moneyMinorBrand]: true };

export const asMoneyMinor = (value: bigint): MoneyMinor => value as MoneyMinor;

export const addMoney = (left: MoneyMinor, right: MoneyMinor): MoneyMinor =>
  asMoneyMinor(left + right);

export const isNonNegativeMoney = (value: MoneyMinor): boolean => value >= 0n;

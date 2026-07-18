import { DomainInvariantError } from "./errors.js";
import { addMoney, asMoneyMinor, type MoneyMinor } from "./money.js";

export type LedgerSide = "DEBIT" | "CREDIT";

export interface LedgerCommandEntry {
  readonly accountId: string;
  readonly amount: MoneyMinor;
  readonly side: LedgerSide;
}

export interface LedgerCommand {
  readonly correlationId: string;
  readonly currency: "NGN";
  readonly description: string;
  readonly entries: readonly LedgerCommandEntry[];
  readonly idempotencyKey: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly reversalOfId?: string;
}

export const validateBalancedLedgerCommand = (
  command: LedgerCommand,
): LedgerCommand => {
  if (command.entries.length < 2) {
    throw new DomainInvariantError(
      "LEDGER_ENTRIES_INSUFFICIENT",
      "A ledger transaction requires at least two entries.",
    );
  }
  const debit = command.entries
    .filter((entry) => entry.side === "DEBIT")
    .reduce((total, entry) => addMoney(total, entry.amount), asMoneyMinor(0n));
  const credit = command.entries
    .filter((entry) => entry.side === "CREDIT")
    .reduce((total, entry) => addMoney(total, entry.amount), asMoneyMinor(0n));
  if (debit !== credit || debit === 0n) {
    throw new DomainInvariantError(
      "LEDGER_UNBALANCED",
      "Ledger debits and credits must be equal and non-zero.",
    );
  }
  return command;
};

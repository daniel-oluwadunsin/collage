import {
  validateBalancedLedgerCommand,
  type LedgerCommand,
} from "@collage/domain";

import type { LedgerTransaction } from "../generated/client/client.js";
import type { TransactionClient } from "./transaction.js";

export const appendLedgerTransaction = async (
  transaction: TransactionClient,
  command: LedgerCommand,
): Promise<LedgerTransaction> => {
  validateBalancedLedgerCommand(command);
  const existing = await transaction.ledgerTransaction.findUnique({
    where: { idempotencyKey: command.idempotencyKey },
  });
  if (existing !== null) {
    return existing;
  }
  return transaction.ledgerTransaction.create({
    data: {
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      referenceType: command.referenceType,
      referenceId: command.referenceId,
      description: command.description,
      currency: "NGN",
      ...(command.reversalOfId === undefined
        ? {}
        : { reversalOf: { connect: { id: command.reversalOfId } } }),
      entries: {
        create: command.entries.map((entry) => ({
          accountId: entry.accountId,
          side: entry.side,
          amountMinor: entry.amount,
        })),
      },
    },
  });
};

export const reverseLedgerTransaction = async (
  transaction: TransactionClient,
  originalTransactionId: string,
  metadata: {
    readonly correlationId: string;
    readonly description: string;
    readonly idempotencyKey: string;
  },
): Promise<LedgerTransaction> => {
  const original = await transaction.ledgerTransaction.findUniqueOrThrow({
    where: { id: originalTransactionId },
    include: { entries: true },
  });
  return appendLedgerTransaction(transaction, {
    ...metadata,
    currency: "NGN",
    referenceType: "LEDGER_REVERSAL",
    referenceId: original.id,
    reversalOfId: original.id,
    entries: original.entries.map((entry) => ({
      accountId: entry.accountId,
      amount: entry.amountMinor as LedgerCommand["entries"][number]["amount"],
      side: entry.side === "DEBIT" ? "CREDIT" : "DEBIT",
    })),
  });
};

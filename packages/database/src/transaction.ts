import type { PrismaClient } from "./client.js";

import { withSerializationRetry } from "./retry.js";

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

export const withSerializableTransaction = <Result>(
  client: PrismaClient,
  operation: (transaction: TransactionClient) => Promise<Result>,
): Promise<Result> =>
  withSerializationRetry(() =>
    client.$transaction(
      (transaction) => operation(transaction as unknown as TransactionClient),
      {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 15_000,
      },
    ),
  );

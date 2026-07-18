import type { TransactionClient } from "./transaction.js";

interface LockedId {
  readonly id: string;
}

const expectLocked = (rows: readonly LockedId[], entity: string): void => {
  if (rows.length !== 1) {
    throw new Error(`${entity} does not exist`);
  }
};

export const lockAggregate = async (
  transaction: TransactionClient,
  aggregateType: string,
  aggregateId: string,
): Promise<void> => {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${aggregateType}:${aggregateId}`}, 0)
    )
  `;
};

export const lockCollage = async (
  transaction: TransactionClient,
  collageId: string,
): Promise<void> => {
  const rows = await transaction.$queryRaw<LockedId[]>`
    SELECT "id" FROM "collages" WHERE "id" = ${collageId}::uuid FOR UPDATE
  `;
  expectLocked(rows, "Collage");
};

export const lockMember = async (
  transaction: TransactionClient,
  memberId: string,
): Promise<void> => {
  const rows = await transaction.$queryRaw<LockedId[]>`
    SELECT "id" FROM "collage_members" WHERE "id" = ${memberId}::uuid FOR UPDATE
  `;
  expectLocked(rows, "Member");
};

export const lockCycle = async (
  transaction: TransactionClient,
  cycleId: string,
): Promise<void> => {
  const rows = await transaction.$queryRaw<LockedId[]>`
    SELECT "id" FROM "cycles" WHERE "id" = ${cycleId}::uuid FOR UPDATE
  `;
  expectLocked(rows, "Cycle");
};

export const lockContribution = async (
  transaction: TransactionClient,
  contributionId: string,
): Promise<void> => {
  const rows = await transaction.$queryRaw<LockedId[]>`
    SELECT "id" FROM "cycle_contributions"
    WHERE "id" = ${contributionId}::uuid FOR UPDATE
  `;
  expectLocked(rows, "Contribution");
};

export const lockPayout = async (
  transaction: TransactionClient,
  payoutId: string,
): Promise<void> => {
  const rows = await transaction.$queryRaw<LockedId[]>`
    SELECT "id" FROM "payouts" WHERE "id" = ${payoutId}::uuid FOR UPDATE
  `;
  expectLocked(rows, "Payout");
};

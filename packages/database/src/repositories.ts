import {
  canRetryPayout,
  memberStateAfterLeavingTelegram,
} from "@collage/domain";

import type {
  PaymentMethod,
  Payout,
  PayoutAttempt,
  PayoutPositionReservation,
} from "../generated/client/client.js";
import type { Prisma } from "../generated/client/client.js";
import type { PrismaClient } from "./client.js";
import { appendAuditLog, appendOutboxEvent } from "./event-repositories.js";
import { lockCollage, lockCycle, lockMember, lockPayout } from "./locks.js";
import {
  withSerializableTransaction,
  type TransactionClient,
} from "./transaction.js";

export interface PositionReservationInput {
  readonly collageId: string;
  readonly expiresAt: Date;
  readonly position: number;
  readonly userId: string;
}

export const reservePayoutPosition = (
  client: PrismaClient,
  input: PositionReservationInput,
): Promise<PayoutPositionReservation> =>
  withSerializableTransaction(client, async (transaction) => {
    await lockCollage(transaction, input.collageId);
    const collage = await transaction.collage.findUniqueOrThrow({
      where: { id: input.collageId },
      select: { participantLimit: true, state: true },
    });
    if (
      collage.state !== "REGISTRATION_OPEN" ||
      !Number.isSafeInteger(input.position) ||
      input.position < 1 ||
      input.position > collage.participantLimit
    ) {
      throw new Error("Position cannot be reserved");
    }
    await transaction.payoutPositionReservation.updateMany({
      where: {
        collageId: input.collageId,
        state: "RESERVED",
        expiresAt: { lte: new Date() },
      },
      data: { state: "EXPIRED" },
    });
    return transaction.payoutPositionReservation.create({
      data: input,
    });
  });

export interface RegistrationEvidence {
  readonly acceptedRuleVersionId: string;
  readonly identityVerificationMode: string;
  readonly identityVerifiedAt: Date | null;
  readonly legalNameEncrypted: string;
  readonly ninEncrypted: string;
  readonly ninHash: string;
  readonly phoneEncrypted: string;
  readonly phoneHash: string;
  readonly phoneVerifiedAt: Date;
  readonly preferredChargeRule: Prisma.InputJsonValue;
  readonly recurringConsentAt: Date;
}

export interface RegistrationResult {
  readonly collageStarted: boolean;
  readonly memberId: string;
}

export const completeRegistration = (
  client: PrismaClient,
  memberId: string,
  evidence: RegistrationEvidence,
  correlationId: string,
  now = new Date(),
  options: { readonly requireActivePaymentMethod?: boolean } = {},
): Promise<RegistrationResult> =>
  withSerializableTransaction(client, async (transaction) => {
    await lockMember(transaction, memberId);
    const member = await transaction.collageMember.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        collage: { select: { currentRuleVersion: true, state: true } },
      },
    });
    await lockCollage(transaction, member.collageId);
    const [rule, paymentMethod, bankAccount] = await Promise.all([
      transaction.collageRuleVersion.findFirst({
        where: {
          id: evidence.acceptedRuleVersionId,
          collageId: member.collageId,
        },
      }),
      transaction.paymentMethod.findFirst({
        where: { memberId, state: "ACTIVE" },
      }),
      transaction.bankAccount.findFirst({
        where: { memberId, state: "VERIFIED", isDefault: true },
      }),
    ]);
    const requireActivePaymentMethod =
      options.requireActivePaymentMethod ?? true;
    const hasValidIdentityEvidence =
      evidence.identityVerificationMode === "COLLECTED_UNVERIFIED"
        ? evidence.identityVerifiedAt === null
        : evidence.identityVerifiedAt !== null;
    if (
      member.collage.state !== "REGISTRATION_OPEN" ||
      member.state !==
        (requireActivePaymentMethod
          ? "PAYMENT_METHOD_AUTHORIZING"
          : "PAYMENT_METHOD_REQUIRED") ||
      member.payoutPosition === null ||
      rule?.version !== member.collage.currentRuleVersion ||
      !hasValidIdentityEvidence ||
      (requireActivePaymentMethod && paymentMethod === null) ||
      bankAccount === null
    ) {
      throw new Error("Registration evidence is incomplete or stale");
    }
    const registeredMember = await transaction.collageMember.update({
      where: { id: memberId },
      data: {
        ...evidence,
        state: "REGISTERED",
        registeredAt: now,
        version: { increment: 1 },
      },
    });
    await appendOutboxEvent(transaction, {
      eventType: "registration.completed",
      aggregateType: "collage-member",
      aggregateId: memberId,
      aggregateVersion: registeredMember.version,
      correlationId,
      payload: { collageId: member.collageId, memberId },
    });
    await transaction.payoutPositionReservation.updateMany({
      where: {
        collageId: member.collageId,
        userId: member.userId,
        position: member.payoutPosition,
        state: "RESERVED",
      },
      data: { state: "COMPLETED" },
    });

    const collage = await transaction.collage.findUniqueOrThrow({
      where: { id: member.collageId },
      select: { participantLimit: true, version: true },
    });
    const registered = await transaction.collageMember.findMany({
      where: { collageId: member.collageId, state: "REGISTERED" },
      select: { payoutPosition: true },
    });
    const positions = new Set(
      registered.flatMap(
        ({ payoutPosition }: { readonly payoutPosition: number | null }) =>
          payoutPosition === null ? [] : [payoutPosition],
      ),
    );
    const ready =
      registered.length === collage.participantLimit &&
      positions.size === collage.participantLimit;
    if (!ready) {
      return { collageStarted: false, memberId };
    }
    const started = await transaction.collage.updateMany({
      where: { id: member.collageId, state: "REGISTRATION_OPEN" },
      data: {
        state: "STARTING",
        startedAt: now,
        firstCycleStartAt: now,
        rulesLockedAt: now,
        version: { increment: 1 },
      },
    });
    if (started.count === 1) {
      await appendOutboxEvent(transaction, {
        eventType: "collage.start.requested",
        aggregateType: "collage",
        aggregateId: member.collageId,
        aggregateVersion: collage.version + 1,
        correlationId,
        payload: { collageId: member.collageId },
      });
    }
    return { collageStarted: started.count === 1, memberId };
  });

export interface ActivatedPaymentMethod {
  readonly activeAt: Date;
  readonly credentialEncrypted: string;
  readonly credentialHash: string;
  readonly maskedLabel: string;
}

export const activateReplacementPaymentMethod = (
  client: PrismaClient,
  memberId: string,
  replacementId: string,
  activation: ActivatedPaymentMethod,
): Promise<PaymentMethod> =>
  withSerializableTransaction(client, async (transaction) => {
    await lockMember(transaction, memberId);
    const [current, replacement, unresolvedAttempt] = await Promise.all([
      transaction.paymentMethod.findFirst({
        where: { memberId, state: "ACTIVE" },
      }),
      transaction.paymentMethod.findFirst({
        where: { id: replacementId, memberId, state: "AUTHORIZING" },
      }),
      transaction.paymentAttempt.findFirst({
        where: {
          contribution: { memberId },
          state: { in: ["CREATED", "PENDING", "UNKNOWN"] },
        },
      }),
    ]);
    if (
      current === null ||
      replacement === null ||
      unresolvedAttempt !== null
    ) {
      throw new Error("Payment method replacement is not safe");
    }
    await transaction.paymentMethod.update({
      where: { id: current.id },
      data: { state: "REPLACED", replacedAt: activation.activeAt },
    });
    return transaction.paymentMethod.update({
      where: { id: replacement.id },
      data: { state: "ACTIVE", ...activation },
    });
  });

export const rejectCardAuthorizationWithoutReusableToken = (
  client: PrismaClient,
  authorizationId: string,
  correlationId: string,
  source: "api" | "worker",
): Promise<void> =>
  withSerializableTransaction(client, async (transaction) => {
    const authorization = await transaction.cardAuthorization.findUniqueOrThrow(
      {
        where: { id: authorizationId },
        include: { paymentMethod: true },
      },
    );
    await lockMember(transaction, authorization.paymentMethod.memberId);
    if (authorization.state === "FAILED_TERMINAL") return;
    await transaction.cardAuthorization.update({
      where: { id: authorization.id },
      data: { state: "FAILED_TERMINAL" },
    });
    await transaction.paymentMethod.updateMany({
      where: {
        id: authorization.paymentMethodId,
        state: "AUTHORIZING",
      },
      data: { state: "FAILED" },
    });
    await transaction.collageMember.updateMany({
      where: {
        id: authorization.paymentMethod.memberId,
        state: "PAYMENT_METHOD_AUTHORIZING",
      },
      data: { state: "PAYMENT_METHOD_REQUIRED" },
    });
    await appendAuditLog(transaction, {
      actorType: "SYSTEM",
      action: "card-authorization.reusable-token-unavailable",
      correlationId,
      entityType: "card-authorization",
      entityId: authorization.id,
      source,
      safeMetadata: {},
    });
  });

export const rejectDirectDebitMandate = (
  client: PrismaClient,
  mandateId: string,
  correlationId: string,
  source: "api" | "worker",
): Promise<void> =>
  withSerializableTransaction(client, async (transaction) => {
    const mandate = await transaction.directDebitMandate.findUniqueOrThrow({
      where: { id: mandateId },
      include: { paymentMethod: true },
    });
    await lockMember(transaction, mandate.paymentMethod.memberId);
    if (mandate.state === "FAILED_TERMINAL") return;
    await transaction.directDebitMandate.update({
      where: { id: mandate.id },
      data: { state: "FAILED_TERMINAL" },
    });
    await transaction.paymentMethod.updateMany({
      where: { id: mandate.paymentMethodId, state: "AUTHORIZING" },
      data: { state: "FAILED" },
    });
    await transaction.collageMember.updateMany({
      where: {
        id: mandate.paymentMethod.memberId,
        state: "PAYMENT_METHOD_AUTHORIZING",
      },
      data: { state: "PAYMENT_METHOD_REQUIRED" },
    });
    await appendAuditLog(transaction, {
      actorType: "SYSTEM",
      action: "direct-debit-mandate.authorization-failed",
      correlationId,
      entityType: "direct-debit-mandate",
      entityId: mandate.id,
      source,
      safeMetadata: {},
    });
  });

interface PotBalanceRow {
  readonly balance: bigint;
}

const collagePotBalance = async (
  transaction: TransactionClient,
  collageId: string,
): Promise<bigint> => {
  const rows = await transaction.$queryRaw<PotBalanceRow[]>`
    SELECT COALESCE(
      sum(CASE WHEN le."side" = 'CREDIT' THEN le."amountMinor" ELSE -le."amountMinor" END),
      0
    )::bigint AS "balance"
    FROM "ledger_entries" le
    JOIN "ledger_accounts" la ON la."id" = le."accountId"
    WHERE la."collageId" = ${collageId}::uuid AND la."code" = 'COLLAGE_POT'
  `;
  return rows[0]?.balance ?? 0n;
};

export interface EligiblePayoutInput {
  readonly correlationId: string;
  readonly cycleId: string;
  readonly idempotencyKey: string;
}

export const createEligiblePayout = (
  client: PrismaClient,
  input: EligiblePayoutInput,
): Promise<Payout> =>
  withSerializableTransaction(client, async (transaction) => {
    await lockCycle(transaction, input.cycleId);
    const existing = await transaction.payout.findUnique({
      where: { cycleId: input.cycleId },
    });
    if (existing !== null) {
      return existing;
    }
    const cycle = await transaction.cycle.findUniqueOrThrow({
      where: { id: input.cycleId },
      include: {
        contributions: { select: { state: true } },
        recipient: {
          include: {
            bankAccounts: {
              where: { state: "VERIFIED", isDefault: true },
              take: 1,
            },
          },
        },
      },
    });
    const potBalance = await collagePotBalance(transaction, cycle.collageId);
    if (
      cycle.state !== "READY_FOR_PAYOUT" ||
      cycle.confirmedAmountMinor !== cycle.expectedAmountMinor ||
      potBalance !== cycle.expectedAmountMinor ||
      cycle.contributions.length < 2 ||
      !cycle.contributions.every(
        ({ state }: { readonly state: string }) => state === "PAID",
      ) ||
      cycle.recipient.bankAccounts.length !== 1
    ) {
      throw new Error("Cycle is not strictly eligible for payout");
    }
    const bankAccount = cycle.recipient.bankAccounts[0];
    if (bankAccount === undefined) {
      throw new Error("Verified payout account disappeared");
    }
    const payout = await transaction.payout.create({
      data: {
        cycleId: cycle.id,
        memberId: cycle.recipientMemberId,
        bankAccountId: bankAccount.id,
        amountMinor: cycle.expectedAmountMinor,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await transaction.cycle.update({
      where: { id: cycle.id },
      data: { state: "PAYOUT_PROCESSING", version: { increment: 1 } },
    });
    await appendOutboxEvent(transaction, {
      eventType: "payout.ready",
      aggregateType: "payout",
      aggregateId: payout.id,
      aggregateVersion: payout.version,
      correlationId: input.correlationId,
      payload: { payoutId: payout.id },
    });
    return payout;
  });

export interface PayoutRetryInput {
  readonly idempotencyKey: string;
  readonly payoutId: string;
  readonly providerEnvironment: string;
  readonly providerReference: string;
}

export const createPayoutRetryAttempt = (
  client: PrismaClient,
  input: PayoutRetryInput,
): Promise<PayoutAttempt> =>
  withSerializableTransaction(client, async (transaction) => {
    await lockPayout(transaction, input.payoutId);
    const payout = await transaction.payout.findUniqueOrThrow({
      where: { id: input.payoutId },
    });
    const unresolved = await transaction.payoutAttempt.findFirst({
      where: {
        payoutId: payout.id,
        state: { in: ["CREATED", "PENDING", "UNKNOWN"] },
      },
    });
    if (!canRetryPayout(payout.state, unresolved !== null)) {
      throw new Error("Payout cannot be retried while status is unresolved");
    }
    await transaction.payout.update({
      where: { id: payout.id },
      data: { state: "PROCESSING", version: { increment: 1 } },
    });
    return transaction.payoutAttempt.create({
      data: {
        payoutId: payout.id,
        providerEnvironment: input.providerEnvironment,
        providerReference: input.providerReference,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });

export const markMemberLeftTelegram = (
  client: PrismaClient,
  memberId: string,
  leftAt = new Date(),
) =>
  withSerializableTransaction(client, async (transaction) => {
    await lockMember(transaction, memberId);
    const member = await transaction.collageMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    return transaction.collageMember.update({
      where: { id: memberId },
      data: {
        telegramLeftAt: leftAt,
        state: memberStateAfterLeavingTelegram(member.state),
        version: { increment: 1 },
      },
    });
  });

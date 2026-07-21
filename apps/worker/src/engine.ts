import { createHash, randomUUID } from "node:crypto";

import {
  appendAuditLog,
  appendLedgerTransaction,
  appendOutboxEvent,
  activateReplacementPaymentMethod,
  completeRegistration,
  createEligiblePayout,
  lockCollage,
  lockContribution,
  lockCycle,
  lockPayout,
  rejectCardAuthorizationWithoutReusableToken,
  type PrismaClient,
  type TransactionClient,
  withSerializableTransaction,
} from "@collage/database";
import {
  asMoneyMinor,
  calculateCycleSchedule,
  calculateMemberChargeAt,
  type ChargePreference,
} from "@collage/domain";
import {
  MonnifyError,
  type PaymentOutcome,
  type TransactionVerification,
  type TransferOutcome,
  type TransferResult,
} from "@collage/monnify";
import { deterministicJobId } from "@collage/queue";
import {
  decryptString,
  encryptString,
  keyedHash,
  type EncryptionKeyring,
} from "@collage/security";
import { z } from "zod";

import {
  classifyPaymentOutcome,
  classifyProviderFailure,
  classifyTransferOutcome,
  evaluateDeadline,
  type OperationDecision,
} from "./policy.js";
import type { JobScheduler } from "./ports.js";
import type { WorkerProvider } from "./provider.js";

const chargePreferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DAILY"),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal("WEEKLY"),
    weekday: z.number().int().min(1).max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal("MONTHLY"),
    ordinal: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal("last"),
    ]),
    weekday: z.number().int().min(1).max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal("YEARLY"),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
]);

const safeReference = (prefix: string, id: string, attempt: number): string =>
  `${prefix}_${createHash("sha256")
    .update(`${id}:${String(attempt)}`)
    .digest("hex")
    .slice(0, 32)}`;

const unresolvedProviderStates = ["CREATED", "PENDING", "UNKNOWN"] as const;
const escapeTelegramHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export interface WorkerEngineOptions {
  readonly client: PrismaClient;
  readonly encryption: EncryptionKeyring;
  readonly hashKey: Buffer;
  readonly maximumChargeAttempts: number;
  readonly pendingPollMs: number;
  readonly provider: WorkerProvider;
  readonly providerEnabled: boolean;
  readonly providerEnvironment: "production" | "sandbox";
  readonly providerRedirectUrl: string;
  readonly scheduler: JobScheduler;
  readonly simulatePendingPayoutSuccess?: boolean;
  readonly staleOperationMs: number;
}

export class WorkerEngine {
  constructor(private readonly options: WorkerEngineOptions) {}

  private async completeRegistrationAfterAuthorization(
    memberId: string,
    correlationId: string,
  ): Promise<void> {
    const member = await this.options.client.collageMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    if (member.state !== "PAYMENT_METHOD_AUTHORIZING") return;
    if (
      member.acceptedRuleVersionId === null ||
      member.identityVerificationMode === null ||
      (member.identityVerificationMode !== "COLLECTED_UNVERIFIED" &&
        member.identityVerifiedAt === null) ||
      member.legalNameEncrypted === null ||
      member.ninEncrypted === null ||
      member.ninHash === null ||
      member.phoneEncrypted === null ||
      member.phoneHash === null ||
      member.phoneVerifiedAt === null ||
      member.preferredChargeRule === null ||
      member.recurringConsentAt === null
    ) {
      throw new Error(
        "Registration evidence is incomplete after authorization",
      );
    }
    await completeRegistration(
      this.options.client,
      memberId,
      {
        acceptedRuleVersionId: member.acceptedRuleVersionId,
        identityVerificationMode: member.identityVerificationMode,
        identityVerifiedAt: member.identityVerifiedAt,
        legalNameEncrypted: member.legalNameEncrypted,
        ninEncrypted: member.ninEncrypted,
        ninHash: member.ninHash,
        phoneEncrypted: member.phoneEncrypted,
        phoneHash: member.phoneHash,
        phoneVerifiedAt: member.phoneVerifiedAt,
        preferredChargeRule: member.preferredChargeRule,
        recurringConsentAt: member.recurringConsentAt,
      },
      correlationId,
    );
  }

  private async reconcileCardAuthorization(
    authorizationId: string,
    correlationId: string,
  ): Promise<void> {
    const card = await this.options.client.cardAuthorization.findUniqueOrThrow({
      where: { id: authorizationId },
      include: { paymentMethod: true },
    });
    if (card.state === "SUCCEEDED") {
      await this.completeRegistrationAfterAuthorization(
        card.paymentMethod.memberId,
        correlationId,
      );
      return;
    }
    if (card.providerReference === null) return;
    const verification =
      await this.options.provider.verifyTransactionByPaymentReference(
        card.providerReference,
      );
    if (verification.outcome !== "paid") {
      if (["failed", "expired", "reversed"].includes(verification.outcome)) {
        await this.options.client.cardAuthorization.update({
          where: { id: card.id },
          data: {
            state:
              verification.outcome === "expired"
                ? "EXPIRED"
                : "FAILED_TERMINAL",
          },
        });
      }
      return;
    }
    if (
      verification.amountPaidMinor !== card.setupAmountMinor ||
      verification.currency !== card.currency
    ) {
      throw new Error("Verified card authorization did not match setup terms");
    }
    if (verification.cardToken === undefined) {
      await rejectCardAuthorizationWithoutReusableToken(
        this.options.client,
        card.id,
        correlationId,
        "worker",
      );
      return;
    }
    const activation = {
      activeAt: new Date(),
      credentialEncrypted: encryptString(
        verification.cardToken,
        this.options.encryption,
        `payment-method:${card.paymentMethodId}:credential`,
      ),
      credentialHash: keyedHash(verification.cardToken, this.options.hashKey),
      maskedLabel: "Saved card",
    };
    const current = await this.options.client.paymentMethod.findFirst({
      where: {
        memberId: card.paymentMethod.memberId,
        state: "ACTIVE",
        id: { not: card.paymentMethodId },
      },
    });
    if (current === null) {
      await this.options.client.paymentMethod.update({
        where: { id: card.paymentMethodId },
        data: { state: "ACTIVE", ...activation },
      });
    } else {
      await activateReplacementPaymentMethod(
        this.options.client,
        card.paymentMethod.memberId,
        card.paymentMethodId,
        activation,
      );
    }
    await this.options.client.cardAuthorization.update({
      where: { id: card.id },
      data: { state: "SUCCEEDED", reusableTokenReady: true },
    });
    await this.completeRegistrationAfterAuthorization(
      card.paymentMethod.memberId,
      correlationId,
    );
  }

  async startCollage(collageId: string, correlationId: string): Promise<void> {
    const snapshot = await this.options.client.collage.findUniqueOrThrow({
      where: { id: collageId },
      include: {
        members: {
          where: { state: "REGISTERED" },
          orderBy: { payoutPosition: "asc" },
        },
      },
    });
    if (snapshot.state !== "STARTING") return;
    if (snapshot.members.length !== snapshot.participantLimit) {
      throw new Error("Starting Collage does not have every registered member");
    }
    const cycles = calculateCycleSchedule({
      firstCycleStart: snapshot.firstCycleStartAt.toISOString(),
      frequency: snapshot.frequency,
      interval: snapshot.frequencyInterval,
      participantCount: snapshot.participantLimit,
      deadlineOffsetMinutes: snapshot.cycleDeadlineOffsetMinutes,
      timeZone: snapshot.timezone,
    });
    const prepared = cycles.map((cycle) => {
      const recipient = snapshot.members.find(
        ({ payoutPosition }) => payoutPosition === cycle.recipientPosition,
      );
      if (recipient === undefined)
        throw new Error("Cycle recipient position is missing");
      return {
        cycle,
        recipient,
        contributions: snapshot.members.map((member) => ({
          member,
          chargeAt: calculateMemberChargeAt(
            cycle,
            snapshot.timezone,
            chargePreferenceSchema.parse(
              member.preferredChargeRule,
            ) as ChargePreference,
          ),
        })),
      };
    });

    let firstCycleId: string | undefined;
    await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        await lockCollage(transaction, collageId);
        const current = await transaction.collage.findUniqueOrThrow({
          where: { id: collageId },
        });
        if (current.state !== "STARTING") return;
        for (const item of prepared) {
          const cycle = await transaction.cycle.create({
            data: {
              collageId,
              number: item.cycle.cycleNumber,
              recipientMemberId: item.recipient.id,
              state: item.cycle.cycleNumber === 1 ? "COLLECTING" : "SCHEDULED",
              expectedAmountMinor:
                current.contributionAmountMinor *
                BigInt(current.participantLimit),
              opensAt: item.cycle.opensAt,
              deadlineAt: item.cycle.deadlineAt,
              graceEndsAt: new Date(
                item.cycle.deadlineAt.getTime() +
                  current.gracePeriodMinutes * 60_000,
              ),
              payoutScheduledAt:
                current.payoutTiming === "SCHEDULED_WHEN_READY"
                  ? item.cycle.deadlineAt
                  : null,
              contributions: {
                create: item.contributions.map(({ member, chargeAt }) => ({
                  memberId: member.id,
                  amountMinor: current.contributionAmountMinor,
                  currency: current.currency,
                  chargeAt,
                })),
              },
            },
          });
          if (item.cycle.cycleNumber === 1) firstCycleId = cycle.id;
        }
        await Promise.all([
          transaction.ledgerAccount.upsert({
            where: { key: `collage:${collageId}:pot` },
            update: {},
            create: {
              key: `collage:${collageId}:pot`,
              code: "COLLAGE_POT",
              name: `${current.name} pot`,
              type: "LIABILITY",
              collageId,
              currency: "NGN",
            },
          }),
          transaction.ledgerAccount.upsert({
            where: { key: `collage:${collageId}:provider-clearing` },
            update: {},
            create: {
              key: `collage:${collageId}:provider-clearing`,
              code: "PROVIDER_CLEARING",
              name: `${current.name} provider clearing`,
              type: "CLEARING",
              collageId,
              currency: "NGN",
            },
          }),
        ]);
        await transaction.collage.update({
          where: { id: collageId },
          data: {
            state: "ACTIVE",
            startedAt: current.startedAt ?? new Date(),
            rulesLockedAt: current.rulesLockedAt ?? new Date(),
            version: { increment: 1 },
          },
        });
        await appendAuditLog(transaction, {
          action: "collage.started",
          actorType: "SYSTEM",
          correlationId,
          entityType: "collage",
          entityId: collageId,
          source: "worker",
          safeMetadata: { participantCount: current.participantLimit },
        });
        await appendOutboxEvent(transaction, {
          eventType: "collage.started",
          aggregateType: "collage",
          aggregateId: collageId,
          aggregateVersion: current.version + 1,
          correlationId,
          payload: { collageId },
        });
        if (firstCycleId !== undefined) {
          await appendOutboxEvent(transaction, {
            eventType: "cycle.opened",
            aggregateType: "cycle",
            aggregateId: firstCycleId,
            aggregateVersion: 1,
            correlationId,
            payload: { cycleId: firstCycleId },
          });
        }
      },
    );
  }

  async scheduleOpenCycle(cycleId: string): Promise<void> {
    const cycle = await this.options.client.cycle.findUniqueOrThrow({
      where: { id: cycleId },
      include: { contributions: true },
    });
    if (cycle.state !== "COLLECTING") return;
    await Promise.all([
      ...cycle.contributions.map((contribution) =>
        this.options.scheduler.enqueue({
          queue: "payment-scheduling",
          name: "charge-contribution",
          id: deterministicJobId("charge", contribution.id),
          data: { operation: "charge", contributionId: contribution.id },
          delayMs: Math.max(0, contribution.chargeAt.getTime() - Date.now()),
        }),
      ),
      this.options.scheduler.enqueue({
        queue: "collage-lifecycle",
        name: "cycle-deadline",
        id: deterministicJobId("deadline", cycle.id),
        data: { operation: "deadline", cycleId: cycle.id },
        delayMs: Math.max(0, cycle.deadlineAt.getTime() - Date.now()),
      }),
      this.options.scheduler.enqueue({
        queue: "collage-lifecycle",
        name: "cycle-grace-ended",
        id: deterministicJobId("grace", cycle.id),
        data: { operation: "grace-ended", cycleId: cycle.id },
        delayMs: Math.max(0, cycle.graceEndsAt.getTime() - Date.now()),
      }),
      this.scheduleNextReminder(cycle.id, new Date(), cycle.deadlineAt),
    ]);
  }

  async chargeContribution(
    contributionId: string,
    correlationId: string,
  ): Promise<void> {
    if (!this.options.providerEnabled) return;
    const prepared = await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        await lockContribution(transaction, contributionId);
        const contribution =
          await transaction.cycleContribution.findUniqueOrThrow({
            where: { id: contributionId },
            include: {
              cycle: { include: { collage: true } },
              member: {
                include: {
                  paymentMethods: {
                    where: { state: "ACTIVE" },
                    orderBy: { activeAt: "desc" },
                    take: 1,
                    include: {
                      directDebitMandates: {
                        where: { state: "SUCCEEDED" },
                        take: 1,
                      },
                    },
                  },
                },
              },
              paymentAttempts: { orderBy: { createdAt: "asc" } },
            },
          });
        if (
          contribution.state === "PAID" ||
          !["COLLECTING", "OVERDUE"].includes(contribution.cycle.state)
        )
          return null;
        const unresolved = contribution.paymentAttempts.find(({ state }) =>
          unresolvedProviderStates.includes(
            state as (typeof unresolvedProviderStates)[number],
          ),
        );
        if (unresolved !== undefined) {
          return { kind: "poll" as const, attempt: unresolved };
        }
        const automatic = contribution.paymentAttempts.filter(({ type }) =>
          ["CARD_TOKEN_CHARGE", "DIRECT_DEBIT"].includes(type),
        );
        const method = contribution.member.paymentMethods[0];
        const recentMandates = automatic.filter(
          ({ createdAt, type }) =>
            type === "DIRECT_DEBIT" &&
            createdAt.getTime() > Date.now() - 24 * 60 * 60_000,
        );
        if (method?.type === "DIRECT_DEBIT" && recentMandates.length >= 2) {
          const oldest = recentMandates[0];
          return {
            kind: "defer" as const,
            contributionId: contribution.id,
            delayMs: Math.max(
              60_000,
              (oldest?.createdAt.getTime() ?? Date.now()) +
                24 * 60 * 60_000 -
                Date.now(),
            ),
          };
        }
        if (
          method?.credentialEncrypted == null ||
          automatic.length >= this.options.maximumChargeAttempts
        ) {
          await this.markManualRequired(
            transaction,
            contribution.id,
            correlationId,
            method === undefined
              ? "active-payment-method-unavailable"
              : "automatic-attempts-exhausted",
          );
          return null;
        }
        const attemptNumber = automatic.length + 1;
        const providerReference = safeReference(
          "colpay",
          contribution.id,
          attemptNumber,
        );
        const attempt = await transaction.paymentAttempt.create({
          data: {
            contributionId: contribution.id,
            type:
              method.type === "CARD_TOKEN"
                ? "CARD_TOKEN_CHARGE"
                : "DIRECT_DEBIT",
            providerEnvironment: this.options.providerEnvironment,
            providerReference,
            idempotencyKey: `automatic-charge:${contribution.id}:${String(attemptNumber)}`,
            amountMinor: contribution.amountMinor,
            currency: contribution.currency,
          },
        });
        await transaction.cycleContribution.update({
          where: { id: contribution.id },
          data: { state: "CHARGE_PENDING", version: { increment: 1 } },
        });
        await appendAuditLog(transaction, {
          action: "contribution.charge-created",
          actorType: "SYSTEM",
          correlationId,
          entityType: "payment-attempt",
          entityId: attempt.id,
          source: "worker",
          safeMetadata: { methodType: method.type, attemptNumber },
        });
        return {
          kind: "initiate" as const,
          attempt,
          contribution,
          method,
          mandate: method.directDebitMandates[0],
        };
      },
    );
    if (prepared === null) return;
    if (prepared.kind === "poll") {
      await this.enqueuePaymentPoll(prepared.attempt.id, 0);
      return;
    }
    if (prepared.kind === "defer") {
      await this.options.scheduler.enqueue({
        queue: "payment-processing",
        name: "deferred-direct-debit",
        id: deterministicJobId(
          "deferred-direct-debit",
          prepared.contributionId,
          String(Date.now() + prepared.delayMs),
        ),
        data: {
          operation: "charge",
          contributionId: prepared.contributionId,
        },
        delayMs: prepared.delayMs,
      });
      return;
    }
    try {
      if (prepared.method.type === "DIRECT_DEBIT") {
        const mandate = prepared.mandate;
        if (mandate === undefined) {
          await this.applyPaymentDecision(
            prepared.attempt.id,
            { kind: "manual", reason: "active-mandate-unavailable" },
            correlationId,
          );
          return;
        }
        const result = await this.options.provider.debitMandate({
          amountMinor: prepared.contribution.amountMinor,
          mandateReference: mandate.mandateReference,
          narration: "Collage contribution",
          paymentReference: prepared.attempt.providerReference,
        });
        const verification =
          result.outcome === "paid"
            ? await this.options.provider.verifyTransactionByPaymentReference(
                prepared.attempt.providerReference,
              )
            : undefined;
        await this.applyPaymentOutcome(
          prepared.attempt.id,
          verification?.outcome ?? result.outcome,
          verification,
          correlationId,
        );
        return;
      }
      if (
        prepared.method.customerEmailEncrypted === null ||
        prepared.method.credentialEncrypted === null
      ) {
        await this.applyPaymentDecision(
          prepared.attempt.id,
          { kind: "manual", reason: "card-customer-email-unavailable" },
          correlationId,
        );
        return;
      }
      const checkout = await this.options.provider.initializeCheckout({
        amountMinor: prepared.contribution.amountMinor,
        customerEmail: decryptString(
          prepared.method.customerEmailEncrypted,
          this.options.encryption,
          `payment-method:${prepared.method.memberId}:customer-email`,
        ),
        metadata: {
          attemptId: prepared.attempt.id,
          contributionId: prepared.contribution.id,
        },
        paymentDescription: "Collage recurring contribution",
        paymentMethods: ["CARD"],
        paymentReference: prepared.attempt.providerReference,
        redirectUrl: this.options.providerRedirectUrl,
      });
      await this.options.client.paymentAttempt.updateMany({
        where: { id: prepared.attempt.id, state: "CREATED" },
        data: {
          initiatedAt: new Date(),
          providerPayloadEncrypted: encryptString(
            JSON.stringify({
              transactionReference: checkout.transactionReference,
            }),
            this.options.encryption,
            `payment-attempt:${prepared.attempt.id}:provider-payload`,
          ),
        },
      });
      const result = await this.options.provider.chargeCardToken({
        cardToken: decryptString(
          prepared.method.credentialEncrypted,
          this.options.encryption,
          `payment-method:${prepared.method.id}:credential`,
        ),
        transactionReference: checkout.transactionReference,
      });
      await this.applyPaymentOutcome(
        prepared.attempt.id,
        result.outcome,
        result,
        correlationId,
      );
    } catch (error) {
      await this.handlePaymentProviderError(
        prepared.attempt.id,
        error,
        correlationId,
      );
    }
  }

  async pollPaymentAttempt(
    attemptId: string,
    correlationId: string,
  ): Promise<void> {
    if (!this.options.providerEnabled) return;
    const attempt = await this.options.client.paymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    if (
      !unresolvedProviderStates.includes(
        attempt.state as (typeof unresolvedProviderStates)[number],
      )
    )
      return;
    try {
      if (attempt.type === "DIRECT_DEBIT") {
        const result = await this.options.provider.getMandateDebitStatus(
          attempt.providerReference,
        );
        const verification =
          result.outcome === "paid"
            ? await this.options.provider.verifyTransactionByPaymentReference(
                attempt.providerReference,
              )
            : undefined;
        await this.applyPaymentOutcome(
          attempt.id,
          verification?.outcome ?? result.outcome,
          verification,
          correlationId,
        );
      } else {
        const result =
          await this.options.provider.verifyTransactionByPaymentReference(
            attempt.providerReference,
          );
        await this.applyPaymentOutcome(
          attempt.id,
          result.outcome,
          result,
          correlationId,
        );
      }
    } catch (error) {
      await this.handlePaymentProviderError(attempt.id, error, correlationId);
    }
  }

  async evaluateCycle(cycleId: string, correlationId: string): Promise<void> {
    await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        await lockCycle(transaction, cycleId);
        const cycle = await transaction.cycle.findUniqueOrThrow({
          where: { id: cycleId },
          include: { contributions: true },
        });
        if (["COMPLETED", "PAYOUT_PROCESSING"].includes(cycle.state)) return;
        const allPaid =
          cycle.contributions.length >= 2 &&
          cycle.contributions.every(({ state }) => state === "PAID");
        const decision = evaluateDeadline({
          allPaid,
          now: new Date(),
          deadlineAt: cycle.deadlineAt,
          graceEndsAt: cycle.graceEndsAt,
        });
        if (decision === "ready") {
          const eligible =
            cycle.confirmedAmountMinor === cycle.expectedAmountMinor;
          if (eligible && cycle.state !== "READY_FOR_PAYOUT") {
            await transaction.cycle.update({
              where: { id: cycle.id },
              data: { state: "READY_FOR_PAYOUT", version: { increment: 1 } },
            });
          }
          return;
        }
        if (decision === "overdue" && cycle.state === "COLLECTING") {
          await transaction.cycle.update({
            where: { id: cycle.id },
            data: { state: "OVERDUE", version: { increment: 1 } },
          });
          await transaction.cycleContribution.updateMany({
            where: {
              cycleId,
              state: { in: ["SCHEDULED", "FAILED_RETRYABLE"] },
            },
            data: { state: "OVERDUE" },
          });
        }
        if (decision === "blocked" && cycle.state !== "BLOCKED_BY_DEFAULT") {
          await transaction.cycle.update({
            where: { id: cycle.id },
            data: { state: "BLOCKED_BY_DEFAULT", version: { increment: 1 } },
          });
          await transaction.collage.update({
            where: { id: cycle.collageId },
            data: { state: "BLOCKED", version: { increment: 1 } },
          });
          const unresolved = await transaction.paymentAttempt.findMany({
            where: {
              contribution: { cycleId },
              state: { in: [...unresolvedProviderStates] },
            },
            select: { contributionId: true },
          });
          const unresolvedIds = unresolved.map(
            ({ contributionId }) => contributionId,
          );
          await transaction.cycleContribution.updateMany({
            where: {
              cycleId,
              state: { not: "PAID" },
              id: { notIn: unresolvedIds },
            },
            data: { state: "DEFAULTED" },
          });
          const owing = await transaction.cycleContribution.findMany({
            where: { cycleId, state: { not: "PAID" } },
            select: { memberId: true },
          });
          await transaction.collageMember.updateMany({
            where: { id: { in: owing.map(({ memberId }) => memberId) } },
            data: { state: "DEFAULTED" },
          });
          await appendOutboxEvent(transaction, {
            eventType: "cycle.blocked",
            aggregateType: "cycle",
            aggregateId: cycle.id,
            aggregateVersion: cycle.version + 1,
            correlationId,
            payload: { cycleId: cycle.id },
          });
          await appendAuditLog(transaction, {
            action: "cycle.blocked",
            actorType: "SYSTEM",
            correlationId,
            entityType: "cycle",
            entityId: cycle.id,
            source: "worker",
            safeMetadata: { reason: "grace-ended-with-unpaid-contributions" },
          });
        }
      },
    );
    const refreshed = await this.options.client.cycle.findUniqueOrThrow({
      where: { id: cycleId },
      select: { state: true },
    });
    if (refreshed.state === "READY_FOR_PAYOUT") {
      await createEligiblePayout(this.options.client, {
        cycleId,
        correlationId,
        idempotencyKey: `payout:${cycleId}`,
      });
    }
  }

  async initiatePayout(
    payoutId: string,
    correlationId: string,
    retry = false,
  ): Promise<void> {
    if (!this.options.providerEnabled) return;
    const prepared = await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        await lockPayout(transaction, payoutId);
        const payout = await transaction.payout.findUniqueOrThrow({
          where: { id: payoutId },
          include: {
            attempts: { orderBy: { createdAt: "asc" } },
            bankAccount: true,
            cycle: { include: { contributions: true } },
          },
        });
        if (payout.state === "SUCCESSFUL") return null;
        const unresolved = payout.attempts.find(({ state }) =>
          unresolvedProviderStates.includes(
            state as (typeof unresolvedProviderStates)[number],
          ),
        );
        if (unresolved !== undefined) {
          return { kind: "poll" as const, attemptId: unresolved.id };
        }
        if (
          (retry && payout.state !== "FAILED") ||
          (!retry && !["READY", "PROCESSING"].includes(payout.state)) ||
          payout.cycle.confirmedAmountMinor !==
            payout.cycle.expectedAmountMinor ||
          !payout.cycle.contributions.every(({ state }) => state === "PAID")
        )
          return null;
        const attemptNumber = payout.attempts.length + 1;
        const attempt = await transaction.payoutAttempt.create({
          data: {
            payoutId,
            providerEnvironment: this.options.providerEnvironment,
            providerReference: safeReference(
              "colpayout",
              payout.id,
              attemptNumber,
            ),
            idempotencyKey: `payout-attempt:${payout.id}:${String(attemptNumber)}`,
          },
        });
        await transaction.payout.update({
          where: { id: payout.id },
          data: { state: "PROCESSING", version: { increment: 1 } },
        });
        await appendAuditLog(transaction, {
          action: retry ? "payout.retry-created" : "payout.created",
          actorType: "SYSTEM",
          correlationId,
          entityType: "payout-attempt",
          entityId: attempt.id,
          source: "worker",
          safeMetadata: { attemptNumber },
        });
        return { kind: "initiate" as const, attempt, payout };
      },
    );
    if (prepared === null) return;
    if (prepared.kind === "poll") {
      await this.enqueuePayoutPoll(prepared.attemptId, 0);
      return;
    }
    try {
      const result = await this.options.provider.initiateTransfer({
        amountMinor: prepared.payout.amountMinor,
        destinationAccountName: decryptString(
          prepared.payout.bankAccount.accountNameEncrypted,
          this.options.encryption,
          `member:${prepared.payout.memberId}:bank-name`,
        ),
        destinationAccountNumber: decryptString(
          prepared.payout.bankAccount.accountNumberEncrypted,
          this.options.encryption,
          `member:${prepared.payout.memberId}:bank-account`,
        ),
        destinationBankCode: prepared.payout.bankAccount.bankCode,
        narration: "Collage cycle payout",
        reference: prepared.attempt.providerReference,
      });
      await this.applyTransferOutcome(
        prepared.attempt.id,
        result.outcome,
        result,
        correlationId,
      );
    } catch (error) {
      await this.handlePayoutProviderError(
        prepared.attempt.id,
        error,
        correlationId,
      );
    }
  }

  async pollPayoutAttempt(
    attemptId: string,
    correlationId: string,
  ): Promise<void> {
    if (!this.options.providerEnabled) return;
    const attempt = await this.options.client.payoutAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    if (
      !unresolvedProviderStates.includes(
        attempt.state as (typeof unresolvedProviderStates)[number],
      )
    )
      return;
    try {
      const result = await this.options.provider.getTransferStatus(
        attempt.providerReference,
      );
      await this.applyTransferOutcome(
        attempt.id,
        result.outcome,
        result,
        correlationId,
      );
    } catch (error) {
      await this.handlePayoutProviderError(attempt.id, error, correlationId);
    }
  }

  async completeCycle(cycleId: string, correlationId: string): Promise<void> {
    let nextCycleId: string | undefined;
    await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        await lockCycle(transaction, cycleId);
        const cycle = await transaction.cycle.findUniqueOrThrow({
          where: { id: cycleId },
          include: { payout: true },
        });
        if (cycle.state !== "COMPLETED" || cycle.payout?.state !== "SUCCESSFUL")
          return;
        await lockCollage(transaction, cycle.collageId);
        const next = await transaction.cycle.findUnique({
          where: {
            collageId_number: {
              collageId: cycle.collageId,
              number: cycle.number + 1,
            },
          },
        });
        if (next === null) {
          const changed = await transaction.collage.updateMany({
            where: {
              id: cycle.collageId,
              state: { not: "COMPLETED" },
            },
            data: {
              state: "COMPLETED",
              completedAt: new Date(),
              version: { increment: 1 },
            },
          });
          if (changed.count === 1) {
            await appendOutboxEvent(transaction, {
              eventType: "collage.completed",
              aggregateType: "collage",
              aggregateId: cycle.collageId,
              aggregateVersion: cycle.number,
              correlationId,
              payload: { collageId: cycle.collageId },
            });
          }
          return;
        }
        if (next.state === "SCHEDULED") {
          await transaction.cycle.update({
            where: { id: next.id },
            data: { state: "COLLECTING", version: { increment: 1 } },
          });
          await transaction.collage.update({
            where: { id: cycle.collageId },
            data: { state: "ACTIVE", version: { increment: 1 } },
          });
          await appendOutboxEvent(transaction, {
            eventType: "cycle.opened",
            aggregateType: "cycle",
            aggregateId: next.id,
            aggregateVersion: next.version + 1,
            correlationId,
            payload: { cycleId: next.id },
          });
          nextCycleId = next.id;
        }
      },
    );
    if (nextCycleId !== undefined) await this.scheduleOpenCycle(nextCycleId);
  }

  async sendReminder(cycleId: string, scheduledFor: Date): Promise<void> {
    const cycle = await this.options.client.cycle.findUniqueOrThrow({
      where: { id: cycleId },
      include: {
        collage: { include: { chat: true } },
        contributions: {
          where: { state: { not: "PAID" } },
          include: {
            member: {
              include: {
                user: {
                  include: {
                    telegramIdentities: {
                      where: { isBot: false },
                      take: 1,
                    },
                  },
                },
              },
            },
            paymentAttempts: {
              where: { state: { in: [...unresolvedProviderStates] } },
            },
          },
        },
      },
    });
    if (!["COLLECTING", "OVERDUE"].includes(cycle.state)) return;
    const owing = cycle.contributions.filter(
      ({ paymentAttempts }) => paymentAttempts.length === 0,
    );
    if (owing.length > 0) {
      const names = owing
        .map(({ member }) => {
          const identity = member.user.telegramIdentities[0];
          const name =
            identity?.firstName ??
            identity?.username ??
            (member.payoutPosition === null
              ? "member"
              : `member ${String(member.payoutPosition)}`);
          return `<a href="tg://user?id=${member.telegramUserId}">${escapeTelegramHtml(name)}</a>`;
        })
        .join(", ");
      await this.options.scheduler.enqueue({
        queue: "telegram-notifications",
        name: "cycle-reminder",
        id: deterministicJobId(
          "reminder",
          cycle.id,
          scheduledFor.toISOString().replaceAll(/[-:.TZ]/gu, ""),
        ),
        data: {
          deliveryId: randomUUID(),
          type: "contribution.reminder",
          operation: "send-group-message",
          telegramChatId: cycle.collage.chat.telegramChatId,
          text: `Contribution reminder: ${names}. Members with a provider payment still pending are excluded.`,
          parseMode: "HTML",
          buttons: [],
          actionButton: {
            action: "PAY_CONTRIBUTION",
            chatId: cycle.collage.chat.id,
            collageId: cycle.collage.id,
            label: "Pay now",
          },
        },
      });
    }
    await this.scheduleNextReminder(cycle.id, scheduledFor, cycle.deadlineAt);
  }

  async recoverStaleOperations(): Promise<void> {
    const before = new Date(Date.now() - this.options.staleOperationMs);
    const [payments, payouts, dueCycles] = await Promise.all([
      this.options.client.paymentAttempt.findMany({
        where: {
          state: { in: [...unresolvedProviderStates] },
          updatedAt: { lte: before },
        },
        select: { id: true },
        take: 500,
      }),
      this.options.client.payoutAttempt.findMany({
        where: {
          state: { in: [...unresolvedProviderStates] },
          updatedAt: { lte: before },
        },
        select: { id: true },
        take: 500,
      }),
      this.options.client.cycle.findMany({
        where: {
          state: {
            in: ["COLLECTING", "OVERDUE", "BLOCKED_BY_DEFAULT"],
          },
          deadlineAt: { lte: new Date() },
        },
        select: { id: true },
        take: 500,
      }),
    ]);
    const leaving = await this.options.client.cycleContribution.groupBy({
      by: ["memberId"],
      where: {
        member: { telegramLeftAt: { not: null } },
        state: { notIn: ["PAID", "REVERSED"] },
      },
      _sum: { amountMinor: true },
    });
    await Promise.all([
      ...payments.map(({ id }) => this.enqueuePaymentPoll(id, 0)),
      ...payouts.map(({ id }) => this.enqueuePayoutPoll(id, 0)),
      ...dueCycles.map(({ id }) =>
        this.options.scheduler.enqueue({
          queue: "collage-lifecycle",
          name: "evaluate-cycle",
          id: deterministicJobId("recover-cycle", id, String(Date.now())),
          data: { operation: "deadline", cycleId: id },
        }),
      ),
      ...leaving.map((obligation) =>
        this.options.client.collageMember.update({
          where: { id: obligation.memberId },
          data: {
            outstandingObligationMinor: obligation._sum.amountMinor ?? 0n,
            state: "AT_RISK",
            version: { increment: 1 },
          },
        }),
      ),
    ]);
  }

  async reconcileLedger(correlationId: string): Promise<number> {
    interface Mismatch {
      readonly cycleId: string;
      readonly confirmedAmountMinor: bigint;
      readonly paidAmountMinor: bigint;
    }
    const mismatches = await this.options.client.$queryRaw<Mismatch[]>`
      SELECT
        c."id" AS "cycleId",
        c."confirmedAmountMinor",
        COALESCE(
          SUM(cc."amountMinor") FILTER (WHERE cc."state" = 'PAID'),
          0
        )::bigint AS "paidAmountMinor"
      FROM "cycles" c
      LEFT JOIN "cycle_contributions" cc ON cc."cycleId" = c."id"
      GROUP BY c."id", c."confirmedAmountMinor"
      HAVING c."confirmedAmountMinor" <>
        COALESCE(SUM(cc."amountMinor") FILTER (WHERE cc."state" = 'PAID'), 0)
    `;
    for (const mismatch of mismatches) {
      await withSerializableTransaction(
        this.options.client,
        async (transaction) => {
          await appendAuditLog(transaction, {
            action: "reconciliation.cycle-mismatch",
            actorType: "SYSTEM",
            correlationId,
            entityType: "cycle",
            entityId: mismatch.cycleId,
            source: "worker",
            safeMetadata: {
              confirmedAmountMinor: mismatch.confirmedAmountMinor.toString(),
              paidAmountMinor: mismatch.paidAmountMinor.toString(),
            },
          });
          await appendOutboxEvent(transaction, {
            eventType: "reconciliation.mismatch",
            aggregateType: "cycle",
            aggregateId: mismatch.cycleId,
            aggregateVersion: Date.now(),
            correlationId,
            payload: { cycleId: mismatch.cycleId },
          });
        },
      );
    }
    return mismatches.length;
  }

  async processWebhook(
    webhookEventId: string,
    correlationId: string,
  ): Promise<void> {
    const event = await this.options.client.webhookEvent.findUniqueOrThrow({
      where: { id: webhookEventId },
    });
    if (event.processedAt !== null) return;
    const raw = decryptString(
      event.payloadEncrypted,
      this.options.encryption,
      `webhook:monnify:${event.fingerprint}`,
    );
    const parsed = z
      .object({
        eventData: z.record(z.string(), z.unknown()),
        eventType: z.string(),
      })
      .parse(JSON.parse(raw) as unknown);
    const candidates = [
      parsed.eventData.paymentReference,
      parsed.eventData.reference,
    ].filter((value): value is string => typeof value === "string");
    const [payment, payout, cardAuthorization] = await Promise.all([
      this.options.client.paymentAttempt.findFirst({
        where: { providerReference: { in: candidates } },
        select: { id: true },
      }),
      this.options.client.payoutAttempt.findFirst({
        where: { providerReference: { in: candidates } },
        select: { id: true },
      }),
      this.options.client.cardAuthorization.findFirst({
        where: { providerReference: { in: candidates } },
        select: { id: true },
      }),
    ]);
    if (payment !== null)
      await this.pollPaymentAttempt(payment.id, correlationId);
    if (payout !== null) await this.pollPayoutAttempt(payout.id, correlationId);
    if (cardAuthorization !== null)
      await this.reconcileCardAuthorization(
        cardAuthorization.id,
        correlationId,
      );
    await this.options.client.webhookEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        processingErrorCode:
          payment === null && payout === null && cardAuthorization === null
            ? "PROVIDER_REFERENCE_NOT_FOUND"
            : null,
      },
    });
  }

  private async applyPaymentOutcome(
    attemptId: string,
    outcome: PaymentOutcome,
    verification: TransactionVerification | undefined,
    correlationId: string,
  ): Promise<void> {
    const attempt = await this.options.client.paymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { contributionId: true },
    });
    const attemptNumber = await this.options.client.paymentAttempt.count({
      where: {
        contributionId: attempt.contributionId,
        type: { in: ["CARD_TOKEN_CHARGE", "DIRECT_DEBIT"] },
      },
    });
    await this.applyPaymentDecision(
      attemptId,
      classifyPaymentOutcome(
        outcome,
        attemptNumber,
        this.options.maximumChargeAttempts,
        this.options.pendingPollMs,
      ),
      correlationId,
      verification,
    );
  }

  private async applyPaymentDecision(
    attemptId: string,
    decision: OperationDecision,
    correlationId: string,
    verification?: TransactionVerification,
  ): Promise<void> {
    let contributionId: string | undefined;
    let cycleId: string | undefined;
    await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        const current = await transaction.paymentAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          include: {
            contribution: { include: { cycle: true } },
          },
        });
        await lockContribution(transaction, current.contributionId);
        if (
          !unresolvedProviderStates.includes(
            current.state as (typeof unresolvedProviderStates)[number],
          )
        )
          return;
        contributionId = current.contributionId;
        cycleId = current.contribution.cycleId;
        if (decision.kind === "succeeded") {
          if (
            verification !== undefined &&
            (verification.amountPaidMinor !== current.amountMinor ||
              verification.currency !== current.currency ||
              verification.paymentReference !== current.providerReference)
          ) {
            await transaction.paymentAttempt.update({
              where: { id: current.id },
              data: { state: "UNKNOWN" },
            });
            await appendAuditLog(transaction, {
              action: "payment.verification-mismatch",
              actorType: "SYSTEM",
              correlationId,
              entityType: "payment-attempt",
              entityId: current.id,
              source: "worker",
              safeMetadata: { outcome: verification.outcome },
            });
            return;
          }
          const changed = await transaction.cycleContribution.updateMany({
            where: { id: current.contributionId, state: { not: "PAID" } },
            data: {
              state: "PAID",
              paidAt: new Date(),
              version: { increment: 1 },
            },
          });
          await transaction.paymentAttempt.update({
            where: { id: current.id },
            data: {
              state: "SUCCEEDED",
              initiatedAt: current.initiatedAt ?? new Date(),
              resolvedAt: new Date(),
            },
          });
          if (changed.count === 1) {
            const [pot, clearing] = await Promise.all([
              transaction.ledgerAccount.findUniqueOrThrow({
                where: {
                  key: `collage:${current.contribution.cycle.collageId}:pot`,
                },
              }),
              transaction.ledgerAccount.findUniqueOrThrow({
                where: {
                  key: `collage:${current.contribution.cycle.collageId}:provider-clearing`,
                },
              }),
            ]);
            await appendLedgerTransaction(transaction, {
              idempotencyKey: `contribution-paid:${current.contributionId}`,
              correlationId,
              referenceType: "CYCLE_CONTRIBUTION",
              referenceId: current.contributionId,
              description: "Verified Collage contribution",
              currency: "NGN",
              entries: [
                {
                  accountId: clearing.id,
                  side: "DEBIT",
                  amount: asMoneyMinor(current.amountMinor),
                },
                {
                  accountId: pot.id,
                  side: "CREDIT",
                  amount: asMoneyMinor(current.amountMinor),
                },
              ],
            });
            await transaction.cycle.update({
              where: { id: current.contribution.cycleId },
              data: {
                confirmedAmountMinor: { increment: current.amountMinor },
                version: { increment: 1 },
              },
            });
            await appendAuditLog(transaction, {
              action: "contribution.paid",
              actorType: "SYSTEM",
              correlationId,
              entityType: "contribution",
              entityId: current.contributionId,
              source: "worker",
              safeMetadata: { attemptId: current.id },
            });
            await appendOutboxEvent(transaction, {
              eventType: "contribution.paid",
              aggregateType: "contribution",
              aggregateId: current.contributionId,
              aggregateVersion: current.contribution.version + 1,
              correlationId,
              payload: {
                contributionId: current.contributionId,
                cycleId: current.contribution.cycleId,
              },
            });
          }
          return;
        }
        if (decision.kind === "poll") {
          await transaction.paymentAttempt.update({
            where: { id: current.id },
            data: {
              state: "PENDING",
              initiatedAt: current.initiatedAt ?? new Date(),
            },
          });
          return;
        }
        const providerState =
          decision.kind === "retry"
            ? "FAILED_RETRYABLE"
            : decision.kind === "terminal"
              ? "FAILED_TERMINAL"
              : "FAILED_TERMINAL";
        await transaction.paymentAttempt.update({
          where: { id: current.id },
          data: { state: providerState, resolvedAt: new Date() },
        });
        if (decision.kind === "retry") {
          await transaction.cycleContribution.update({
            where: { id: current.contributionId },
            data: { state: "FAILED_RETRYABLE", version: { increment: 1 } },
          });
        } else {
          await this.markManualRequired(
            transaction,
            current.contributionId,
            correlationId,
            decision.reason,
          );
        }
      },
    );
    if (contributionId === undefined) return;
    if (decision.kind === "poll")
      await this.enqueuePaymentPoll(attemptId, decision.delayMs);
    if (decision.kind === "retry")
      await this.options.scheduler.enqueue({
        queue: "payment-processing",
        name: "retry-contribution",
        id: deterministicJobId(
          "retry-charge",
          contributionId,
          String(Date.now() + decision.delayMs),
        ),
        data: { operation: "charge", contributionId },
        delayMs: decision.delayMs,
      });
    if (decision.kind === "succeeded" && cycleId !== undefined)
      await this.evaluateCycle(cycleId, correlationId);
  }

  private async applyTransferOutcome(
    attemptId: string,
    outcome: TransferOutcome,
    result: TransferResult,
    correlationId: string,
  ): Promise<void> {
    const decision = classifyTransferOutcome(
      outcome,
      this.options.pendingPollMs,
    );
    const simulatedSuccess =
      this.options.simulatePendingPayoutSuccess === true &&
      (outcome === "pending" ||
        outcome === "pending_authorization" ||
        outcome === "in_progress");
    let cycleId: string | undefined;
    await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        const attempt = await transaction.payoutAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          include: { payout: { include: { cycle: true } } },
        });
        await lockPayout(transaction, attempt.payoutId);
        if (
          !unresolvedProviderStates.includes(
            attempt.state as (typeof unresolvedProviderStates)[number],
          )
        )
          return;
        cycleId = attempt.payout.cycleId;
        if (
          result.reference !== attempt.providerReference ||
          result.amountMinor !== attempt.payout.amountMinor
        ) {
          await transaction.payoutAttempt.update({
            where: { id: attempt.id },
            data: { state: "UNKNOWN" },
          });
          return;
        }
        if (decision.kind === "succeeded" || simulatedSuccess) {
          const [pot, clearing] = await Promise.all([
            transaction.ledgerAccount.findUniqueOrThrow({
              where: {
                key: `collage:${attempt.payout.cycle.collageId}:pot`,
              },
            }),
            transaction.ledgerAccount.findUniqueOrThrow({
              where: {
                key: `collage:${attempt.payout.cycle.collageId}:provider-clearing`,
              },
            }),
          ]);
          await appendLedgerTransaction(transaction, {
            idempotencyKey: `payout-succeeded:${attempt.payoutId}`,
            correlationId,
            referenceType: "PAYOUT",
            referenceId: attempt.payoutId,
            description: "Verified Collage payout",
            currency: "NGN",
            entries: [
              {
                accountId: pot.id,
                side: "DEBIT",
                amount: asMoneyMinor(attempt.payout.amountMinor),
              },
              {
                accountId: clearing.id,
                side: "CREDIT",
                amount: asMoneyMinor(attempt.payout.amountMinor),
              },
            ],
          });
          await transaction.payoutAttempt.update({
            where: { id: attempt.id },
            data: { state: "SUCCEEDED", resolvedAt: new Date() },
          });
          await transaction.payout.update({
            where: { id: attempt.payoutId },
            data: {
              state: "SUCCESSFUL",
              completedAt: new Date(),
              version: { increment: 1 },
            },
          });
          await transaction.cycle.update({
            where: { id: attempt.payout.cycleId },
            data: {
              state: "COMPLETED",
              completedAt: new Date(),
              version: { increment: 1 },
            },
          });
          await appendOutboxEvent(transaction, {
            eventType: "payout.succeeded",
            aggregateType: "payout",
            aggregateId: attempt.payoutId,
            aggregateVersion: attempt.payout.version + 1,
            correlationId,
            payload: {
              payoutId: attempt.payoutId,
              cycleId: attempt.payout.cycleId,
            },
          });
          await appendAuditLog(transaction, {
            action: simulatedSuccess
              ? "payout.demo-simulated-succeeded"
              : "payout.succeeded",
            actorType: "SYSTEM",
            correlationId,
            entityType: "payout",
            entityId: attempt.payoutId,
            source: "worker",
            safeMetadata: {
              attemptId: attempt.id,
              ...(simulatedSuccess
                ? { providerOutcome: outcome, simulated: true }
                : {}),
            },
          });
          return;
        }
        if (decision.kind === "poll") {
          await transaction.payoutAttempt.update({
            where: { id: attempt.id },
            data: {
              state: "PENDING",
              initiatedAt: attempt.initiatedAt ?? new Date(),
            },
          });
          await transaction.payout.update({
            where: { id: attempt.payoutId },
            data: {
              state:
                outcome === "pending_authorization"
                  ? "PENDING_AUTHORIZATION"
                  : "IN_PROGRESS",
              version: { increment: 1 },
            },
          });
          return;
        }
        await transaction.payoutAttempt.update({
          where: { id: attempt.id },
          data: {
            state: outcome === "expired" ? "EXPIRED" : "FAILED_TERMINAL",
            resolvedAt: new Date(),
          },
        });
        await transaction.payout.update({
          where: { id: attempt.payoutId },
          data: {
            state: outcome === "expired" ? "EXPIRED" : "FAILED",
            version: { increment: 1 },
          },
        });
        await appendOutboxEvent(transaction, {
          eventType: "payout.failed",
          aggregateType: "payout",
          aggregateId: attempt.payoutId,
          aggregateVersion: attempt.payout.version + 1,
          correlationId,
          payload: { payoutId: attempt.payoutId },
        });
        await appendAuditLog(transaction, {
          action: "payout.failed",
          actorType: "SYSTEM",
          correlationId,
          entityType: "payout",
          entityId: attempt.payoutId,
          source: "worker",
          safeMetadata: { attemptId: attempt.id, outcome },
        });
      },
    );
    if (decision.kind === "poll" && !simulatedSuccess)
      await this.enqueuePayoutPoll(attemptId, decision.delayMs);
    if (
      (decision.kind === "succeeded" || simulatedSuccess) &&
      cycleId !== undefined
    )
      await this.completeCycle(cycleId, correlationId);
  }

  private async handlePaymentProviderError(
    attemptId: string,
    error: unknown,
    correlationId: string,
  ): Promise<void> {
    const decision =
      error instanceof MonnifyError
        ? classifyProviderFailure(error.failure, this.options.pendingPollMs)
        : ({ kind: "poll", delayMs: this.options.pendingPollMs } as const);
    await this.applyPaymentDecision(attemptId, decision, correlationId);
  }

  private async handlePayoutProviderError(
    attemptId: string,
    error: unknown,
    _correlationId: string,
  ): Promise<void> {
    const decision =
      error instanceof MonnifyError
        ? classifyProviderFailure(error.failure, this.options.pendingPollMs)
        : ({ kind: "poll", delayMs: this.options.pendingPollMs } as const);
    if (decision.kind === "poll") {
      await this.options.client.payoutAttempt.updateMany({
        where: { id: attemptId, state: { in: [...unresolvedProviderStates] } },
        data: { state: "UNKNOWN" },
      });
      await this.enqueuePayoutPoll(attemptId, decision.delayMs);
      return;
    }
    const terminalReason =
      decision.kind === "terminal"
        ? decision.reason
        : "provider-operation-failed";
    await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        const attempt = await transaction.payoutAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          include: { payout: true },
        });
        await lockPayout(transaction, attempt.payoutId);
        if (
          !unresolvedProviderStates.includes(
            attempt.state as (typeof unresolvedProviderStates)[number],
          )
        )
          return;
        await transaction.payoutAttempt.update({
          where: { id: attemptId },
          data: { state: "FAILED_TERMINAL", resolvedAt: new Date() },
        });
        await transaction.payout.update({
          where: { id: attempt.payoutId },
          data: { state: "FAILED", version: { increment: 1 } },
        });
        await appendAuditLog(transaction, {
          action: "payout.failed",
          actorType: "SYSTEM",
          correlationId: _correlationId,
          entityType: "payout",
          entityId: attempt.payoutId,
          source: "worker",
          safeMetadata: { attemptId, reason: terminalReason },
        });
        await appendOutboxEvent(transaction, {
          eventType: "payout.failed",
          aggregateType: "payout",
          aggregateId: attempt.payoutId,
          aggregateVersion: attempt.payout.version + 1,
          correlationId: _correlationId,
          payload: { payoutId: attempt.payoutId },
        });
      },
    );
  }

  private async markManualRequired(
    transaction: TransactionClient,
    contributionId: string,
    correlationId: string,
    reason: string,
  ): Promise<void> {
    const contribution = await transaction.cycleContribution.findUniqueOrThrow({
      where: { id: contributionId },
    });
    if (contribution.state === "PAID") return;
    await transaction.cycleContribution.update({
      where: { id: contributionId },
      data: {
        state: "MANUAL_PAYMENT_REQUIRED",
        version: { increment: 1 },
      },
    });
    await appendAuditLog(transaction, {
      action: "contribution.manual-payment-required",
      actorType: "SYSTEM",
      correlationId,
      entityType: "contribution",
      entityId: contributionId,
      source: "worker",
      safeMetadata: { reason },
    });
    await appendOutboxEvent(transaction, {
      eventType: "contribution.manual-payment-required",
      aggregateType: "contribution",
      aggregateId: contributionId,
      aggregateVersion: contribution.version + 1,
      correlationId,
      payload: {
        contributionId,
        cycleId: contribution.cycleId,
        reason,
      },
    });
  }

  private enqueuePaymentPoll(
    attemptId: string,
    delayMs: number,
  ): Promise<void> {
    return this.options.scheduler.enqueue({
      queue: "payment-reconciliation",
      name: "poll-payment-attempt",
      id: deterministicJobId(
        "poll-payment",
        attemptId,
        String(Date.now() + delayMs),
      ),
      data: { operation: "payment", attemptId },
      delayMs,
    });
  }

  private enqueuePayoutPoll(attemptId: string, delayMs: number): Promise<void> {
    return this.options.scheduler.enqueue({
      queue: "payout-reconciliation",
      name: "poll-payout-attempt",
      id: deterministicJobId(
        "poll-payout",
        attemptId,
        String(Date.now() + delayMs),
      ),
      data: { operation: "payout", attemptId },
      delayMs,
    });
  }

  private scheduleNextReminder(
    cycleId: string,
    after: Date,
    deadlineAt: Date,
  ): Promise<void> {
    const scheduledFor = new Date(
      Math.min(after.getTime() + 24 * 60 * 60_000, deadlineAt.getTime()),
    );
    if (scheduledFor <= after) return Promise.resolve();
    return this.options.scheduler.enqueue({
      queue: "reminders",
      name: "cycle-reminder",
      id: deterministicJobId(
        "cycle-reminder",
        cycleId,
        scheduledFor.toISOString().replaceAll(/[-:.TZ]/gu, ""),
      ),
      data: {
        cycleId,
        scheduledFor: scheduledFor.toISOString(),
      },
      delayMs: Math.max(0, scheduledFor.getTime() - Date.now()),
    });
  }
}

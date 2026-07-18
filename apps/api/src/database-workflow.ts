import { createHash, randomInt, randomUUID } from "node:crypto";

import { serializeForDto } from "@collage/contracts";
import {
  appendAuditLog,
  appendOutboxEvent,
  activateReplacementPaymentMethod,
  markMemberLeftTelegram,
  type Prisma,
  type PrismaClient,
  reservePayoutPosition,
  withSerializableTransaction,
} from "@collage/database";
import type {
  AccountValidation,
  Bank,
  CheckoutInitialization,
  MandateResult,
  MonnifyClient,
  TransactionVerification,
} from "@collage/monnify";
import {
  constantTimeEqual,
  decryptString,
  encryptString,
  keyedHash,
  type EncryptionKeyring,
  type LaunchTokenService,
} from "@collage/security";
import { escapeTelegramHtml, verifyTelegramInitData } from "@collage/telegram";
import { z } from "zod";

import { ApiError, forbidden } from "./errors.js";
import type { SessionService } from "./session.js";
import type { ApiData, RequestContext, WorkflowService } from "./workflow.js";

const uuid = z.uuid();
const money = z
  .string()
  .regex(/^[1-9]\d*$/u)
  .transform(BigInt);
const idempotencyKey = z.string().min(8).max(191);
const accountNumber = z.string().regex(/^\d{10}$/u);
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/u);

const asData = (value: unknown): ApiData => serializeForDto(value) as ApiData;

const deterministicHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const maskAccountNumber = (value: string): string =>
  `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;

const conflict = (code: string, message: string): ApiError =>
  new ApiError(409, code, message);

const notFound = (entity: string): ApiError =>
  new ApiError(404, "NOT_FOUND", `${entity} was not found.`);

export interface OtpProvider {
  send(input: {
    readonly code: string;
    readonly expiresInSeconds: number;
    readonly idempotencyKey: string;
    readonly phone: string;
    readonly purpose: "registration-phone";
  }): Promise<{ readonly outcome: "queued" | "unknown" }>;
}

export interface ProviderPort {
  createMandate(
    input: Parameters<MonnifyClient["createMandate"]>[0],
  ): Promise<MandateResult>;
  getBanks(): Promise<readonly Bank[]>;
  getMandateStatus(mandateReference: string): Promise<MandateResult>;
  initializeCheckout(
    input: Parameters<MonnifyClient["initializeCheckout"]>[0],
  ): Promise<CheckoutInitialization>;
  validateBankAccount(
    account: string,
    bankCode: string,
  ): Promise<AccountValidation>;
  verifyTransactionByPaymentReference(
    paymentReference: string,
  ): Promise<TransactionVerification>;
}

export interface DatabaseWorkflowOptions {
  readonly client: PrismaClient;
  readonly encryption: EncryptionKeyring;
  readonly hashKey: Buffer;
  readonly launchTokens: LaunchTokenService;
  readonly miniAppUrl: string;
  readonly monnify: ProviderPort;
  readonly otp: OtpProvider;
  readonly otpTtlSeconds: number;
  readonly providerCallsEnabled: boolean;
  readonly providerEnvironment: "production" | "sandbox";
  readonly publicUrl: string;
  readonly sessions: SessionService;
  readonly telegramBotToken: string;
}

const bootstrapSchema = z.object({
  initData: z.string().min(1).max(16_384),
  launchToken: z.string().min(20).max(256).optional(),
});

const createCollageSchema = z.object({
  cardSetupAmountMinor: money,
  cardSetupPolicy: z.enum([
    "COMMITMENT_DEPOSIT",
    "FIRST_CONTRIBUTION",
    "SANDBOX_SIMULATION",
  ]),
  contributionAmountMinor: money,
  cycleDeadlineOffsetMinutes: z.number().int().min(0),
  description: z.string().max(1_000).default(""),
  firstCycleStartAt: z.iso.datetime(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  frequencyInterval: z.number().int().min(1).max(365),
  gracePeriodMinutes: z.number().int().min(0),
  name: z.string().trim().min(2).max(120),
  participantLimit: z.number().int().min(2).max(100),
  payoutTiming: z.enum(["IMMEDIATE_WHEN_READY", "SCHEDULED_WHEN_READY"]),
  rules: z.record(z.string(), z.unknown()),
  telegramChatId: z.string().regex(/^-?\d+$/u),
  timezone: z.string().min(1).max(64),
});

const registrationSchema = z.object({
  legalName: z.string().trim().min(3).max(160),
  nin: z.string().regex(/^\d{11}$/u),
  payoutPosition: z.number().int().positive(),
  preferredChargeRule: z.record(z.string(), z.unknown()),
});

const bankSchema = z.object({
  accountNumber,
  bankCode: z.string().min(2).max(16),
});

const cardSchema = z.object({
  customerEmail: z.email(),
  idempotencyKey,
});

const mandateSchema = z.object({
  accountNumber,
  address: z.string().min(5).max(250),
  bankCode: z.string().min(2).max(16),
  customerEmail: z.email(),
  endDate: z.iso.date(),
  idempotencyKey,
  startDate: z.iso.date(),
});

const manualSchema = z.object({
  customerEmail: z.email(),
  idempotencyKey,
});

export class DatabaseWorkflowService implements WorkflowService {
  constructor(private readonly options: DatabaseWorkflowOptions) {}

  async bootstrap(input: unknown): Promise<ApiData> {
    const value = bootstrapSchema.parse(input);
    let verified;
    try {
      verified = verifyTelegramInitData(
        value.initData,
        this.options.telegramBotToken,
      );
    } catch {
      throw new ApiError(
        401,
        "TELEGRAM_INIT_DATA_INVALID",
        "Telegram Mini App authentication failed.",
      );
    }
    const telegramUserId = String(verified.user.id);
    const identity = await this.options.client.telegramIdentity.upsert({
      where: { telegramUserId },
      create: {
        telegramUserId,
        firstName: verified.user.first_name,
        lastName: verified.user.last_name ?? null,
        username: verified.user.username ?? null,
        languageCode: verified.user.language_code ?? null,
        isBot: verified.user.is_bot ?? false,
        user: { create: {} },
      },
      update: {
        firstName: verified.user.first_name,
        lastName: verified.user.last_name ?? null,
        username: verified.user.username ?? null,
        languageCode: verified.user.language_code ?? null,
      },
    });
    const launch =
      value.launchToken === undefined
        ? null
        : await this.options.launchTokens.consume(value.launchToken);
    if (
      value.launchToken !== undefined &&
      (launch === null ||
        (launch.userId !== undefined && launch.userId !== identity.userId))
    ) {
      throw new ApiError(
        401,
        "LAUNCH_TOKEN_INVALID",
        "The Mini App launch token is invalid or expired.",
      );
    }
    if (launch?.chatId !== undefined) {
      const membership =
        await this.options.client.telegramChatMembership.findUnique({
          where: {
            chatId_userId: {
              chatId: launch.chatId,
              userId: identity.userId,
            },
          },
        });
      if (membership?.state !== "ACTIVE") {
        throw forbidden();
      }
    }
    if (launch?.collageId !== undefined) {
      const collage = await this.options.client.collage.findUnique({
        where: { id: launch.collageId },
        select: {
          chatId: true,
          members: {
            where: { userId: identity.userId },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        collage === null ||
        (launch.chatId !== undefined && collage.chatId !== launch.chatId) ||
        (launch.chatId === undefined && collage.members.length === 0)
      ) {
        throw forbidden();
      }
    }
    return asData({
      sessionToken: this.options.sessions.issue({
        userId: identity.userId,
        telegramUserId,
      }),
      expiresInSeconds: 900,
      user: {
        id: identity.userId,
        telegramUserId,
        displayName: [identity.firstName, identity.lastName]
          .filter(Boolean)
          .join(" "),
      },
      launch,
    });
  }

  private async collageForUser(context: RequestContext, collageId: string) {
    const collage = await this.options.client.collage.findFirst({
      where: {
        id: collageId,
        OR: [
          { members: { some: { userId: context.principal.userId } } },
          { creatorUserId: context.principal.userId },
        ],
      },
      include: {
        chat: { select: { telegramChatId: true, title: true } },
      },
    });
    if (collage === null) {
      throw notFound("Collage");
    }
    return collage;
  }

  private async assertAdmin(context: RequestContext, collageId: string) {
    const collage = await this.options.client.collage.findUnique({
      where: { id: collageId },
      select: { chatId: true },
    });
    if (collage === null) {
      throw notFound("Collage");
    }
    const membership =
      await this.options.client.telegramChatMembership.findUnique({
        where: {
          chatId_userId: {
            chatId: collage.chatId,
            userId: context.principal.userId,
          },
        },
      });
    const freshAfter = Date.now() - 5 * 60_000;
    if (
      membership?.state !== "ACTIVE" ||
      !["ADMINISTRATOR", "CREATOR"].includes(membership.role) ||
      membership.lastSeenAt.getTime() < freshAfter
    ) {
      throw forbidden();
    }
  }

  private async member(context: RequestContext, collageId: string) {
    const member = await this.options.client.collageMember.findUnique({
      where: {
        collageId_userId: {
          collageId,
          userId: context.principal.userId,
        },
      },
    });
    if (member === null) {
      throw notFound("Registration");
    }
    return member;
  }

  async createCollage(
    context: RequestContext,
    input: unknown,
  ): Promise<ApiData> {
    const value = createCollageSchema.parse(input);
    const chat = await this.options.client.telegramChat.findUnique({
      where: { telegramChatId: value.telegramChatId },
    });
    if (chat === null) {
      throw new ApiError(
        409,
        "CHAT_NOT_SYNCED",
        "Open Collage from the group first.",
      );
    }
    const membership =
      await this.options.client.telegramChatMembership.findUnique({
        where: {
          chatId_userId: { chatId: chat.id, userId: context.principal.userId },
        },
      });
    if (
      membership?.state !== "ACTIVE" ||
      !["ADMINISTRATOR", "CREATOR"].includes(membership.role) ||
      membership.lastSeenAt.getTime() < Date.now() - 5 * 60_000
    ) {
      throw forbidden();
    }
    const rules = value.rules as Prisma.InputJsonValue;
    const collage = await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        const created = await transaction.collage.create({
          data: {
            chatId: chat.id,
            creatorUserId: context.principal.userId,
            name: value.name,
            description: value.description,
            contributionAmountMinor: value.contributionAmountMinor,
            participantLimit: value.participantLimit,
            frequency: value.frequency,
            frequencyInterval: value.frequencyInterval,
            timezone: value.timezone,
            firstCycleStartAt: new Date(value.firstCycleStartAt),
            cycleDeadlineOffsetMinutes: value.cycleDeadlineOffsetMinutes,
            gracePeriodMinutes: value.gracePeriodMinutes,
            payoutTiming: value.payoutTiming,
            cardSetupPolicy: value.cardSetupPolicy,
            cardSetupAmountMinor: value.cardSetupAmountMinor,
          },
        });
        await transaction.collageRuleVersion.create({
          data: {
            collageId: created.id,
            version: 1,
            deterministicHash: deterministicHash(value.rules),
            rules,
            createdByUserId: context.principal.userId,
          },
        });
        await appendAuditLog(transaction, {
          actorType: "USER",
          actorId: context.principal.userId,
          action: "collage.created",
          entityType: "collage",
          entityId: created.id,
          correlationId: context.requestId,
          source: "api",
          safeMetadata: { telegramChatId: value.telegramChatId },
        });
        return created;
      },
    );
    return asData(collage);
  }

  async getCollage(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    return asData(await this.collageForUser(context, collageId));
  }

  async updateCollage(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    await this.assertAdmin(context, collageId);
    const value = z
      .object({
        description: z.string().max(1_000).optional(),
        name: z.string().trim().min(2).max(120).optional(),
        rules: z.record(z.string(), z.unknown()).optional(),
        version: z.number().int().nonnegative(),
      })
      .parse(input);
    const updated = await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        const current = await transaction.collage.findUnique({
          where: { id: collageId },
        });
        if (current?.state !== "DRAFT" || current.version !== value.version) {
          return false;
        }
        const nextRuleVersion =
          value.rules === undefined
            ? current.currentRuleVersion
            : current.currentRuleVersion + 1;
        const changed = await transaction.collage.updateMany({
          where: { id: collageId, state: "DRAFT", version: value.version },
          data: {
            ...(value.name === undefined ? {} : { name: value.name }),
            ...(value.description === undefined
              ? {}
              : { description: value.description }),
            currentRuleVersion: nextRuleVersion,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          return false;
        }
        if (value.rules !== undefined) {
          await transaction.collageRuleVersion.create({
            data: {
              collageId,
              version: nextRuleVersion,
              deterministicHash: deterministicHash(value.rules),
              rules: value.rules as Prisma.InputJsonValue,
              createdByUserId: context.principal.userId,
            },
          });
        }
        return true;
      },
    );
    if (!updated) {
      throw conflict(
        "STALE_OR_LOCKED",
        "The Collage changed or is no longer editable.",
      );
    }
    return this.getCollage(context, collageId);
  }

  async openRegistration(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    await this.assertAdmin(context, collageId);
    const changed = await this.options.client.collage.updateMany({
      where: { id: collageId, state: "DRAFT" },
      data: { state: "REGISTRATION_OPEN", version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      throw conflict(
        "REGISTRATION_NOT_OPENED",
        "Registration cannot be opened from the current state.",
      );
    }
    return this.getStatus(context, collageId);
  }

  async getStatus(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    const collage = await this.collageForUser(context, collageId);
    const [members, currentCycle] = await Promise.all([
      this.options.client.collageMember.groupBy({
        by: ["state"],
        where: { collageId },
        _count: true,
      }),
      this.options.client.cycle.findFirst({
        where: { collageId, state: { not: "COMPLETED" } },
        orderBy: { number: "asc" },
      }),
    ]);
    return asData({ collage, memberCounts: members, currentCycle });
  }

  async getRules(context: RequestContext, collageId: string): Promise<ApiData> {
    const collage = await this.collageForUser(context, collageId);
    const rule = await this.options.client.collageRuleVersion.findUnique({
      where: {
        collageId_version: {
          collageId,
          version: collage.currentRuleVersion,
        },
      },
    });
    return asData(rule);
  }

  async getPositions(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    const collage = await this.collageForUser(context, collageId);
    const members = await this.options.client.collageMember.findMany({
      where: { collageId },
      select: {
        payoutPosition: true,
        state: true,
        telegramUserId: true,
      },
      orderBy: { payoutPosition: "asc" },
    });
    return asData({
      participantLimit: collage.participantLimit,
      positions: members,
    });
  }

  async getHistory(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    await this.collageForUser(context, collageId);
    return asData(
      await this.options.client.cycle.findMany({
        where: { collageId },
        include: { payout: { select: { id: true, state: true } } },
        orderBy: { number: "desc" },
      }),
    );
  }

  async requestReconciliation(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    await this.assertAdmin(context, collageId);
    const event = await this.options.client.$transaction((transaction) =>
      appendOutboxEvent(transaction, {
        eventType: "collage.reconciliation.requested",
        aggregateType: "collage",
        aggregateId: collageId,
        aggregateVersion: Date.now(),
        correlationId: context.requestId,
        payload: { collageId },
      }),
    );
    return asData({ queued: true, eventId: event.id });
  }

  async getRegistration(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    const member = await this.options.client.collageMember.findUnique({
      where: {
        collageId_userId: { collageId, userId: context.principal.userId },
      },
      include: {
        bankAccounts: {
          where: { isDefault: true },
          select: {
            id: true,
            bankName: true,
            maskedAccountNumber: true,
            state: true,
          },
        },
        paymentMethods: {
          where: { state: { in: ["ACTIVE", "AUTHORIZING"] } },
          select: { id: true, type: true, state: true, maskedLabel: true },
        },
      },
    });
    return asData(member ?? { state: "NOT_STARTED" });
  }

  async submitRegistrationDetails(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    const value = registrationSchema.parse(input);
    await this.collageForUser(context, collageId).catch(
      async (error: unknown) => {
        const collage = await this.options.client.collage.findUnique({
          where: { id: collageId },
        });
        if (collage === null) throw error;
      },
    );
    const identity =
      await this.options.client.telegramIdentity.findFirstOrThrow({
        where: { userId: context.principal.userId },
      });
    await reservePayoutPosition(this.options.client, {
      collageId,
      userId: context.principal.userId,
      position: value.payoutPosition,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    }).catch(() => {
      throw conflict(
        "POSITION_UNAVAILABLE",
        "That payout position is no longer available.",
      );
    });
    const member = await this.options.client.collageMember.upsert({
      where: {
        collageId_userId: { collageId, userId: context.principal.userId },
      },
      create: {
        collageId,
        userId: context.principal.userId,
        telegramUserId: identity.telegramUserId,
        state: "DETAILS_SUBMITTED",
        payoutPosition: value.payoutPosition,
        legalNameEncrypted: encryptString(
          value.legalName,
          this.options.encryption,
          `member:${collageId}:legal-name`,
        ),
        ninEncrypted: encryptString(
          value.nin,
          this.options.encryption,
          `member:${collageId}:nin`,
        ),
        ninHash: keyedHash(value.nin, this.options.hashKey),
        preferredChargeRule: value.preferredChargeRule as Prisma.InputJsonValue,
      },
      update: {
        payoutPosition: value.payoutPosition,
        legalNameEncrypted: encryptString(
          value.legalName,
          this.options.encryption,
          `member:${collageId}:legal-name`,
        ),
        ninEncrypted: encryptString(
          value.nin,
          this.options.encryption,
          `member:${collageId}:nin`,
        ),
        ninHash: keyedHash(value.nin, this.options.hashKey),
        preferredChargeRule: value.preferredChargeRule as Prisma.InputJsonValue,
        state: "DETAILS_SUBMITTED",
      },
    });
    return asData({
      id: member.id,
      state: member.state,
      payoutPosition: member.payoutPosition,
    });
  }

  async requestOtp(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    const value = z.object({ phone }).parse(input);
    const member = await this.member(context, collageId);
    const code = randomInt(100_000, 1_000_000).toString();
    const [, challenge] = await this.options.client.$transaction([
      this.options.client.otpChallenge.updateMany({
        where: {
          userId: context.principal.userId,
          purpose: `registration-phone:${collageId}`,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      }),
      this.options.client.otpChallenge.create({
        data: {
          userId: context.principal.userId,
          purpose: `registration-phone:${collageId}`,
          targetHash: keyedHash(value.phone, this.options.hashKey),
          codeHash: keyedHash(code, this.options.hashKey),
          expiresAt: new Date(Date.now() + this.options.otpTtlSeconds * 1_000),
        },
      }),
      this.options.client.collageMember.update({
        where: { id: member.id },
        data: {
          phoneEncrypted: encryptString(
            value.phone,
            this.options.encryption,
            `member:${collageId}:phone`,
          ),
          phoneHash: keyedHash(value.phone, this.options.hashKey),
        },
      }),
    ]);
    let delivery: { readonly outcome: "queued" | "unknown" };
    try {
      delivery = await this.options.otp.send({
        phone: value.phone,
        code,
        expiresInSeconds: this.options.otpTtlSeconds,
        idempotencyKey: challenge.id,
        purpose: "registration-phone",
      });
    } catch {
      await this.options.client.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new ApiError(
        503,
        "OTP_PROVIDER_UNAVAILABLE",
        "OTP delivery is temporarily unavailable.",
      );
    }
    if (delivery.outcome === "unknown") {
      throw new ApiError(
        503,
        "OTP_DELIVERY_UNKNOWN",
        "OTP delivery could not be confirmed. You may retry or use the code if it arrives.",
      );
    }
    return asData({
      accepted: true,
      expiresInSeconds: this.options.otpTtlSeconds,
    });
  }

  async verifyOtp(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    const value = z.object({ code: z.string().regex(/^\d{6}$/u) }).parse(input);
    const member = await this.member(context, collageId);
    const challenge = await this.options.client.otpChallenge.findFirst({
      where: {
        userId: context.principal.userId,
        purpose: `registration-phone:${collageId}`,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      challenge === null ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= challenge.maxAttempts
    ) {
      throw conflict("OTP_EXPIRED", "The OTP has expired.");
    }
    const valid = constantTimeEqual(
      challenge.codeHash,
      keyedHash(value.code, this.options.hashKey),
    );
    await this.options.client.otpChallenge.update({
      where: { id: challenge.id },
      data: valid ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
    });
    if (!valid) {
      throw new ApiError(400, "OTP_INVALID", "The OTP is invalid.");
    }
    const updated = await this.options.client.collageMember.update({
      where: { id: member.id },
      data: { phoneVerifiedAt: new Date(), state: "IDENTITY_PENDING" },
    });
    return asData({ state: updated.state, phoneVerified: true });
  }

  async confirmRules(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    const value = z
      .object({ ruleVersionId: uuid, recurringConsent: z.literal(true) })
      .parse(input);
    const member = await this.member(context, collageId);
    const rule = await this.options.client.collageRuleVersion.findFirst({
      where: { id: value.ruleVersionId, collageId },
    });
    if (rule === null)
      throw conflict("RULE_VERSION_STALE", "The rule version is stale.");
    const updated = await this.options.client.collageMember.update({
      where: { id: member.id },
      data: {
        acceptedRuleVersionId: rule.id,
        recurringConsentAt: new Date(),
      },
    });
    return asData({ acceptedRuleVersionId: updated.acceptedRuleVersionId });
  }

  private assertProviderEnabled(): void {
    if (!this.options.providerCallsEnabled) {
      throw new ApiError(
        503,
        "PROVIDER_CALLS_DISABLED",
        "Provider calls are disabled in this environment.",
      );
    }
  }

  async getBanks(): Promise<ApiData> {
    this.assertProviderEnabled();
    return asData(await this.options.monnify.getBanks());
  }

  async resolveBankAccount(
    _context: RequestContext,
    input: unknown,
  ): Promise<ApiData> {
    this.assertProviderEnabled();
    const value = bankSchema.parse(input);
    const resolved = await this.options.monnify.validateBankAccount(
      value.accountNumber,
      value.bankCode,
    );
    return asData({
      accountName: resolved.accountName,
      bankCode: resolved.bankCode,
      maskedAccountNumber: maskAccountNumber(resolved.accountNumber),
      resolutionToken: keyedHash(
        `${resolved.bankCode}:${resolved.accountNumber}:${resolved.accountName}`,
        this.options.hashKey,
      ),
    });
  }

  async getPayoutAccount(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    const member = await this.member(context, collageId);
    const bank = await this.options.client.bankAccount.findFirst({
      where: { memberId: member.id, isDefault: true },
      select: {
        id: true,
        bankCode: true,
        bankName: true,
        maskedAccountNumber: true,
        state: true,
        verifiedAt: true,
      },
    });
    return asData(bank);
  }

  async updatePayoutAccount(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    this.assertProviderEnabled();
    const value = bankSchema
      .extend({ resolutionToken: z.string().length(64) })
      .parse(input);
    const member = await this.member(context, collageId);
    const resolved = await this.options.monnify.validateBankAccount(
      value.accountNumber,
      value.bankCode,
    );
    const expected = keyedHash(
      `${resolved.bankCode}:${resolved.accountNumber}:${resolved.accountName}`,
      this.options.hashKey,
    );
    if (!constantTimeEqual(expected, value.resolutionToken)) {
      throw conflict(
        "BANK_RESOLUTION_STALE",
        "Resolve the account again before saving it.",
      );
    }
    const banks = await this.options.monnify.getBanks();
    const bankName = banks.find(({ code }) => code === value.bankCode)?.name;
    if (bankName === undefined)
      throw new ApiError(400, "BANK_UNSUPPORTED", "Bank is not supported.");
    const bank = await withSerializableTransaction(
      this.options.client,
      async (transaction) => {
        await transaction.bankAccount.updateMany({
          where: { memberId: member.id, isDefault: true },
          data: { isDefault: false, state: "REPLACED", replacedAt: new Date() },
        });
        return transaction.bankAccount.upsert({
          where: {
            memberId_accountNumberHash: {
              memberId: member.id,
              accountNumberHash: keyedHash(
                value.accountNumber,
                this.options.hashKey,
              ),
            },
          },
          create: {
            memberId: member.id,
            bankCode: value.bankCode,
            bankName,
            accountNumberEncrypted: encryptString(
              value.accountNumber,
              this.options.encryption,
              `member:${member.id}:bank-account`,
            ),
            accountNumberHash: keyedHash(
              value.accountNumber,
              this.options.hashKey,
            ),
            accountNameEncrypted: encryptString(
              resolved.accountName,
              this.options.encryption,
              `member:${member.id}:bank-name`,
            ),
            maskedAccountNumber: maskAccountNumber(value.accountNumber),
            state: "VERIFIED",
            isDefault: true,
            verifiedAt: new Date(),
          },
          update: {
            bankCode: value.bankCode,
            bankName,
            state: "VERIFIED",
            isDefault: true,
            replacedAt: null,
            verifiedAt: new Date(),
          },
        });
      },
    );
    return asData({
      id: bank.id,
      bankCode: bank.bankCode,
      bankName: bank.bankName,
      maskedAccountNumber: bank.maskedAccountNumber,
      state: bank.state,
    });
  }

  async setupCard(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    this.assertProviderEnabled();
    const value = cardSchema.parse(input);
    const member = await this.member(context, collageId);
    const collage = await this.options.client.collage.findUniqueOrThrow({
      where: { id: collageId },
    });
    const existing = await this.options.client.cardAuthorization.findUnique({
      where: { idempotencyKey: value.idempotencyKey },
      include: { paymentMethod: true },
    });
    if (existing !== null) {
      if (existing.paymentMethod.memberId !== member.id)
        throw conflict(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key is already in use.",
        );
      return asData({
        authorizationId: existing.id,
        checkoutUrl:
          existing.checkoutUrlEncrypted === null
            ? null
            : decryptString(
                existing.checkoutUrlEncrypted,
                this.options.encryption,
                `card-authorization:${existing.id}:checkout-url`,
              ),
        state: existing.state,
      });
    }
    const paymentReference = `card_${randomUUID()}`;
    const created = await this.options.client.paymentMethod.create({
      data: {
        memberId: member.id,
        type: "CARD_TOKEN",
        cardAuthorizations: {
          create: {
            setupAmountMinor: collage.cardSetupAmountMinor,
            idempotencyKey: value.idempotencyKey,
          },
        },
      },
      include: { cardAuthorizations: true },
    });
    const authorizationRecord = created.cardAuthorizations[0];
    if (authorizationRecord === undefined) {
      throw new Error("Card authorization was not created");
    }
    const checkout = await this.options.monnify.initializeCheckout({
      amountMinor: collage.cardSetupAmountMinor,
      customerEmail: value.customerEmail,
      metadata: {
        authorizationId: authorizationRecord.id,
        memberId: member.id,
      },
      paymentDescription: `Collage card setup for ${collage.name}`,
      paymentMethods: ["CARD"],
      paymentReference,
      redirectUrl: `${this.options.publicUrl}/payment-return`,
    });
    const authorization = await this.options.client.cardAuthorization.update({
      where: { id: authorizationRecord.id },
      data: {
        providerReference: checkout.paymentReference,
        checkoutUrlEncrypted: encryptString(
          checkout.checkoutUrl,
          this.options.encryption,
          `card-authorization:${authorizationRecord.id}:checkout-url`,
        ),
        state: "PENDING",
      },
    });
    await this.options.client.collageMember.update({
      where: { id: member.id },
      data: { state: "PAYMENT_METHOD_AUTHORIZING" },
    });
    return asData({
      authorizationId: authorization.id,
      checkoutUrl: checkout.checkoutUrl,
      state: authorization.state,
    });
  }

  async setupMandate(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    this.assertProviderEnabled();
    const value = mandateSchema.parse(input);
    const member = await this.member(context, collageId);
    const collage = await this.options.client.collage.findUniqueOrThrow({
      where: { id: collageId },
    });
    const mandateReference = `mandate_${value.idempotencyKey}`;
    const existing = await this.options.client.directDebitMandate.findUnique({
      where: { mandateReference },
    });
    if (existing !== null)
      return asData({ authorizationId: existing.id, state: existing.state });
    if (member.legalNameEncrypted === null || member.phoneEncrypted === null) {
      throw conflict(
        "REGISTRATION_DETAILS_REQUIRED",
        "Registration details are incomplete.",
      );
    }
    const paymentMethod = await this.options.client.paymentMethod.create({
      data: { memberId: member.id, type: "DIRECT_DEBIT" },
    });
    const mandate = await this.options.client.directDebitMandate.create({
      data: { paymentMethodId: paymentMethod.id, mandateReference },
    });
    const provider = await this.options.monnify.createMandate({
      amountMinor: collage.contributionAmountMinor,
      autoRenew: false,
      customerAccountBankCode: value.bankCode,
      customerAccountNumber: value.accountNumber,
      customerAddress: value.address,
      customerEmailAddress: value.customerEmail,
      customerName: decryptString(
        member.legalNameEncrypted,
        this.options.encryption,
        `member:${collageId}:legal-name`,
      ),
      customerPhoneNumber: decryptString(
        member.phoneEncrypted,
        this.options.encryption,
        `member:${collageId}:phone`,
      ),
      startDate: value.startDate,
      endDate: value.endDate,
      mandateDescription: `Collage mandate for ${collage.name}`,
      mandateReference,
    });
    const updated = await this.options.client.directDebitMandate.update({
      where: { id: mandate.id },
      data: {
        providerMandateId: provider.mandateCode ?? null,
        authorizationUrlEncrypted:
          provider.authorizationLink === undefined
            ? null
            : encryptString(
                provider.authorizationLink,
                this.options.encryption,
                `mandate:${mandate.id}:authorization-url`,
              ),
        mandateDataEncrypted: encryptString(
          JSON.stringify({
            bankCode: value.bankCode,
            accountNumber: value.accountNumber,
          }),
          this.options.encryption,
          `mandate:${mandate.id}:data`,
        ),
        state: provider.outcome === "activated" ? "SUCCEEDED" : "PENDING",
      },
    });
    return asData({
      authorizationId: updated.id,
      authorizationUrl: provider.authorizationLink ?? null,
      state: updated.state,
    });
  }

  async getAuthorization(
    context: RequestContext,
    authorizationId: string,
  ): Promise<ApiData> {
    const card = await this.options.client.cardAuthorization.findFirst({
      where: {
        id: authorizationId,
        paymentMethod: { member: { userId: context.principal.userId } },
      },
      select: {
        id: true,
        state: true,
        reusableTokenReady: true,
        expiresAt: true,
      },
    });
    if (card !== null) return asData(card);
    const mandate = await this.options.client.directDebitMandate.findFirst({
      where: {
        id: authorizationId,
        paymentMethod: { member: { userId: context.principal.userId } },
      },
      select: { id: true, state: true, activatedAt: true, expiresAt: true },
    });
    if (mandate === null) throw notFound("Authorization");
    return asData(mandate);
  }

  async verifyAuthorization(
    context: RequestContext,
    authorizationId: string,
  ): Promise<ApiData> {
    this.assertProviderEnabled();
    const card = await this.options.client.cardAuthorization.findFirst({
      where: {
        id: authorizationId,
        paymentMethod: { member: { userId: context.principal.userId } },
      },
      include: { paymentMethod: true },
    });
    if (card !== null) {
      if (card.providerReference === null) {
        throw conflict(
          "AUTHORIZATION_NOT_INITIALIZED",
          "Card authorization has not been initialized.",
        );
      }
      if (card.state === "SUCCEEDED") {
        return this.getAuthorization(context, authorizationId);
      }
      const verification =
        await this.options.monnify.verifyTransactionByPaymentReference(
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
        return asData({ id: card.id, state: verification.outcome });
      }
      if (
        verification.amountPaidMinor !== card.setupAmountMinor ||
        verification.currency !== card.currency ||
        verification.cardToken === undefined
      ) {
        throw conflict(
          "CARD_SETUP_VERIFICATION_MISMATCH",
          "The verified card setup does not match the authorization.",
        );
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
        ).catch(() => {
          throw conflict(
            "PAYMENT_METHOD_REPLACEMENT_UNSAFE",
            "The existing payment method cannot be replaced while an attempt is unresolved.",
          );
        });
      }
      await this.options.client.cardAuthorization.update({
        where: { id: card.id },
        data: { state: "SUCCEEDED", reusableTokenReady: true },
      });
      return this.getAuthorization(context, authorizationId);
    }

    const mandate = await this.options.client.directDebitMandate.findFirst({
      where: {
        id: authorizationId,
        paymentMethod: { member: { userId: context.principal.userId } },
      },
      include: { paymentMethod: true },
    });
    if (mandate === null) {
      throw notFound("Authorization");
    }
    const provider = await this.options.monnify.getMandateStatus(
      mandate.mandateReference,
    );
    if (provider.outcome === "activated") {
      const activation = {
        activeAt: new Date(),
        credentialEncrypted: encryptString(
          mandate.mandateReference,
          this.options.encryption,
          `payment-method:${mandate.paymentMethodId}:credential`,
        ),
        credentialHash: keyedHash(
          mandate.mandateReference,
          this.options.hashKey,
        ),
        maskedLabel: "Bank mandate",
      };
      const current = await this.options.client.paymentMethod.findFirst({
        where: {
          memberId: mandate.paymentMethod.memberId,
          state: "ACTIVE",
          id: { not: mandate.paymentMethodId },
        },
      });
      if (current === null) {
        await this.options.client.paymentMethod.update({
          where: { id: mandate.paymentMethodId },
          data: { state: "ACTIVE", ...activation },
        });
      } else {
        await activateReplacementPaymentMethod(
          this.options.client,
          mandate.paymentMethod.memberId,
          mandate.paymentMethodId,
          activation,
        ).catch(() => {
          throw conflict(
            "PAYMENT_METHOD_REPLACEMENT_UNSAFE",
            "The existing payment method cannot be replaced while an attempt is unresolved.",
          );
        });
      }
      await this.options.client.directDebitMandate.update({
        where: { id: mandate.id },
        data: { state: "SUCCEEDED", activatedAt: activation.activeAt },
      });
    } else if (
      ["authorization_expired", "expired", "cancelled", "failed"].includes(
        provider.outcome,
      )
    ) {
      await this.options.client.directDebitMandate.update({
        where: { id: mandate.id },
        data: {
          state:
            provider.outcome === "expired" ||
            provider.outcome === "authorization_expired"
              ? "EXPIRED"
              : "FAILED_TERMINAL",
        },
      });
    }
    return this.getAuthorization(context, authorizationId);
  }

  async initializeManualPayment(
    context: RequestContext,
    collageId: string,
    input: unknown,
  ): Promise<ApiData> {
    this.assertProviderEnabled();
    const value = manualSchema.parse(input);
    const member = await this.member(context, collageId);
    const contribution = await this.options.client.cycleContribution.findFirst({
      where: {
        memberId: member.id,
        cycle: {
          collageId,
          state: { in: ["COLLECTING", "OVERDUE", "BLOCKED_BY_DEFAULT"] },
        },
        state: {
          in: [
            "SCHEDULED",
            "FAILED_RETRYABLE",
            "MANUAL_PAYMENT_REQUIRED",
            "OVERDUE",
          ],
        },
      },
      orderBy: { cycle: { number: "asc" } },
    });
    if (contribution === null)
      throw conflict(
        "NO_PAYABLE_CONTRIBUTION",
        "No contribution is available for manual payment.",
      );
    const existing = await this.options.client.paymentAttempt.findUnique({
      where: { idempotencyKey: value.idempotencyKey },
    });
    if (existing !== null) {
      if (existing.contributionId !== contribution.id)
        throw conflict(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key is already in use.",
        );
      return asData({
        attemptId: existing.id,
        checkoutUrl:
          existing.providerPayloadEncrypted === null
            ? null
            : decryptString(
                existing.providerPayloadEncrypted,
                this.options.encryption,
                `payment-attempt:${existing.id}:checkout-url`,
              ),
        state: existing.state,
      });
    }
    const paymentReference = `manual_${randomUUID()}`;
    const attempt = await this.options.client.paymentAttempt.create({
      data: {
        contributionId: contribution.id,
        type: "MANUAL_CHECKOUT",
        providerEnvironment: this.options.providerEnvironment,
        providerReference: paymentReference,
        idempotencyKey: value.idempotencyKey,
        amountMinor: contribution.amountMinor,
        currency: contribution.currency,
      },
    });
    const checkout = await this.options.monnify.initializeCheckout({
      amountMinor: contribution.amountMinor,
      customerEmail: value.customerEmail,
      metadata: { attemptId: attempt.id, contributionId: contribution.id },
      paymentDescription: "Collage manual contribution",
      paymentReference,
      redirectUrl: `${this.options.publicUrl}/payment-return`,
    });
    await this.options.client.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        state: "PENDING",
        initiatedAt: new Date(),
        providerReference: checkout.paymentReference,
        providerPayloadEncrypted: encryptString(
          checkout.checkoutUrl,
          this.options.encryption,
          `payment-attempt:${attempt.id}:checkout-url`,
        ),
      },
    });
    return asData({
      attemptId: attempt.id,
      checkoutUrl: checkout.checkoutUrl,
      state: "PENDING",
    });
  }

  async getPaymentAttempt(
    context: RequestContext,
    attemptId: string,
  ): Promise<ApiData> {
    const attempt = await this.options.client.paymentAttempt.findFirst({
      where: {
        id: attemptId,
        contribution: { member: { userId: context.principal.userId } },
      },
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        state: true,
        initiatedAt: true,
        resolvedAt: true,
      },
    });
    if (attempt === null) throw notFound("Payment attempt");
    return asData(attempt);
  }

  async recheckPaymentAttempt(
    context: RequestContext,
    attemptId: string,
  ): Promise<ApiData> {
    await this.getPaymentAttempt(context, attemptId);
    const event = await this.options.client.$transaction((transaction) =>
      appendOutboxEvent(transaction, {
        eventType: "payment.status-check.requested",
        aggregateType: "payment-attempt",
        aggregateId: attemptId,
        aggregateVersion: Date.now(),
        correlationId: context.requestId,
        payload: { attemptId },
      }),
    );
    return asData({ queued: true, eventId: event.id });
  }

  async getPaymentMethod(
    context: RequestContext,
    collageId: string,
  ): Promise<ApiData> {
    const member = await this.member(context, collageId);
    return asData(
      await this.options.client.paymentMethod.findFirst({
        where: {
          memberId: member.id,
          state: { in: ["ACTIVE", "AUTHORIZING"] },
        },
        select: {
          id: true,
          type: true,
          state: true,
          maskedLabel: true,
          activeAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  replacePaymentMethod(
    context: RequestContext,
    collageId: string,
    kind: "card" | "direct-debit",
    input: unknown,
  ): Promise<ApiData> {
    return kind === "card"
      ? this.setupCard(context, collageId, input)
      : this.setupMandate(context, collageId, input);
  }

  async getPayout(
    context: RequestContext,
    collageId: string,
    payoutId: string,
  ): Promise<ApiData> {
    const member = await this.member(context, collageId);
    const payout = await this.options.client.payout.findFirst({
      where: { id: payoutId, memberId: member.id, cycle: { collageId } },
      include: {
        bankAccount: { select: { bankName: true, maskedAccountNumber: true } },
        attempts: {
          select: { id: true, state: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (payout === null) throw notFound("Payout");
    return asData(payout);
  }

  async updateRetryAccount(
    context: RequestContext,
    collageId: string,
    payoutId: string,
    input: unknown,
  ): Promise<ApiData> {
    const member = await this.member(context, collageId);
    const payout = await this.options.client.payout.findFirst({
      where: {
        id: payoutId,
        memberId: member.id,
        cycle: { collageId },
      },
    });
    if (payout?.state !== "FAILED")
      throw conflict(
        "PAYOUT_NOT_RETRYABLE",
        "Payout is not eligible for account replacement.",
      );
    const account = await this.updatePayoutAccount(context, collageId, input);
    const current = await this.options.client.bankAccount.findFirstOrThrow({
      where: { memberId: member.id, isDefault: true, state: "VERIFIED" },
    });
    await this.options.client.payout.update({
      where: { id: payoutId },
      data: { bankAccountId: current.id, version: { increment: 1 } },
    });
    return account;
  }

  async retryPayout(
    context: RequestContext,
    collageId: string,
    payoutId: string,
  ): Promise<ApiData> {
    const member = await this.member(context, collageId);
    const payout = await this.options.client.payout.findFirst({
      where: { id: payoutId, memberId: member.id, cycle: { collageId } },
      include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (
      payout?.state !== "FAILED" ||
      payout.attempts.some(({ state }) =>
        ["CREATED", "PENDING", "UNKNOWN"].includes(state),
      )
    ) {
      throw conflict(
        "PAYOUT_NOT_RETRYABLE",
        "An unresolved payout attempt cannot be retried.",
      );
    }
    const event = await this.options.client.$transaction((transaction) =>
      appendOutboxEvent(transaction, {
        eventType: "payout.retry.requested",
        aggregateType: "payout",
        aggregateId: payoutId,
        aggregateVersion: payout.version,
        correlationId: context.requestId,
        payload: { payoutId },
      }),
    );
    return asData({ queued: true, eventId: event.id });
  }

  async internalTelegram(
    operation: string,
    input: unknown,
    requestId: string,
  ): Promise<ApiData> {
    if (operation === "chats.upsert") {
      const value = z
        .object({
          telegramChatId: z.string().regex(/^-?\d+$/u),
          title: z.string().min(1).max(255),
          type: z.enum(["GROUP", "SUPERGROUP", "CHANNEL"]),
          username: z.string().max(64).optional(),
          botCanPinMessages: z.boolean().default(false),
        })
        .parse(input);
      return asData(
        await this.options.client.telegramChat.upsert({
          where: { telegramChatId: value.telegramChatId },
          create: { ...value, username: value.username ?? null },
          update: { ...value, username: value.username ?? null },
        }),
      );
    }
    if (operation === "chats.status-card") {
      const value = z
        .object({
          telegramChatId: z.string(),
          variant: z.enum(["status", "rules"]).default("status"),
        })
        .parse(input);
      const chat = await this.options.client.telegramChat.findUnique({
        where: { telegramChatId: value.telegramChatId },
        include: {
          collages: {
            where: { state: { not: "CANCELLED" } },
            orderBy: { createdAt: "desc" },
            include: {
              _count: { select: { members: true } },
              cycles: {
                orderBy: { number: "desc" },
                take: 1,
                include: { payout: { select: { state: true } } },
              },
            },
            take: 1,
          },
        },
      });
      if (chat === null) {
        throw notFound("Telegram chat");
      }
      const collage = chat.collages[0];
      if (collage === undefined) {
        const token = await this.options.launchTokens.issue(
          { action: "CREATE_COLLAGE", chatId: chat.id },
          new Date(Date.now() + 5 * 60_000),
        );
        return asData({
          state: "EMPTY",
          text: "No current Collage. An administrator can create one.",
          parseMode: "HTML",
          buttons: [
            {
              label: "Create Collage",
              startAppToken: token,
            },
          ],
          pin: true,
          replaceMessageId: chat.pinnedStatusMessageId,
        });
      }
      const token = await this.options.launchTokens.issue(
        {
          action: value.variant === "rules" ? "VIEW_RULES" : "VIEW_COLLAGE",
          chatId: chat.id,
          collageId: collage.id,
        },
        new Date(Date.now() + 5 * 60_000),
      );
      const cycle = collage.cycles[0];
      const payoutProcessing =
        cycle?.state === "PAYOUT_PROCESSING" ||
        (cycle?.payout !== null &&
          cycle?.payout !== undefined &&
          ["PROCESSING", "PENDING_AUTHORIZATION", "IN_PROGRESS"].includes(
            cycle.payout.state,
          ));
      const state = payoutProcessing ? "PAYOUT_PROCESSING" : collage.state;
      const statusText = `<b>${escapeTelegramHtml(collage.name)}</b>\nState: ${state}\nMembers: ${String(collage._count.members)}/${String(collage.participantLimit)}\nContribution: ${escapeTelegramHtml(collage.currency)} ${collage.contributionAmountMinor.toString()} minor units`;
      const rulesText = `<b>${escapeTelegramHtml(collage.name)} rules</b>\nContribution: ${escapeTelegramHtml(collage.currency)} ${collage.contributionAmountMinor.toString()} minor units\nFrequency: ${collage.frequency.toLowerCase()}\nParticipants: ${String(collage.participantLimit)}\nOpen Collage to review and consent to the complete immutable rules.`;
      return asData({
        state,
        text: value.variant === "rules" ? rulesText : statusText,
        parseMode: "HTML",
        buttons: [
          {
            label: value.variant === "rules" ? "Review rules" : "Open Collage",
            startAppToken: token,
          },
        ],
        pin: true,
        replaceMessageId: chat.pinnedStatusMessageId,
      });
    }
    if (operation === "messages.pinned") {
      const value = z
        .object({ telegramChatId: z.string(), messageId: z.string() })
        .parse(input);
      await this.options.client.telegramChat.update({
        where: { telegramChatId: value.telegramChatId },
        data: { pinnedStatusMessageId: value.messageId },
      });
      return asData({ updated: true });
    }
    if (operation === "actions.create-launch-token") {
      const value = z
        .object({
          action: z.string().min(1).max(64),
          chatId: uuid.optional(),
          collageId: uuid.optional(),
          userId: uuid.optional(),
        })
        .parse(input);
      const token = await this.options.launchTokens.issue(
        {
          action: value.action,
          ...(value.chatId === undefined ? {} : { chatId: value.chatId }),
          ...(value.collageId === undefined
            ? {}
            : { collageId: value.collageId }),
          ...(value.userId === undefined ? {} : { userId: value.userId }),
        },
        new Date(Date.now() + 5 * 60_000),
      );
      return asData({ token, expiresInSeconds: 300 });
    }
    if (operation === "events.bot-membership-changed") {
      const value = z
        .object({
          botCanPinMessages: z.boolean(),
          telegramChatId: z.string(),
        })
        .parse(input);
      const chat = await this.options.client.telegramChat.update({
        where: { telegramChatId: value.telegramChatId },
        data: { botCanPinMessages: value.botCanPinMessages },
      });
      return asData({
        botCanPinMessages: chat.botCanPinMessages,
        synchronized: true,
      });
    }
    const value = z
      .object({
        firstName: z.string().min(1).max(128).default("Telegram user"),
        telegramChatId: z.string(),
        telegramUserId: z.string(),
        role: z
          .enum([
            "MEMBER",
            "ADMINISTRATOR",
            "CREATOR",
            "RESTRICTED",
            "LEFT",
            "KICKED",
            "UNKNOWN",
          ])
          .default("MEMBER"),
      })
      .parse(input);
    const [chat, identity] = await Promise.all([
      this.options.client.telegramChat.findUnique({
        where: { telegramChatId: value.telegramChatId },
      }),
      this.options.client.telegramIdentity.upsert({
        where: { telegramUserId: value.telegramUserId },
        create: {
          telegramUserId: value.telegramUserId,
          firstName: value.firstName,
          user: { create: {} },
        },
        update: { firstName: value.firstName },
      }),
    ]);
    if (chat === null)
      throw conflict("TELEGRAM_ENTITY_NOT_SYNCED", "Chat is not synchronized.");
    const leaving = operation === "events.member-left";
    const existingMembership =
      await this.options.client.telegramChatMembership.findUnique({
        where: { chatId_userId: { chatId: chat.id, userId: identity.userId } },
        select: { state: true },
      });
    const newlyLeaving = leaving && existingMembership?.state !== "LEFT";
    const membership = await this.options.client.telegramChatMembership.upsert({
      where: { chatId_userId: { chatId: chat.id, userId: identity.userId } },
      create: {
        chatId: chat.id,
        userId: identity.userId,
        role: value.role,
        state: leaving ? "LEFT" : "ACTIVE",
        joinedAt: leaving ? null : new Date(),
        leftAt: leaving ? new Date() : null,
      },
      update: {
        role: value.role,
        state: leaving ? "LEFT" : "ACTIVE",
        leftAt: leaving ? new Date() : null,
        lastSeenAt: new Date(),
      },
    });
    await this.options.client.auditLog.create({
      data: {
        actorType: "SERVICE",
        actorId: "bot",
        action: operation,
        entityType: "telegram-membership",
        entityId: membership.id,
        correlationId: requestId,
        source: "internal-api",
        safeMetadata: {},
      },
    });
    let registeredMembers: readonly {
      readonly id: string;
      readonly state: string;
    }[] = [];
    if (newlyLeaving) {
      registeredMembers = await this.options.client.collageMember.findMany({
        where: {
          userId: identity.userId,
          collage: { chatId: chat.id },
        },
        select: { id: true, state: true },
      });
      await Promise.all(
        registeredMembers.map(({ id }) =>
          markMemberLeftTelegram(this.options.client, id, new Date()),
        ),
      );
    }
    const wasRegistered = registeredMembers.some(({ state }) =>
      ["REGISTERED", "AT_RISK", "DELINQUENT", "DEFAULTED"].includes(state),
    );
    return asData({
      membership,
      notification:
        newlyLeaving && wasRegistered
          ? {
              text: `<b>Registered member left</b>\n${escapeTelegramHtml(value.firstName)} left the Telegram group. Their Collage obligations remain in force and the cycle status will be reconciled.`,
              parseMode: "HTML",
              buttons: [],
            }
          : null,
    });
  }
}

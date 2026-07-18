import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";

import { createPrismaClient, PrismaLaunchTokenStore } from "@collage/database";
import type {
  AccountValidation,
  Bank,
  CheckoutInitialization,
  MandateResult,
  TransactionVerification,
} from "@collage/monnify";
import { LaunchTokenService } from "@collage/security";

import {
  DatabaseWorkflowService,
  type OtpProvider,
  type ProviderPort,
} from "./database-workflow.js";
import { ApiError } from "./errors.js";
import { SessionService } from "./session.js";
import { MonnifyWebhookIngress } from "./webhook-ingress.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;
const client =
  databaseUrl === undefined ? undefined : createPrismaClient(databaseUrl);

const requireClient = () => {
  if (client === undefined) {
    throw new Error("TEST_DATABASE_URL is required");
  }
  return client;
};

class FixtureProvider implements ProviderPort {
  checkoutCalls = 0;

  createMandate(): Promise<MandateResult> {
    return Promise.resolve({
      mandateReference: "fixture-mandate",
      outcome: "pending_authorization",
      rawStatus: "PENDING AUTHORIZATION",
    });
  }

  getBanks(): Promise<readonly Bank[]> {
    return Promise.resolve([{ code: "001", name: "Fixture Bank" }]);
  }

  getMandateStatus(): Promise<MandateResult> {
    return Promise.resolve({
      mandateReference: "fixture-mandate",
      outcome: "activated",
      rawStatus: "ACTIVE",
    });
  }

  initializeCheckout(
    input: Parameters<ProviderPort["initializeCheckout"]>[0],
  ): Promise<CheckoutInitialization> {
    this.checkoutCalls += 1;
    return Promise.resolve({
      checkoutUrl: "https://sandbox.monnify.com/checkout/fixture",
      paymentReference: input.paymentReference,
      transactionReference: "MNFY|fixture",
    });
  }

  validateBankAccount(
    account: string,
    bankCode: string,
  ): Promise<AccountValidation> {
    return Promise.resolve({
      accountName: "FIXTURE CUSTOMER",
      accountNumber: account,
      bankCode,
    });
  }

  verifyTransactionByPaymentReference(
    paymentReference: string,
  ): Promise<TransactionVerification> {
    return Promise.resolve({
      amountPaidMinor: 100n,
      cardToken: "fixture-token",
      currency: "NGN",
      outcome: "paid",
      paymentReference,
      rawStatus: "PAID",
      transactionReference: "MNFY|fixture",
    });
  }
}

before(async () => {
  await client?.$connect();
});

after(async () => {
  await client?.$disconnect();
});

const reset = async (): Promise<void> => {
  await requireClient().$executeRawUnsafe(`
    TRUNCATE TABLE
      "launch_tokens", "audit_logs", "notification_deliveries", "outbox_events",
      "webhook_events", "ledger_entries", "ledger_transactions", "ledger_accounts",
      "payout_attempts", "payouts", "payment_attempts", "cycle_contributions",
      "cycles", "direct_debit_mandates", "card_authorizations", "payment_methods",
      "bank_accounts", "otp_challenges", "payout_position_reservations",
      "collage_members", "collage_rule_versions", "collages",
      "telegram_chat_memberships", "telegram_chats", "telegram_identities", "users"
    RESTART IDENTITY CASCADE
  `);
};

const fixture = async (otpOutcome: "queued" | "unknown" = "queued") => {
  const database = requireClient();
  const user = await database.user.create({ data: {} });
  const identity = await database.telegramIdentity.create({
    data: {
      userId: user.id,
      telegramUserId: "70001",
      firstName: "Fixture",
    },
  });
  const chat = await database.telegramChat.create({
    data: {
      telegramChatId: "-10070001",
      type: "SUPERGROUP",
      title: "API integration fixture",
    },
  });
  const provider = new FixtureProvider();
  const otpMessages: Parameters<OtpProvider["send"]>[0][] = [];
  const service = new DatabaseWorkflowService({
    client: database,
    encryption: {
      activeKeyId: "test",
      keys: { test: Buffer.alloc(32, 1) },
    },
    hashKey: Buffer.alloc(32, 2),
    launchTokens: new LaunchTokenService(
      new PrismaLaunchTokenStore(database),
      Buffer.alloc(32, 3),
    ),
    miniAppUrl: "https://app.example.test",
    monnify: provider,
    otp: {
      send: (input) => {
        otpMessages.push(input);
        return Promise.resolve({ outcome: otpOutcome });
      },
    },
    otpTtlSeconds: 600,
    providerCallsEnabled: true,
    providerEnvironment: "sandbox",
    publicUrl: "https://api.example.test",
    sessions: new SessionService(Buffer.alloc(32, 4)),
    telegramBotToken: "fixture-bot-token",
  });
  return {
    chat,
    identity,
    otpMessages,
    provider,
    service,
    user,
    context: {
      principal: {
        userId: user.id,
        telegramUserId: identity.telegramUserId,
        exp: Math.floor(Date.now() / 1_000) + 900,
      },
      requestId: "integration-request",
    },
  };
};

const collageInput = {
  cardSetupAmountMinor: "100",
  cardSetupPolicy: "SANDBOX_SIMULATION",
  contributionAmountMinor: "100000",
  cycleDeadlineOffsetMinutes: 1_440,
  description: "Safe integration fixture",
  firstCycleStartAt: "2030-01-01T09:00:00.000Z",
  frequency: "MONTHLY",
  frequencyInterval: 1,
  gracePeriodMinutes: 1_440,
  name: "API fixture",
  participantLimit: 2,
  payoutTiming: "IMMEDIATE_WHEN_READY",
  rules: { version: 1 },
  telegramChatId: "-10070001",
  timezone: "Africa/Lagos",
};

void integrationTest(
  "requires a fresh current Telegram admin and reports state conflicts",
  async () => {
    await reset();
    const { chat, context, service, user } = await fixture();
    await assert.rejects(
      service.createCollage(context, collageInput),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
    await requireClient().telegramChatMembership.create({
      data: {
        chatId: chat.id,
        userId: user.id,
        role: "ADMINISTRATOR",
        state: "ACTIVE",
      },
    });
    const collage = (await service.createCollage(context, collageInput)) as {
      readonly id: string;
    };
    await service.openRegistration(context, collage.id);
    await assert.rejects(
      service.openRegistration(context, collage.id),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
  },
);

void integrationTest(
  "binds each SMS OTP to its persisted challenge ID and configured TTL",
  async () => {
    await reset();
    const { chat, context, otpMessages, service, user } = await fixture();
    await requireClient().telegramChatMembership.create({
      data: {
        chatId: chat.id,
        userId: user.id,
        role: "ADMINISTRATOR",
        state: "ACTIVE",
      },
    });
    const collage = (await service.createCollage(context, collageInput)) as {
      readonly id: string;
    };
    await service.openRegistration(context, collage.id);
    await service.submitRegistrationDetails(context, collage.id, {
      legalName: "Fixture Member",
      nin: "12345678901",
      payoutPosition: 1,
      preferredChargeRule: { type: "card" },
    });
    const result = (await service.requestOtp(context, collage.id, {
      phone: "+2348012345678",
    })) as { readonly accepted: boolean; readonly expiresInSeconds: number };
    const challenge = await requireClient().otpChallenge.findFirstOrThrow({
      where: { userId: user.id, consumedAt: null },
    });
    assert.equal(result.accepted, true);
    assert.equal(result.expiresInSeconds, 600);
    assert.equal(otpMessages.length, 1);
    const otpMessage = otpMessages[0];
    assert.ok(otpMessage);
    assert.equal(otpMessage.idempotencyKey, challenge.id);
    assert.equal(otpMessage.expiresInSeconds, 600);
    assert.equal(otpMessage.phone, "+2348012345678");
  },
);

void integrationTest(
  "keeps an OTP challenge usable when provider enqueue outcome is unknown",
  async () => {
    await reset();
    const { chat, context, service, user } = await fixture("unknown");
    await requireClient().telegramChatMembership.create({
      data: {
        chatId: chat.id,
        userId: user.id,
        role: "ADMINISTRATOR",
        state: "ACTIVE",
      },
    });
    const collage = (await service.createCollage(context, collageInput)) as {
      readonly id: string;
    };
    await service.openRegistration(context, collage.id);
    await service.submitRegistrationDetails(context, collage.id, {
      legalName: "Fixture Member",
      nin: "12345678901",
      payoutPosition: 1,
      preferredChargeRule: { type: "card" },
    });
    await assert.rejects(
      service.requestOtp(context, collage.id, {
        phone: "+2348012345678",
      }),
      (error: unknown) =>
        error instanceof ApiError && error.code === "OTP_DELIVERY_UNKNOWN",
    );
    const challenge = await requireClient().otpChallenge.findFirstOrThrow({
      where: { userId: user.id },
    });
    assert.equal(challenge.consumedAt, null);
  },
);

void integrationTest(
  "reuses a card authorization idempotency key without a second provider call",
  async () => {
    await reset();
    const { chat, context, identity, provider, service, user } =
      await fixture();
    await requireClient().telegramChatMembership.create({
      data: {
        chatId: chat.id,
        userId: user.id,
        role: "CREATOR",
        state: "ACTIVE",
      },
    });
    const collage = (await service.createCollage(context, collageInput)) as {
      readonly id: string;
    };
    await requireClient().collageMember.create({
      data: {
        collageId: collage.id,
        userId: user.id,
        telegramUserId: identity.telegramUserId,
        state: "PAYMENT_METHOD_REQUIRED",
        payoutPosition: 1,
      },
    });
    const input = {
      customerEmail: "fixture@example.test",
      idempotencyKey: "card-setup-idempotency-fixture",
    };
    const first = await service.setupCard(context, collage.id, input);
    const second = await service.setupCard(context, collage.id, input);
    assert.deepEqual(second, first);
    assert.equal(provider.checkoutCalls, 1);
    assert.equal(
      await requireClient().cardAuthorization.count({
        where: { idempotencyKey: input.idempotencyKey },
      }),
      1,
    );
  },
);

void integrationTest(
  "deduplicates a verified webhook and queues processing transactionally",
  async () => {
    await reset();
    const database = requireClient();
    const secretKey = "fixture-webhook-secret";
    const rawBody = Buffer.from(
      JSON.stringify({
        eventType: "SUCCESSFUL_TRANSACTION",
        eventData: { transactionReference: "MNFY|dedupe-fixture" },
      }),
    );
    const signature = createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");
    const ingress = new MonnifyWebhookIngress({
      allowedProductionIps: new Set(["35.242.133.146"]),
      allowUnsignedSandbox: false,
      client: database,
      encryption: {
        activeKeyId: "test",
        keys: { test: Buffer.alloc(32, 5) },
      },
      environment: "production",
      secretKey,
    });
    const input = {
      ip: "35.242.133.146",
      requestId: "webhook-integration",
      signature,
    };
    assert.deepEqual(await ingress.ingest(rawBody, input), {
      duplicate: false,
    });
    assert.deepEqual(await ingress.ingest(rawBody, input), {
      duplicate: true,
    });
    assert.equal(await database.webhookEvent.count(), 1);
    assert.equal(
      await database.outboxEvent.count({
        where: { eventType: "monnify.webhook.received" },
      }),
      1,
    );
  },
);

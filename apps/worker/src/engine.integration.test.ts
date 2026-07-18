import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  appendOutboxEvent,
  appendLedgerTransaction,
  createPrismaClient,
  withSerializableTransaction,
} from "@collage/database";
import { asMoneyMinor } from "@collage/domain";
import type { MonnifyClient, TransferResult } from "@collage/monnify";
import { encryptString } from "@collage/security";

import { WorkerEngine } from "./engine.js";
import { TransactionalOutboxPublisher } from "./outbox.js";
import type { JobScheduler, ScheduledJob } from "./ports.js";
import { DisabledWorkerProvider } from "./provider.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;
const client =
  databaseUrl === undefined ? undefined : createPrismaClient(databaseUrl);

class CapturingScheduler implements JobScheduler {
  readonly jobs: ScheduledJob[] = [];

  enqueue(job: ScheduledJob): Promise<void> {
    this.jobs.push(job);
    return Promise.resolve();
  }
}

class SuccessfulTransferProvider extends DisabledWorkerProvider {
  override initiateTransfer(
    input: Parameters<MonnifyClient["initiateTransfer"]>[0],
  ): Promise<TransferResult> {
    return Promise.resolve({
      amountMinor: input.amountMinor,
      outcome: "successful",
      rawStatus: "SUCCESS",
      reference: input.reference,
      transactionReference: "provider-transfer-fixture",
    });
  }
}

const requireClient = () => {
  if (client === undefined) throw new Error("TEST_DATABASE_URL is required");
  return client;
};

const scheduler = new CapturingScheduler();
const engine = (
  provider: DisabledWorkerProvider = new DisabledWorkerProvider(),
  providerEnabled = false,
) =>
  new WorkerEngine({
    client: requireClient(),
    encryption: { activeKeyId: "test", keys: { test: Buffer.alloc(32, 1) } },
    maximumChargeAttempts: 3,
    pendingPollMs: 1_000,
    provider,
    providerEnabled,
    providerEnvironment: "sandbox",
    providerRedirectUrl: "https://api.example.test/payment-return",
    scheduler,
    staleOperationMs: 60_000,
  });

before(async () => {
  await client?.$connect();
});

after(async () => {
  await client?.$disconnect();
});

beforeEach(async () => {
  scheduler.jobs.length = 0;
  if (client !== undefined) {
    await client.$executeRawUnsafe(`
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
  }
});

const createStartingCollage = async () => {
  const database = requireClient();
  const creator = await database.user.create({ data: {} });
  const chat = await database.telegramChat.create({
    data: {
      telegramChatId: `-${String(Date.now())}`,
      type: "SUPERGROUP",
      title: "Worker fixture",
    },
  });
  const collage = await database.collage.create({
    data: {
      chatId: chat.id,
      creatorUserId: creator.id,
      state: "STARTING",
      startedAt: new Date(),
      rulesLockedAt: new Date(),
      name: "Worker race",
      description: "No personal data",
      contributionAmountMinor: 10_000n,
      participantLimit: 2,
      frequency: "MONTHLY",
      timezone: "Africa/Lagos",
      firstCycleStartAt: new Date("2026-07-10T08:00:00.000Z"),
      cycleDeadlineOffsetMinutes: 2_880,
      gracePeriodMinutes: 1_440,
      payoutTiming: "IMMEDIATE_WHEN_READY",
      cardSetupPolicy: "SANDBOX_SIMULATION",
      cardSetupAmountMinor: 100n,
    },
  });
  const rule = await database.collageRuleVersion.create({
    data: {
      collageId: collage.id,
      version: 1,
      deterministicHash: "a".repeat(64),
      rules: { fixture: true },
      createdByUserId: creator.id,
      lockedAt: new Date(),
    },
  });
  for (const position of [1, 2]) {
    const user = await database.user.create({ data: {} });
    await database.collageMember.create({
      data: {
        collageId: collage.id,
        userId: user.id,
        telegramUserId: String(900_000 + position),
        state: "REGISTERED",
        payoutPosition: position,
        acceptedRuleVersionId: rule.id,
        legalNameEncrypted: "fixture",
        ninEncrypted: "fixture",
        ninHash: String(position).repeat(64),
        phoneEncrypted: "fixture",
        phoneHash: String(position + 2).repeat(64),
        phoneVerifiedAt: new Date(),
        identityVerifiedAt: new Date(),
        recurringConsentAt: new Date(),
        registeredAt: new Date(),
        preferredChargeRule: { kind: "DAILY", hour: 10, minute: 0 },
      },
    });
  }
  return { collage, chat };
};

void integrationTest(
  "concurrent start jobs create one immutable schedule and one start audit",
  async () => {
    const { collage } = await createStartingCollage();
    const worker = engine();
    const outcomes = await Promise.allSettled([
      worker.startCollage(collage.id, "race-a"),
      worker.startCollage(collage.id, "race-b"),
    ]);
    assert.ok(
      outcomes.some(({ status }) => status === "fulfilled"),
      "at least one concurrent delivery must commit",
    );
    await worker.startCollage(collage.id, "replay-after-race");
    assert.equal(
      await requireClient().cycle.count({ where: { collageId: collage.id } }),
      2,
    );
    assert.equal(
      await requireClient().cycleContribution.count({
        where: { cycle: { collageId: collage.id } },
      }),
      4,
    );
    assert.equal(
      await requireClient().auditLog.count({
        where: { entityId: collage.id, action: "collage.started" },
      }),
      1,
    );
  },
);

void integrationTest(
  "strict cycle blocks but preserves unresolved provider attempts for polling",
  async () => {
    const { collage } = await createStartingCollage();
    await engine().startCollage(collage.id, "start");
    const cycle = await requireClient().cycle.findFirstOrThrow({
      where: { collageId: collage.id, number: 1 },
      include: { contributions: true },
    });
    const owing = cycle.contributions[0];
    assert.ok(owing);
    await requireClient().cycleContribution.update({
      where: { id: owing.id },
      data: { state: "CHARGE_PENDING" },
    });
    await requireClient().paymentAttempt.create({
      data: {
        contributionId: owing.id,
        type: "DIRECT_DEBIT",
        providerEnvironment: "sandbox",
        providerReference: `pending_${owing.id}`,
        idempotencyKey: `pending:${owing.id}`,
        amountMinor: owing.amountMinor,
        state: "UNKNOWN",
      },
    });
    await engine().evaluateCycle(cycle.id, "grace");
    const [updatedCycle, updatedContribution] = await Promise.all([
      requireClient().cycle.findUniqueOrThrow({ where: { id: cycle.id } }),
      requireClient().cycleContribution.findUniqueOrThrow({
        where: { id: owing.id },
      }),
    ]);
    assert.equal(updatedCycle.state, "BLOCKED_BY_DEFAULT");
    assert.equal(updatedContribution.state, "CHARGE_PENDING");
  },
);

void integrationTest(
  "readiness race creates one payout only after paid totals and ledger agree",
  async () => {
    const { collage } = await createStartingCollage();
    const worker = engine();
    await worker.startCollage(collage.id, "start");
    const cycle = await requireClient().cycle.findFirstOrThrow({
      where: { collageId: collage.id, number: 1 },
      include: { contributions: true },
    });
    const accounts = await requireClient().ledgerAccount.findMany({
      where: { collageId: collage.id },
    });
    const pot = accounts.find(({ code }) => code === "COLLAGE_POT");
    const clearing = accounts.find(({ code }) => code === "PROVIDER_CLEARING");
    assert.ok(pot);
    assert.ok(clearing);
    await requireClient().$transaction(async (transaction) => {
      await transaction.cycleContribution.updateMany({
        where: { cycleId: cycle.id },
        data: { state: "PAID", paidAt: new Date() },
      });
      await transaction.cycle.update({
        where: { id: cycle.id },
        data: { confirmedAmountMinor: cycle.expectedAmountMinor },
      });
      await appendLedgerTransaction(transaction, {
        idempotencyKey: `test-pot:${cycle.id}`,
        correlationId: "test",
        referenceType: "TEST",
        referenceId: cycle.id,
        description: "Fixture verified contributions",
        currency: "NGN",
        entries: [
          {
            accountId: clearing.id,
            side: "DEBIT",
            amount: asMoneyMinor(cycle.expectedAmountMinor),
          },
          {
            accountId: pot.id,
            side: "CREDIT",
            amount: asMoneyMinor(cycle.expectedAmountMinor),
          },
        ],
      });
      const recipient = await transaction.collageMember.findUniqueOrThrow({
        where: { id: cycle.recipientMemberId },
      });
      await transaction.bankAccount.create({
        data: {
          memberId: recipient.id,
          bankCode: "999",
          bankName: "Fixture Bank",
          accountNumberEncrypted: encryptString(
            "0000000000",
            { activeKeyId: "test", keys: { test: Buffer.alloc(32, 1) } },
            `member:${recipient.id}:bank-account`,
          ),
          accountNumberHash: "b".repeat(64),
          accountNameEncrypted: encryptString(
            "Fixture Recipient",
            { activeKeyId: "test", keys: { test: Buffer.alloc(32, 1) } },
            `member:${recipient.id}:bank-name`,
          ),
          maskedAccountNumber: "******0000",
          state: "VERIFIED",
          isDefault: true,
          verifiedAt: new Date(),
        },
      });
    });
    await Promise.allSettled([
      worker.evaluateCycle(cycle.id, "ready-a"),
      worker.evaluateCycle(cycle.id, "ready-b"),
    ]);
    assert.equal(
      await requireClient().payout.count({ where: { cycleId: cycle.id } }),
      1,
    );
    const payout = await requireClient().payout.findUniqueOrThrow({
      where: { cycleId: cycle.id },
    });
    await engine(new SuccessfulTransferProvider(), true).initiatePayout(
      payout.id,
      "payout-success",
    );
    const [completed, next] = await Promise.all([
      requireClient().cycle.findUniqueOrThrow({ where: { id: cycle.id } }),
      requireClient().cycle.findUniqueOrThrow({
        where: {
          collageId_number: { collageId: collage.id, number: 2 },
        },
      }),
    ]);
    assert.equal(completed.state, "COMPLETED");
    assert.equal(next.state, "COLLECTING");
  },
);

void integrationTest(
  "one reminder contains every definitely owing member and excludes pending",
  async () => {
    const { collage } = await createStartingCollage();
    const worker = engine();
    await worker.startCollage(collage.id, "start");
    const cycle = await requireClient().cycle.findFirstOrThrow({
      where: { collageId: collage.id, number: 1 },
      include: { contributions: true },
    });
    const pending = cycle.contributions[0];
    assert.ok(pending);
    await requireClient().cycleContribution.update({
      where: { id: pending.id },
      data: { state: "CHARGE_PENDING" },
    });
    await requireClient().paymentAttempt.create({
      data: {
        contributionId: pending.id,
        type: "DIRECT_DEBIT",
        providerEnvironment: "sandbox",
        providerReference: `pending_${pending.id}`,
        idempotencyKey: `pending:${pending.id}`,
        amountMinor: pending.amountMinor,
        state: "PENDING",
      },
    });
    await worker.sendReminder(cycle.id, new Date());
    const notifications = scheduler.jobs.filter(
      ({ queue }) => queue === "telegram-notifications",
    );
    assert.equal(notifications.length, 1);
    assert.match(String(notifications[0]?.data.text), /provider payment/u);
    assert.doesNotMatch(
      String(notifications[0]?.data.text),
      new RegExp(pending.memberId, "u"),
    );
  },
);

void integrationTest(
  "outbox publication survives a crash and replays with the same job identity",
  async () => {
    const { collage } = await createStartingCollage();
    const event = await withSerializableTransaction(
      requireClient(),
      (transaction) =>
        appendOutboxEvent(transaction, {
          eventType: "collage.start.requested",
          aggregateType: "collage",
          aggregateId: collage.id,
          aggregateVersion: 1,
          correlationId: "outbox-test",
          payload: { collageId: collage.id },
        }),
    );
    let fail = true;
    const delivered: ScheduledJob[] = [];
    const publisher = new TransactionalOutboxPublisher(requireClient(), {
      enqueue(job) {
        if (fail) {
          fail = false;
          return Promise.reject(new Error("simulated Redis outage"));
        }
        delivered.push(job);
        return Promise.resolve();
      },
    });
    await assert.rejects(publisher.publishBatch());
    assert.equal(
      (
        await requireClient().outboxEvent.findUniqueOrThrow({
          where: { id: event.id },
        })
      ).publishedAt,
      null,
    );
    await publisher.publishBatch();
    assert.equal(delivered.length, 1);
    assert.ok(delivered[0]?.id.includes("start-collage"));
    assert.notEqual(
      (
        await requireClient().outboxEvent.findUniqueOrThrow({
          where: { id: event.id },
        })
      ).publishedAt,
      null,
    );
  },
);

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asMoneyMinor } from "@collage/domain";

import {
  appendAuditLog,
  appendLedgerTransaction,
  completeRegistration,
  createPrismaClient,
  reservePayoutPosition,
  withSerializableTransaction,
} from "./index.js";

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

before(async () => {
  if (client !== undefined) {
    await client.$connect();
  }
});

after(async () => {
  if (client !== undefined) {
    await client.$disconnect();
  }
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

const createBase = async (participantLimit = 2) => {
  const database = requireClient();
  const creator = await database.user.create({ data: {} });
  const chat = await database.telegramChat.create({
    data: {
      telegramChatId: `-${String(Date.now())}${String(Math.floor(Math.random() * 10_000))}`,
      type: "SUPERGROUP",
      title: "Integration fixture",
    },
  });
  const collage = await database.collage.create({
    data: {
      chatId: chat.id,
      creatorUserId: creator.id,
      state: "REGISTRATION_OPEN",
      name: "Race fixture",
      description: "Contains no real identity or payment data.",
      contributionAmountMinor: 100_000n,
      participantLimit,
      frequency: "MONTHLY",
      timezone: "Africa/Lagos",
      firstCycleStartAt: new Date("2030-01-01T09:00:00.000Z"),
      cycleDeadlineOffsetMinutes: 1_440,
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
      deterministicHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rules: { version: 1 },
      createdByUserId: creator.id,
    },
  });
  return { chat, collage, creator, rule };
};

void integrationTest(
  "partial unique index permits only one current Collage per chat under race",
  async () => {
    await reset();
    const database = requireClient();
    const creator = await database.user.create({ data: {} });
    const chat = await database.telegramChat.create({
      data: {
        telegramChatId: "-1000000000099",
        type: "SUPERGROUP",
        title: "Current Collage race",
      },
    });
    const data = {
      chatId: chat.id,
      creatorUserId: creator.id,
      state: "REGISTRATION_OPEN" as const,
      name: "Competing fixture",
      description: "Race",
      contributionAmountMinor: 100n,
      participantLimit: 2,
      frequency: "DAILY" as const,
      timezone: "Africa/Lagos",
      firstCycleStartAt: new Date("2030-01-01T09:00:00.000Z"),
      cycleDeadlineOffsetMinutes: 60,
      gracePeriodMinutes: 60,
      payoutTiming: "IMMEDIATE_WHEN_READY" as const,
      cardSetupPolicy: "SANDBOX_SIMULATION" as const,
      cardSetupAmountMinor: 1n,
    };
    const outcomes = await Promise.allSettled([
      database.collage.create({ data }),
      database.collage.create({ data: { ...data, name: "Other" } }),
    ]);
    assert.equal(
      outcomes.filter(({ status }) => status === "fulfilled").length,
      1,
    );
  },
);

void integrationTest(
  "only one contender wins the same payout position",
  async () => {
    await reset();
    const database = requireClient();
    const { collage } = await createBase();
    const [first, second] = await Promise.all([
      database.user.create({ data: {} }),
      database.user.create({ data: {} }),
    ]);
    const expiresAt = new Date(Date.now() + 60_000);
    const outcomes = await Promise.allSettled([
      reservePayoutPosition(database, {
        collageId: collage.id,
        userId: first.id,
        position: 1,
        expiresAt,
      }),
      reservePayoutPosition(database, {
        collageId: collage.id,
        userId: second.id,
        position: 1,
        expiresAt,
      }),
    ]);
    assert.equal(
      outcomes.filter(({ status }) => status === "fulfilled").length,
      1,
    );
  },
);

const createRegistrableMember = async (
  collageId: string,
  ruleId: string,
  position: number,
) => {
  const database = requireClient();
  const user = await database.user.create({ data: {} });
  const member = await database.collageMember.create({
    data: {
      collageId,
      userId: user.id,
      telegramUserId: String(100_000 + position),
      state: "PAYMENT_METHOD_AUTHORIZING",
      payoutPosition: position,
    },
  });
  await database.paymentMethod.create({
    data: {
      memberId: member.id,
      type: "CARD_TOKEN",
      state: "ACTIVE",
      activeAt: new Date(),
      credentialEncrypted: "encrypted-test-credential",
      credentialHash: "b".repeat(64),
      maskedLabel: "•••• 0000",
    },
  });
  await database.bankAccount.create({
    data: {
      memberId: member.id,
      bankCode: "000",
      bankName: "Test Bank",
      accountNumberEncrypted: "encrypted-test-account",
      accountNumberHash: "c".repeat(63) + String(position),
      accountNameEncrypted: "encrypted-test-name",
      maskedAccountNumber: "******0000",
      state: "VERIFIED",
      isDefault: true,
      verifiedAt: new Date(),
    },
  });
  return { member, ruleId };
};

const registrationEvidence = (ruleId: string) => ({
  acceptedRuleVersionId: ruleId,
  identityVerificationMode: "TEST_DOUBLE",
  identityVerifiedAt: new Date(),
  legalNameEncrypted: "encrypted-test-name",
  ninEncrypted: "encrypted-test-nin",
  ninHash: "d".repeat(64),
  phoneEncrypted: "encrypted-test-phone",
  phoneHash: "e".repeat(64),
  phoneVerifiedAt: new Date(),
  preferredChargeRule: { kind: "DAY_OF_MONTH", day: 1 },
  recurringConsentAt: new Date(),
});

void integrationTest(
  "registration race requests Collage start exactly once",
  async () => {
    await reset();
    const database = requireClient();
    const { collage, rule } = await createBase();
    const first = await createRegistrableMember(collage.id, rule.id, 1);
    const second = await createRegistrableMember(collage.id, rule.id, 2);
    const firstResult = await completeRegistration(
      database,
      first.member.id,
      registrationEvidence(rule.id),
      "registration-first",
    );
    assert.equal(firstResult.collageStarted, false);
    const outcomes = await Promise.allSettled([
      completeRegistration(
        database,
        second.member.id,
        registrationEvidence(rule.id),
        "registration-race-a",
      ),
      completeRegistration(
        database,
        second.member.id,
        registrationEvidence(rule.id),
        "registration-race-b",
      ),
    ]);
    assert.equal(
      outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" && outcome.value.collageStarted,
      ).length,
      1,
    );
    assert.equal(
      await database.outboxEvent.count({
        where: {
          aggregateId: collage.id,
          eventType: "collage.start.requested",
        },
      }),
      1,
    );
  },
);

void integrationTest(
  "database rejects unbalanced entries and immutable history mutation",
  async () => {
    await reset();
    const database = requireClient();
    const debit = await database.ledgerAccount.create({
      data: {
        key: "test:cash",
        code: "CASH",
        name: "Test cash",
        type: "ASSET",
      },
    });
    const credit = await database.ledgerAccount.create({
      data: {
        key: "test:pot",
        code: "COLLAGE_POT",
        name: "Test pot",
        type: "LIABILITY",
      },
    });
    const ledgerTransaction = await withSerializableTransaction(
      database,
      (transaction) =>
        appendLedgerTransaction(transaction, {
          idempotencyKey: "ledger:balanced",
          correlationId: "correlation",
          description: "Balanced fixture",
          currency: "NGN",
          referenceType: "TEST",
          referenceId: "fixture",
          entries: [
            {
              accountId: debit.id,
              side: "DEBIT",
              amount: asMoneyMinor(100n),
            },
            {
              accountId: credit.id,
              side: "CREDIT",
              amount: asMoneyMinor(100n),
            },
          ],
        }),
    );
    await assert.rejects(
      database.ledgerTransaction.update({
        where: { id: ledgerTransaction.id },
        data: { description: "mutated" },
      }),
    );
    await assert.rejects(
      database.$transaction(async (transaction) => {
        const unbalanced = await transaction.ledgerTransaction.create({
          data: {
            idempotencyKey: "ledger:unbalanced",
            correlationId: "correlation",
            description: "Must roll back",
            referenceType: "TEST",
            referenceId: "bad",
          },
        });
        await transaction.ledgerEntry.createMany({
          data: [
            {
              transactionId: unbalanced.id,
              accountId: debit.id,
              side: "DEBIT",
              amountMinor: 100n,
            },
            {
              transactionId: unbalanced.id,
              accountId: credit.id,
              side: "CREDIT",
              amountMinor: 99n,
            },
          ],
        });
      }),
    );
    const audit = await withSerializableTransaction(database, (transaction) =>
      appendAuditLog(transaction, {
        actorType: "SYSTEM",
        action: "test.recorded",
        entityType: "fixture",
        entityId: "fixture-id",
        correlationId: "correlation",
        source: "integration-test",
        safeMetadata: { safe: true },
      }),
    );
    await assert.rejects(database.auditLog.delete({ where: { id: audit.id } }));
  },
);

import { createPrismaClient } from "./client.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required for seed fixtures");
}

const prisma = createPrismaClient(databaseUrl);

const run = async (): Promise<void> => {
  const user = await prisma.user.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000001" },
  });
  const chat = await prisma.telegramChat.upsert({
    where: { telegramChatId: "-1000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      telegramChatId: "-1000000000001",
      type: "SUPERGROUP",
      title: "Local Collage Test Group",
    },
  });
  const collage = await prisma.collage.upsert({
    where: { id: "00000000-0000-4000-8000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000003",
      chatId: chat.id,
      creatorUserId: user.id,
      state: "DRAFT",
      name: "Safe local fixture",
      description: "Non-production fixture; contains no personal data.",
      contributionAmountMinor: 100_000n,
      participantLimit: 3,
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
  await prisma.collageRuleVersion.upsert({
    where: {
      collageId_version: { collageId: collage.id, version: 1 },
    },
    update: {},
    create: {
      collageId: collage.id,
      version: 1,
      deterministicHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rules: { fixture: true },
      createdByUserId: user.id,
    },
  });
};

try {
  await run();
} finally {
  await prisma.$disconnect();
}

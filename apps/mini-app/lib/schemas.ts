import { z } from "zod";

const nullableDate = z.iso.datetime().nullable().optional();
const money = z.string().regex(/^\d+$/u);

export const launchSchema = z
  .object({
    id: z.string(),
    action: z.string(),
    chatId: z.string().optional(),
    collageId: z.string().optional(),
    userId: z.string().optional(),
  })
  .nullable();

export const bootstrapSchema = z.object({
  sessionToken: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  user: z.object({
    id: z.string(),
    telegramUserId: z.string(),
    displayName: z.string(),
  }),
  launch: launchSchema,
  launchContext: z
    .object({
      telegramChatId: z.string(),
      groupTitle: z.string(),
    })
    .nullable()
    .optional(),
});

export const collageSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  state: z.string(),
  currency: z.literal("NGN"),
  contributionAmountMinor: money,
  participantLimit: z.number().int().positive(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  frequencyInterval: z.number().int().positive(),
  timezone: z.string(),
  firstCycleStartAt: z.iso.datetime(),
  cycleDeadlineOffsetMinutes: z.number().int().nonnegative(),
  gracePeriodMinutes: z.number().int().nonnegative(),
  payoutTiming: z.string(),
  cardSetupPolicy: z.string(),
  cardSetupAmountMinor: money,
  currentRuleVersion: z.number().int().positive(),
  version: z.number().int().nonnegative(),
  chat: z
    .object({
      title: z.string(),
      telegramChatId: z.string(),
    })
    .optional(),
});

export const cycleSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  state: z.string(),
  amountPerMemberMinor: money,
  expectedAmountMinor: money,
  confirmedAmountMinor: money,
  opensAt: z.iso.datetime(),
  deadlineAt: z.iso.datetime(),
  payout: z.object({ id: z.string(), state: z.string() }).nullable().optional(),
});

export const statusSchema = z.object({
  collage: collageSchema,
  memberCounts: z.array(
    z.object({ state: z.string(), _count: z.number().int().nonnegative() }),
  ),
  currentCycle: cycleSchema.nullable(),
});

export const registrationSchema = z.union([
  z.object({ state: z.literal("NOT_STARTED") }),
  z.object({
    id: z.string(),
    state: z.string(),
    payoutPosition: z.number().int().positive().nullable(),
    phoneVerifiedAt: nullableDate,
    acceptedRuleVersionId: z.string().nullable().optional(),
    recurringConsentAt: nullableDate,
    bankAccounts: z
      .array(
        z.object({
          id: z.string(),
          bankName: z.string(),
          maskedAccountNumber: z.string(),
          state: z.string(),
        }),
      )
      .optional(),
    paymentMethods: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          state: z.string(),
          maskedLabel: z.string().nullable(),
          authorizationId: z.string().nullable().optional(),
        }),
      )
      .optional(),
  }),
]);

export const ruleSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  rules: z.record(z.string(), z.unknown()),
  deterministicHash: z.string(),
});

export const positionsSchema = z.object({
  participantLimit: z.number().int().positive(),
  positions: z.array(
    z.object({
      payoutPosition: z.number().int().positive(),
      state: z.string(),
      telegramUserId: z.string(),
    }),
  ),
});

export const bankSchema = z.object({ code: z.string(), name: z.string() });
export const banksSchema = z.array(bankSchema);

export const resolvedAccountSchema = z.object({
  accountName: z.string(),
  bankCode: z.string(),
  maskedAccountNumber: z.string(),
  resolutionToken: z.string(),
});

export const paymentSetupSchema = z.object({
  authorizationId: z.string(),
  checkoutUrl: z.url().nullable().optional(),
  authorizationUrl: z.url().nullable().optional(),
  state: z.string(),
});

export const authorizationSchema = z.object({
  id: z.string(),
  state: z.string(),
  reusableTokenReady: z.boolean().optional(),
  activatedAt: nullableDate,
  expiresAt: nullableDate,
});

export const paymentAttemptSchema = z.object({
  id: z.string(),
  amountMinor: money,
  currency: z.literal("NGN"),
  state: z.string(),
  initiatedAt: nullableDate,
  resolvedAt: nullableDate,
});

export const manualSetupSchema = z.object({
  attemptId: z.string(),
  checkoutUrl: z.url().nullable(),
  state: z.string(),
});

export const historySchema = z.array(cycleSchema);

export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type Collage = z.infer<typeof collageSchema>;
export type Registration = z.infer<typeof registrationSchema>;
export type ResolvedAccount = z.infer<typeof resolvedAccountSchema>;
export type Status = z.infer<typeof statusSchema>;

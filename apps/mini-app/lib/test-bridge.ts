"use client";

import type { ZodType } from "zod";

import { ApiError, type ApiTransport } from "./api";

const collageId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-07-18T12:00:00.000Z");
const nextWeek = new Date("2026-07-25T18:00:00.000Z");

interface BridgeState {
  authorizationPolls: number;
  paymentPolls: number;
  registrationState: string;
}

const state: BridgeState = {
  authorizationPolls: 0,
  paymentPolls: 0,
  registrationState: "NOT_STARTED",
};

const collage = {
  id: collageId,
  name: "December Builders",
  description: "A steady weekly contribution for our building goals.",
  state: "REGISTRATION_OPEN",
  currency: "NGN",
  contributionAmountMinor: "2000000",
  participantLimit: 10,
  frequency: "WEEKLY",
  frequencyInterval: 1,
  timezone: "Africa/Lagos",
  firstCycleStartAt: now.toISOString(),
  cycleDeadlineOffsetMinutes: 7200,
  gracePeriodMinutes: 1440,
  payoutTiming: "IMMEDIATE_WHEN_READY",
  cardSetupPolicy: "COMMITMENT_DEPOSIT",
  cardSetupAmountMinor: "10000",
  currentRuleVersion: 1,
  version: 2,
  chat: {
    title: "Builders Community",
    telegramChatId: "-1001234567890",
  },
};

const cycle = {
  id: "22222222-2222-4222-8222-222222222222",
  number: 3,
  state: "COLLECTING",
  amountPerMemberMinor: "2000000",
  expectedAmountMinor: "20000000",
  confirmedAmountMinor: "14000000",
  opensAt: now.toISOString(),
  deadlineAt: nextWeek.toISOString(),
  payout: null,
};

const body = (options: RequestInit): Record<string, unknown> => {
  if (typeof options.body !== "string") return {};
  const parsed: unknown = JSON.parse(options.body);
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
};

export class TestBridgeTransport implements ApiTransport {
  constructor(private readonly scenario: string) {}

  async request<T>(
    path: string,
    schema: ZodType<T>,
    options: RequestInit = {},
  ): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 60));
    const result = this.resolve(path, options);
    return schema.parse(result);
  }

  private resolve(path: string, options: RequestInit): unknown {
    if (path === "/auth/telegram/bootstrap") {
      if (this.scenario === "invalid")
        throw new ApiError(
          401,
          "TELEGRAM_INIT_DATA_INVALID",
          "Telegram Mini App authentication failed.",
        );
      if (this.scenario === "expired")
        throw new ApiError(
          401,
          "LAUNCH_TOKEN_INVALID",
          "The Mini App launch token is invalid or expired.",
        );
      if (this.scenario === "unauthorized")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "This Telegram account cannot use this action.",
        );
      const action =
        this.scenario === "create"
          ? "CREATE_COLLAGE"
          : this.scenario === "wrong-action"
            ? "UNSUPPORTED_ACTION"
            : this.scenario === "manual"
              ? "PAY_CONTRIBUTION"
              : this.scenario === "payout"
                ? "RETRY_PAYOUT"
                : this.scenario === "join" ||
                    this.scenario === "resume-payment" ||
                    this.scenario === "full" ||
                    this.scenario === "closed" ||
                    this.scenario === "registered"
                  ? "JOIN_COLLAGE"
                  : "VIEW_COLLAGE";
      return {
        sessionToken: "test-session",
        expiresInSeconds: 900,
        user: {
          id: "33333333-3333-4333-8333-333333333333",
          telegramUserId: "123456789",
          displayName: "Ada Okafor",
        },
        launch: {
          id: "launch-test",
          action,
          collageId: action === "CREATE_COLLAGE" ? undefined : collageId,
          chatId: "44444444-4444-4444-8444-444444444444",
        },
        launchContext: {
          telegramChatId: "-1001234567890",
          groupTitle: "Builders Community",
        },
      };
    }
    if (path === `/collages/${collageId}`)
      return this.scenario === "closed"
        ? { ...collage, state: "ACTIVE" }
        : collage;
    if (path === `/collages/${collageId}/status`) {
      const scenarioState =
        this.scenario === "full"
          ? "REGISTRATION_OPEN"
          : this.scenario === "closed"
            ? "ACTIVE"
            : collage.state;
      return {
        collage: { ...collage, state: scenarioState },
        memberCounts:
          this.scenario === "full"
            ? [{ state: "REGISTERED", _count: 10 }]
            : [{ state: "REGISTERED", _count: 6 }],
        currentCycle:
          this.scenario === "status" ||
          this.scenario === "manual" ||
          this.scenario === "payout"
            ? cycle
            : null,
      };
    }
    if (path === `/collages/${collageId}/me/registration`) {
      if (this.scenario === "resume-payment") {
        return {
          id: "member-test",
          state:
            state.registrationState === "REGISTERED"
              ? "REGISTERED"
              : "PAYMENT_METHOD_REQUIRED",
          payoutPosition: 4,
          phoneVerifiedAt: now.toISOString(),
          acceptedRuleVersionId: "rule-test",
          recurringConsentAt: now.toISOString(),
          bankAccounts: [
            {
              id: "bank-test",
              bankName: "Access Bank",
              maskedAccountNumber: "******7890",
              state: "VERIFIED",
            },
          ],
          paymentMethods:
            state.registrationState === "REGISTERED"
              ? [
                  {
                    id: "method-test",
                    type: "DIRECT_DEBIT",
                    state: "ACTIVE",
                    maskedLabel: "Access Bank ••••7890",
                  },
                ]
              : [],
        };
      }
      if (this.scenario === "registered") {
        return {
          id: "member-test",
          state: "REGISTERED",
          payoutPosition: 4,
          phoneVerifiedAt: now.toISOString(),
          acceptedRuleVersionId: "rule-test",
          recurringConsentAt: now.toISOString(),
          bankAccounts: [
            {
              id: "bank-test",
              bankName: "Access Bank",
              maskedAccountNumber: "******7890",
              state: "VERIFIED",
            },
          ],
          paymentMethods: [
            {
              id: "method-test",
              type: "CARD_TOKEN",
              state: "ACTIVE",
              maskedLabel: "Saved card",
            },
          ],
        };
      }
      if (state.registrationState !== "NOT_STARTED") {
        return {
          id: "member-test",
          state: state.registrationState,
          payoutPosition: 4,
          phoneVerifiedAt:
            state.registrationState === "DETAILS_SUBMITTED"
              ? null
              : now.toISOString(),
          acceptedRuleVersionId:
            state.registrationState === "PAYMENT_METHOD_REQUIRED"
              ? "rule-test"
              : null,
          recurringConsentAt:
            state.registrationState === "PAYMENT_METHOD_REQUIRED"
              ? now.toISOString()
              : null,
          bankAccounts:
            state.registrationState === "PAYMENT_METHOD_REQUIRED"
              ? [
                  {
                    id: "bank-test",
                    bankName: "Access Bank",
                    maskedAccountNumber: "******7890",
                    state: "VERIFIED",
                  },
                ]
              : [],
          paymentMethods: [],
        };
      }
      return { state: "NOT_STARTED" };
    }
    if (path.endsWith("/registrations/details")) {
      state.registrationState = "DETAILS_SUBMITTED";
      return {
        id: "member-test",
        state: "DETAILS_SUBMITTED",
        payoutPosition: 4,
      };
    }
    if (path.endsWith("/registrations/phone/request-otp"))
      return { accepted: true, expiresInSeconds: 300 };
    if (path.endsWith("/registrations/phone/verify")) {
      if (body(options).code !== "123456")
        throw new ApiError(400, "OTP_INVALID", "The OTP is invalid.");
      state.registrationState = "IDENTITY_PENDING";
      return { state: "IDENTITY_PENDING", phoneVerified: true };
    }
    if (path.endsWith("/registrations/confirm-rules")) {
      state.registrationState = "PAYMENT_METHOD_REQUIRED";
      return { acceptedRuleVersionId: "rule-test" };
    }
    if (path === `/collages/${collageId}/rules`)
      return {
        id: "rule-test",
        version: 1,
        deterministicHash: "rule-hash",
        rules: {
          strictCycle: true,
          leavingDoesNotCancelObligations: true,
          payoutOrderLockedAtStart: true,
        },
      };
    if (path === `/collages/${collageId}/positions`)
      return {
        participantLimit: 10,
        positions: [
          {
            payoutPosition: 1,
            state: "REGISTERED",
            telegramUserId: "111",
          },
          {
            payoutPosition: 2,
            state: "REGISTERED",
            telegramUserId: "222",
          },
        ],
      };
    if (path === "/banks")
      return [
        { code: "044", name: "Access Bank" },
        { code: "058", name: "Guaranty Trust Bank" },
        { code: "057", name: "Zenith Bank" },
      ];
    if (path === "/bank-accounts/resolve") {
      const bankCode = body(options).bankCode;
      return {
        accountName: "ADA OKAFOR",
        bankCode: typeof bankCode === "string" ? bankCode : "044",
        maskedAccountNumber: "******7890",
        resolutionToken: "a".repeat(64),
      };
    }
    if (path.endsWith("/me/payout-account"))
      return {
        id: "bank-test",
        bankCode: "044",
        bankName: "Access Bank",
        maskedAccountNumber: "******7890",
        state: "VERIFIED",
      };
    if (
      path.endsWith("/payment-methods/card/setup") ||
      path.endsWith("/payment-methods/replace/card")
    )
      return {
        authorizationId: "authorization-test",
        checkoutUrl: "https://checkout.example.test/card",
        state: "PENDING",
      };
    if (
      path.endsWith("/payment-methods/direct-debit/setup") ||
      path.endsWith("/payment-methods/replace/direct-debit")
    )
      return {
        authorizationId: "authorization-test",
        authorizationUrl: "https://checkout.example.test/mandate",
        state: "PENDING",
      };
    if (path === "/payment-authorizations/authorization-test") {
      state.authorizationPolls += 1;
      if (state.authorizationPolls >= 3) state.registrationState = "REGISTERED";
      return {
        id: "authorization-test",
        state: state.authorizationPolls >= 3 ? "SUCCEEDED" : "PENDING",
        reusableTokenReady: state.authorizationPolls >= 3,
        activatedAt: state.authorizationPolls >= 3 ? now.toISOString() : null,
        expiresAt: null,
      };
    }
    if (path === "/payment-authorizations/authorization-test/verify")
      return {
        id: "authorization-test",
        state: "PENDING",
        reusableTokenReady: false,
      };
    if (path.endsWith("/cycles/current/payments/manual"))
      return {
        attemptId: "attempt-test",
        checkoutUrl: "https://checkout.example.test/manual",
        state: "PENDING",
      };
    if (path === "/payment-attempts/attempt-test") {
      state.paymentPolls += 1;
      return {
        id: "attempt-test",
        amountMinor: "2000000",
        currency: "NGN",
        state: state.paymentPolls >= 3 ? "SUCCEEDED" : "PENDING",
        initiatedAt: now.toISOString(),
        resolvedAt: state.paymentPolls >= 3 ? new Date().toISOString() : null,
      };
    }
    if (path === `/collages/${collageId}/history`)
      return [
        { ...cycle, state: "COMPLETED", number: 2 },
        {
          ...cycle,
          id: "cycle-one",
          state: "COMPLETED",
          number: 1,
          payout: { id: "payout-one", state: "SUCCEEDED" },
        },
      ];
    if (path === "/collages") return { ...collage, state: "DRAFT" };
    if (path.endsWith("/open-registration"))
      return {
        collage: { ...collage, state: "REGISTRATION_OPEN" },
        memberCounts: [],
        currentCycle: null,
      };
    if (path.endsWith("/payouts/payout-test/retry-account"))
      return {
        id: "bank-test",
        bankCode: "044",
        bankName: "Access Bank",
        maskedAccountNumber: "******7890",
        state: "VERIFIED",
      };
    if (path.endsWith("/payouts/payout-test/retry"))
      return { queued: true, eventId: "payout-retry-event" };
    if (path.includes("/payouts/"))
      return {
        id: "payout-test",
        state: "FAILED",
        amountMinor: "20000000",
        currency: "NGN",
        cycle,
        bankAccount: {
          bankName: "Access Bank",
          maskedAccountNumber: "******7890",
        },
        attempts: [{ id: "payout-attempt", state: "FAILED_TERMINAL" }],
      };
    throw new ApiError(
      404,
      "TEST_ROUTE_MISSING",
      `No bridge fixture for ${path}`,
    );
  }
}

export const resetTestBridge = (): void => {
  state.authorizationPolls = 0;
  state.paymentPolls = 0;
  state.registrationState = "NOT_STARTED";
};

export { collageId as testCollageId };

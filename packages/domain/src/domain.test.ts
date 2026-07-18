import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asMoneyMinor,
  calculateCycleSchedule,
  calculateMemberChargeAt,
  calculateOutstandingObligation,
  canCompleteRegistration,
  canInitiatePayout,
  canRetryPayout,
  canStartCollage,
  evaluatePaymentMethodReplacement,
  formatMoneyDecimal,
  memberStateAfterLeavingTelegram,
  parseMoneyDecimal,
  transitionCollage,
  transitionPayout,
  validateBalancedLedgerCommand,
} from "./index.js";

void describe("money", () => {
  void it("round-trips NGN decimal strings without floating point", () => {
    const amount = parseMoneyDecimal("20000.50");
    assert.equal(amount, 2_000_050n);
    assert.equal(formatMoneyDecimal(amount), "20000.50");
  });

  void it("rejects unsupported precision and negatives", () => {
    assert.throws(() => parseMoneyDecimal("10.001"), {
      name: "DomainInvariantError",
    });
    assert.throws(() => asMoneyMinor(-1n), {
      name: "DomainInvariantError",
    });
  });
});

void describe("state machines", () => {
  void it("permits documented transitions and rejects terminal regression", () => {
    assert.equal(
      transitionCollage("DRAFT", "REGISTRATION_OPEN"),
      "REGISTRATION_OPEN",
    );
    assert.equal(transitionPayout("SUCCESSFUL", "REVERSED"), "REVERSED");
    assert.throws(() => transitionCollage("COMPLETED", "ACTIVE"), {
      name: "DomainInvariantError",
    });
  });
});

void describe("schedule calculations", () => {
  void it("generates daily, weekly, monthly, and yearly cycles", () => {
    for (const frequency of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const) {
      const cycles = calculateCycleSchedule({
        firstCycleStart: "2028-01-31T08:00:00Z",
        frequency,
        interval: 1,
        participantCount: 3,
        deadlineOffsetMinutes: 40 * 24 * 60,
        timeZone: "Africa/Lagos",
      });
      assert.equal(cycles.length, 3);
      assert.equal(cycles[2]?.recipientPosition, 3);
      const firstCycle = cycles[0];
      const secondCycle = cycles[1];
      assert.ok(firstCycle !== undefined && secondCycle !== undefined);
      assert.ok(secondCycle.opensAt.getTime() > firstCycle.opensAt.getTime());
    }
  });

  void it("constrains invalid yearly dates and calculates last weekday", () => {
    const cycles = calculateCycleSchedule({
      firstCycleStart: "2028-02-01T00:00:00Z",
      frequency: "MONTHLY",
      interval: 1,
      participantCount: 2,
      deadlineOffsetMinutes: 31 * 24 * 60,
      timeZone: "Africa/Lagos",
    });
    const cycle = cycles[0];
    assert.ok(cycle !== undefined);

    const lastFriday = calculateMemberChargeAt(cycle, "Africa/Lagos", {
      kind: "MONTHLY",
      ordinal: "last",
      weekday: 5,
      hour: 9,
      minute: 0,
    });
    assert.equal(lastFriday.toISOString(), "2028-02-25T08:00:00.000Z");

    const leapDay = calculateMemberChargeAt(
      {
        opensAt: new Date("2027-01-01T00:00:00Z"),
        deadlineAt: new Date("2027-12-31T23:59:59Z"),
      },
      "Africa/Lagos",
      { kind: "YEARLY", month: 2, day: 29, hour: 9, minute: 0 },
    );
    assert.equal(leapDay.toISOString(), "2027-02-28T08:00:00.000Z");
  });

  void it("rejects a preferred charge outside the cycle window", () => {
    assert.throws(
      () =>
        calculateMemberChargeAt(
          {
            opensAt: new Date("2028-01-01T08:00:00Z"),
            deadlineAt: new Date("2028-01-01T09:00:00Z"),
          },
          "Africa/Lagos",
          { kind: "DAILY", hour: 12, minute: 0 },
        ),
      { name: "DomainInvariantError" },
    );
  });
});

void describe("financial invariants", () => {
  void it("requires all registration evidence and exactly-filled positions", () => {
    assert.equal(
      canCompleteRegistration({
        acceptedCurrentRuleVersion: true,
        activePaymentMethod: true,
        identityVerified: true,
        payoutAccountVerified: true,
        phoneVerified: true,
        positionAssigned: true,
      }),
      true,
    );
    assert.equal(
      canStartCollage({
        collageState: "REGISTRATION_OPEN",
        participantLimit: 3,
        registeredMemberCount: 3,
        uniqueFilledPositions: 3,
      }),
      true,
    );
  });

  void it("enforces strict payout readiness and terminal retry eligibility", () => {
    assert.equal(
      canInitiatePayout({
        contributionStates: ["PAID", "PAID", "PAID"],
        cycleExpectedAmount: asMoneyMinor(300_000n),
        ledgerPotBalance: asMoneyMinor(300_000n),
        payoutAccountVerified: true,
        unresolvedPayoutAttempt: false,
      }),
      true,
    );
    assert.equal(canRetryPayout("FAILED", false), true);
    assert.equal(canRetryPayout("IN_PROGRESS", false), false);
    assert.equal(canRetryPayout("FAILED", true), false);
  });

  void it("keeps the old payment method active until replacement activates", () => {
    assert.deepEqual(
      evaluatePaymentMethodReplacement({
        currentState: "ACTIVE",
        replacementState: "AUTHORIZING",
        unresolvedCharge: false,
      }),
      {
        allowed: true,
        deactivateCurrent: false,
        nextCurrentState: "ACTIVE",
      },
    );
  });

  void it("preserves leave-group obligations and subtracts credits", () => {
    assert.equal(memberStateAfterLeavingTelegram("REGISTERED"), "AT_RISK");
    assert.equal(
      calculateOutstandingObligation({
        contributionAmount: asMoneyMinor(100_000n),
        totalCycles: 10,
        confirmedContributions: 3,
        credits: [asMoneyMinor(50_000n)],
      }),
      650_000n,
    );
  });

  void it("rejects an unbalanced ledger command", () => {
    assert.throws(
      () =>
        validateBalancedLedgerCommand({
          correlationId: "correlation",
          currency: "NGN",
          description: "Test transaction",
          idempotencyKey: "collection:1",
          referenceType: "CONTRIBUTION",
          referenceId: "contribution",
          entries: [
            { accountId: "cash", amount: asMoneyMinor(100n), side: "DEBIT" },
            { accountId: "pot", amount: asMoneyMinor(99n), side: "CREDIT" },
          ],
        }),
      { name: "DomainInvariantError" },
    );
  });
});

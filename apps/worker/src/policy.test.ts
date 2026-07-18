import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyPaymentOutcome,
  classifyProviderFailure,
  classifyTransferOutcome,
  evaluateDeadline,
} from "./policy.js";

void describe("worker financial policies", () => {
  void it("polls unknown outcomes and never converts them into retries", () => {
    assert.deepEqual(classifyPaymentOutcome("unknown", 1, 3, 30_000), {
      kind: "poll",
      delayMs: 30_000,
    });
    assert.equal(
      classifyProviderFailure(
        {
          code: "TIMEOUT",
          kind: "timeout",
          message: "uncertain",
          retryable: true,
        },
        30_000,
      ).kind,
      "poll",
    );
  });

  void it("falls back to manual payment after bounded automatic failures", () => {
    assert.equal(classifyPaymentOutcome("failed", 3, 3, 30_000).kind, "manual");
  });

  void it("keeps pending and MFA transfers in polling", () => {
    assert.equal(
      classifyTransferOutcome("pending_authorization", 60_000).kind,
      "poll",
    );
  });

  void it("blocks only after grace and becomes ready only when paid", () => {
    const deadlineAt = new Date("2030-01-02T00:00:00.000Z");
    const graceEndsAt = new Date("2030-01-03T00:00:00.000Z");
    assert.equal(
      evaluateDeadline({
        allPaid: false,
        now: new Date("2030-01-02T12:00:00.000Z"),
        deadlineAt,
        graceEndsAt,
      }),
      "overdue",
    );
    assert.equal(
      evaluateDeadline({
        allPaid: false,
        now: graceEndsAt,
        deadlineAt,
        graceEndsAt,
      }),
      "blocked",
    );
  });
});

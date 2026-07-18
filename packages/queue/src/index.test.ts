import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultJobOptions,
  deterministicJobId,
  payoutJobSchema,
  telegramNotificationJobSchema,
} from "./index.js";

void test("deterministic job IDs are stable, opaque, and BullMQ-safe", () => {
  const first = deterministicJobId("payout-reconcile", "sensitive-reference");
  assert.equal(
    first,
    deterministicJobId("payout-reconcile", "sensitive-reference"),
  );
  assert.doesNotMatch(first, /:/u);
  assert.doesNotMatch(first, /sensitive/u);
  assert.notEqual(
    first,
    deterministicJobId("payout-reconcile", "another-reference"),
  );
});

void test("job schemas reject malformed identifiers and retries are bounded", () => {
  assert.equal(
    payoutJobSchema.safeParse({ payoutId: "not-a-uuid" }).success,
    false,
  );
  assert.equal(defaultJobOptions.attempts, 5);
});

void test("Telegram notification jobs accept only approved event and delivery shapes", () => {
  assert.equal(
    telegramNotificationJobSchema.safeParse({
      deliveryId: "81b9e36a-a491-4688-8697-cbe8cb747c30",
      type: "payout.succeeded",
      operation: "send-group-message",
      telegramChatId: "-100123",
      text: "<b>Payout complete</b>",
      parseMode: "HTML",
      buttons: [],
    }).success,
    true,
  );
  assert.equal(
    telegramNotificationJobSchema.safeParse({
      deliveryId: "81b9e36a-a491-4688-8697-cbe8cb747c30",
      type: "provider.unknown",
      operation: "send-group-message",
      telegramChatId: "-100123",
      text: "Unsafe",
      parseMode: "HTML",
    }).success,
    false,
  );
});

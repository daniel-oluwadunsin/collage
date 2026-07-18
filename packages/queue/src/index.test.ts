import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultJobOptions,
  deterministicJobId,
  payoutJobSchema,
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

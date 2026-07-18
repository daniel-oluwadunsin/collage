import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMoney,
  successfulAuthorizationStates,
  terminalAuthorizationStates,
  terminalPaymentStates,
} from "./format";

void test("formats BigInt minor-unit strings without accepting provider floats", () => {
  assert.equal(formatMoney("2000000"), "₦20,000");
  assert.equal(formatMoney("10001"), "₦100.01");
  assert.equal(formatMoney("900719925474099300"), "₦9,007,199,254,740,993");
});

void test("polling sets stop only on explicit terminal states", () => {
  assert.equal(terminalAuthorizationStates.has("PENDING"), false);
  assert.equal(terminalAuthorizationStates.has("UNKNOWN"), false);
  assert.equal(terminalAuthorizationStates.has("SUCCEEDED"), true);
  assert.equal(successfulAuthorizationStates.has("FAILED_TERMINAL"), false);
  assert.equal(terminalPaymentStates.has("REVERSED"), true);
});

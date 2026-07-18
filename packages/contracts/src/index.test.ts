import assert from "node:assert/strict";
import { test } from "node:test";

import { serializeForDto, telegramStatusCardSchema } from "./index.js";

void test("serializes BigInt money as a lossless decimal string", () => {
  assert.deepEqual(
    serializeForDto({
      amountMinor: 9_007_199_254_740_993n,
      at: new Date("2026-07-18T00:00:00.000Z"),
    }),
    {
      amountMinor: "9007199254740993",
      at: "2026-07-18T00:00:00.000Z",
    },
  );
});

void test("Telegram status cards use API-issued launch tokens rather than raw app URLs", () => {
  const card = telegramStatusCardSchema.parse({
    state: "PAYOUT_PROCESSING",
    text: "<b>Payout processing</b>",
    parseMode: "HTML",
    buttons: [
      {
        label: "Open Collage",
        startAppToken: "opaque_launch_token_123456789",
      },
    ],
    pin: true,
    replaceMessageId: "77",
  });
  assert.equal(card.state, "PAYOUT_PROCESSING");
  assert.equal(
    card.buttons[0] === undefined ? false : "startAppToken" in card.buttons[0],
    true,
  );
});

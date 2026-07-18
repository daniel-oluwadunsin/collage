import assert from "node:assert/strict";
import { test } from "node:test";

import { serializeForDto } from "./index.js";

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

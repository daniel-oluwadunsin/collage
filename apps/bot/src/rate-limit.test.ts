import assert from "node:assert/strict";
import { it } from "node:test";

import type { ApiCallFn } from "grammy";

import { createTelegramRateLimitTransformer } from "./rate-limit.js";

void it("retries Telegram 429 responses only for the documented retry_after", async () => {
  let calls = 0;
  const waits: number[] = [];
  const previous = (() => {
    calls += 1;
    return Promise.resolve(
      calls === 1
        ? {
            ok: false,
            error_code: 429,
            description: "Too Many Requests",
            parameters: { retry_after: 2 },
          }
        : { ok: true, result: true },
    );
  }) as ApiCallFn;
  const transformer = createTelegramRateLimitTransformer({
    maxRetries: 2,
    wait: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });
  const result = await transformer(previous, "setWebhook", { url: "" });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2_000]);
});

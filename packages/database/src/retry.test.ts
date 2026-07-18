import assert from "node:assert/strict";
import { test } from "node:test";

import { withSerializationRetry } from "./retry.js";

void test("retries serialization conflicts with bounded backoff", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withSerializationRetry(
    () => {
      calls += 1;
      if (calls < 3) {
        return Promise.reject(
          Object.assign(new Error("serialization conflict"), { code: "P2034" }),
        );
      }
      return Promise.resolve("committed");
    },
    {
      attempts: 3,
      baseDelayMilliseconds: 2,
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    },
  );
  assert.equal(result, "committed");
  assert.deepEqual(delays, [2, 4]);
});

void test("does not retry unknown errors", async () => {
  let calls = 0;
  await assert.rejects(
    withSerializationRetry(() => {
      calls += 1;
      return Promise.reject(new Error("validation"));
    }),
    /validation/u,
  );
  assert.equal(calls, 1);
});

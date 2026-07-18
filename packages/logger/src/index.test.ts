import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";

import { createLogger } from "./index.js";

void test("redacts credentials, identity data, and authorization headers", () => {
  const chunks: string[] = [];
  const destination = new Writable({
    write(
      chunk: Buffer | string,
      _encoding: BufferEncoding,
      callback: (error?: Error | null) => void,
    ) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = createLogger("security-test", { destination });
  logger.info({
    req: {
      headers: { authorization: "Bearer secret" },
      body: { nin: "12345678901", accountNumber: "0123456789" },
    },
  });
  const output = chunks.join("");
  assert.doesNotMatch(output, /12345678901|0123456789|Bearer secret/u);
  assert.match(output, /\[REDACTED\]/u);
});

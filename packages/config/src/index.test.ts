import assert from "node:assert/strict";
import { test } from "node:test";

import { apiEnvironmentSchema } from "./index.js";

const valid = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/collage",
  REDIS_URL: "redis://localhost:6379",
  API_PUBLIC_URL: "https://api.example.test",
  TELEGRAM_BOT_TOKEN: "test-only-bot-token",
  APP_ENCRYPTION_KEY_ID: "local-v1",
  APP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 1).toString("base64"),
  APP_HASH_PEPPER: "k".repeat(32),
  INTERNAL_SERVICE_TOKEN: "i".repeat(32),
  LAUNCH_TOKEN_HASH_SECRET: "l".repeat(32),
};

void test("parses service environment with provider calls disabled by default", () => {
  const parsed = apiEnvironmentSchema.parse(valid);
  assert.equal(parsed.PROVIDER_CALLS_ENABLED, false);
  assert.equal(parsed.API_PORT, 4000);
});

void test("rejects short secrets and malformed encryption keys", () => {
  assert.equal(
    apiEnvironmentSchema.safeParse({
      ...valid,
      INTERNAL_SERVICE_TOKEN: "short",
      APP_ENCRYPTION_KEY_BASE64: "not-a-key",
    }).success,
    false,
  );
});

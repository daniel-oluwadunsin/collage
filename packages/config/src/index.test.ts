import assert from "node:assert/strict";
import { test } from "node:test";

import { apiEnvironmentSchema } from "./index.js";

const valid = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/collage",
  REDIS_URL: "redis://localhost:6379",
  API_PUBLIC_URL: "https://api.example.test",
  API_SESSION_SECRET: "s".repeat(32),
  CORS_ALLOWED_ORIGINS: "https://app.example.test",
  MINI_APP_PUBLIC_URL: "https://app.example.test",
  TELEGRAM_BOT_TOKEN: "test-only-bot-token",
  MONNIFY_BASE_URL: "https://sandbox.monnify.com",
  MONNIFY_API_KEY: "",
  MONNIFY_SECRET_KEY: "",
  MONNIFY_CONTRACT_CODE: "",
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

void test("requires SMSGate credentials when selected", () => {
  assert.equal(
    apiEnvironmentSchema.safeParse({
      ...valid,
      OTP_PROVIDER: "smsgate",
    }).success,
    false,
  );
  const parsed = apiEnvironmentSchema.parse({
    ...valid,
    OTP_PROVIDER: "smsgate",
    SMSGATE_USERNAME: "fixture-user",
    SMSGATE_PASSWORD: "fixture-password",
  });
  assert.equal(parsed.SMSGATE_PRIORITY, 100);
  assert.equal(parsed.OTP_TTL_SECONDS, 600);
});

void test("rejects public-cloud and non-HTTPS SMSGate for production OTP", () => {
  const production = {
    ...valid,
    NODE_ENV: "production",
    MONNIFY_SECRET_KEY: "fixture-monnify-secret",
    OTP_PROVIDER: "smsgate",
    SMSGATE_USERNAME: "fixture-user",
    SMSGATE_PASSWORD: "fixture-password",
  };
  assert.equal(apiEnvironmentSchema.safeParse(production).success, false);
  assert.equal(
    apiEnvironmentSchema.safeParse({
      ...production,
      SMSGATE_DEPLOYMENT_MODE: "private",
      SMSGATE_API_BASE_URL: "http://sms.example.test/api/3rdparty/v1",
    }).success,
    false,
  );
  assert.equal(
    apiEnvironmentSchema.safeParse({
      ...production,
      SMSGATE_DEPLOYMENT_MODE: "private",
      SMSGATE_API_BASE_URL: "https://sms.example.test/api/3rdparty/v1",
    }).success,
    true,
  );
});

void test("requires Basic authentication for the Android Local Server", () => {
  const local = {
    ...valid,
    OTP_PROVIDER: "smsgate",
    SMSGATE_DEPLOYMENT_MODE: "local",
    SMSGATE_API_BASE_URL: "http://192.168.1.20:8080",
    SMSGATE_USERNAME: "fixture-user",
    SMSGATE_PASSWORD: "fixture-password",
  };
  assert.equal(apiEnvironmentSchema.safeParse(local).success, false);
  assert.equal(
    apiEnvironmentSchema.safeParse({
      ...local,
      SMSGATE_AUTH_MODE: "basic",
    }).success,
    true,
  );
});
